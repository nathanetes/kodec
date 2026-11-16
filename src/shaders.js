// Kodec shader sources. Every pass carries the picture with its transparency (premultiplied RGBA),
// so text and cut-outs stay cut out all the way to the export.
//   PLACE   the source set on the canvas: scale, position, rotation
//   WARP    scan drag, warp, misregistration and the pre grade
//   GLITCH  four glitch slots (the same ones as Atlas CRT, with Erase in place of Freeze)
//   FINISH  ink edges, glow, grade, colour effects, print, screen, texture, transparency, background
// The helpers, warp shapes, grade, colour effects, stipple, halftone, grain and dust come from Atlas CRT.
(function () {
  const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const COMMON = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + 1.0), f.x), f.y);
}
float vnoise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec3 hue2rgb(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
vec3 triad(float x) { vec3 c = 0.5 + 0.5 * cos(6.2831853 * (x - vec3(0.0, 0.33333, 0.66667))); return c * c; }
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toGam(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
// the colour under a premultiplied pixel
vec3 unpre(vec4 c) { return c.a > 0.0005 ? c.rgb / c.a : vec3(0.0); }
const mat3 RGB2YIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
const mat3 YIQ2RGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
// the basic grade, shared by Pre Grade and Color Grade: exposure in stops (on linear light),
// contrast around mid-grey, brightness, hue, saturation, then white balance
vec3 basicGrade(vec3 c, float ev, float br, float co, float sa, float te, float ti, float hu) {
  if (abs(ev) > 0.001) c = toGam(toLin(c) * exp2(ev));
  c = max((c - 0.5) * co + 0.5 + br, 0.0);
  if (abs(hu) > 0.5) { vec3 y = RGB2YIQ * c; y.yz = rot(radians(hu)) * y.yz; c = YIQ2RGB * y; }
  c = max(mix(vec3(lum(c)), c, sa), 0.0);
  return c * vec3(1.0 + 0.22 * te, 1.0 - 0.18 * ti, 1.0 - 0.22 * te);
}
`;

  // ---------------------------------------------------------------- place
  // The source on the canvas. It fits inside (or fills) the canvas, then Scale, Position and
  // Rotation move it. Everything outside the source is transparent.
  const PLACE = COMMON + `
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uAspect, uSrcAspect;
uniform float u_pScale, u_pX, u_pY, u_pRot, u_pFit;
void main() {
  vec2 p = (vUv - 0.5 - vec2(u_pX, u_pY) * 0.5) * vec2(uAspect, 1.0);
  float sc = max(u_pScale, 0.001);
  p = rot(radians(u_pRot)) * p / sc;
  bool wide = uSrcAspect > uAspect;
  if (u_pFit > 0.5) wide = !wide;
  vec2 box = wide ? vec2(uAspect, uAspect / uSrcAspect) : vec2(uSrcAspect, 1.0);
  vec2 q = p / box + 0.5;
  vec2 e = (0.5 - abs(q - 0.5)) * box * uRes.y * sc;
  o = texture(uTex, q) * clamp(min(e.x, e.y) + 0.5, 0.0, 1.0);
}`;

  // ---------------------------------------------------------------- warp
  const WARP = COMMON + `
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime, uAspect;
uniform float u_warp, u_warpType, u_warpScale, u_warpSpeed, u_warpTurb, u_warpStutter, u_warpEdge;
uniform float u_drag, u_dragAxis, u_dragScale, u_dragJerk, u_dragSmear, u_dragSkew, u_dragJitter, u_dragSpeed, u_dragSeed;
uniform float u_split, u_splitAngle;
uniform float u_preExp, u_preBright, u_preContrast, u_preSat, u_preTemp, u_preTint, u_preHue;

// Edges: what a warp finds when it reaches past the picture. Transparent, the edge pixels extended,
// the picture mirrored, or tiled. The mip level comes from the unwrapped position, so a mirror or
// tile seam doesn't draw a line.
vec4 samp(vec2 uv) {
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  int e = int(u_warpEdge + 0.5);
  float m = 1.0;
  if (e == 0) { vec2 d = (0.5 - abs(uv - 0.5)) * uRes; m = clamp(min(d.x, d.y) + 0.5, 0.0, 1.0); }
  else if (e == 2) uv = 1.0 - abs(1.0 - mod(uv, 2.0));
  else if (e == 3) uv = fract(uv);
  return textureGrad(uSrc, clamp(uv, 0.0, 1.0), gx, gy) * m;
}

// Warp: pushes the whole picture around. Scale is the size of the shapes, Turbulence how tangled
// they get, and Stutter steps time so the motion jerks.
vec2 warpUv(vec2 uv, float t) {
  if (u_warpStutter > 0.001) { float r = mix(30.0, 3.0, u_warpStutter); t = floor(t * r) / r; }
  t *= u_warpSpeed;
  int ty = int(u_warpType + 0.5);
  float s = mix(1.0, 14.0, u_warpScale), a = u_warp * 0.12, turb = u_warpTurb;
  vec2 q = uv * vec2(uAspect, 1.0) * s, d = uv - 0.5;
  float r = length(d * vec2(uAspect, 1.0));
  if (ty == 0) {          // flow: noise pushed around by more noise
    vec2 w = vec2(vnoise(q + t), vnoise(q.yx - t + 5.2));
    w = vec2(vnoise(q + w * (1.0 + 4.0 * turb) + t * 0.7), vnoise(q.yx + w * (1.0 + 4.0 * turb) + 3.1)) - 0.5;
    return uv + w * a * 2.0;
  }
  if (ty == 1) return uv + a * 0.6 * vec2(sin(q.y * 2.0 + t * 3.0 + 3.0 * turb * sin(q.x * 1.3 + t)), sin(q.x * 2.0 - t * 2.0 + 3.0 * turb * sin(q.y * 1.7 - t)));
  if (ty == 2) return uv + vec2(a * sin(q.y * 3.0 + t * 4.0) * (1.0 + turb * 2.0 * (vnoise(q * 3.0 + t) - 0.5)), 0.0);
  if (ty == 3) return uv + vec2(0.0, a * sin(q.x * 3.0 + t * 4.0) * (1.0 + turb * 2.0 * (vnoise(q * 3.0 - t) - 0.5)));
  if (ty == 4) return uv + d / max(r, 0.001) * a * 0.5 * sin(r * s * 6.0 - t * 5.0) * (1.0 + turb * sin(atan(d.y, d.x) * 5.0 + t));
  if (ty == 5) return 0.5 + rot(u_warp * 7.0 * (1.0 + turb * sin(t)) * pow(max(1.0 - r, 0.0), 2.0)) * d;
  if (ty == 6) {          // mirror fold: the picture folds over itself
    float n = 1.0 + floor(u_warp * 6.0);
    vec2 f = abs(fract(uv * n * 0.5 + vec2(t * turb * 0.1, 0.0)) * 2.0 - 1.0);
    return mix(uv, f, smoothstep(0.0, 0.2, u_warp));
  }
  if (ty == 7) return 0.5 + d * (1.0 + u_warp * 1.6 * (r - 0.35) * (1.0 + turb * sin(t * 2.0)));   // pinch and bulge
  if (ty == 8) {          // arch: the line bends over a curve; Scale leans it from a smile to an arch
    float bend = (u_warpScale * 2.0 - 1.0) * u_warp * 0.9;
    return uv + vec2(0.0, bend * (4.0 * d.x * d.x - 0.33) + turb * a * sin(d.x * 9.0 + t * 3.0));
  }
  // squeeze: the middle pulls in (or pushes out) like an hourglass
  float k = 1.0 + u_warp * 1.4 * cos(d.y * 3.14159 * (1.0 + s * 0.35) + t) * (1.0 + turb * sin(t * 2.0 + d.y * 7.0));
  return vec2(0.5 + d.x * k, uv.y);
}

// Scan Drag: the page moved while the scanner's bar was passing. Sliding it sideways shears the rows
// across (Amount); pulling it along the scan stretches and squashes them (Stretch). Wave Size is how
// long each movement lasts, and Jerk turns smooth drifts into sudden tugs.
float tug(float x, float jerk) {
  float i = floor(x), f = fract(x);
  float k = smoothstep(0.0, mix(1.0, 0.06, jerk), f);
  return mix(hash11(i), hash11(i + 1.0), k) * 2.0 - 1.0;
}
vec2 dragUv(vec2 uv, float t) {
  bool vert = u_dragAxis > 0.5;
  float s = vert ? uv.x : uv.y, x = vert ? uv.y : uv.x;
  float sc = mix(1.2, 22.0, u_dragScale * u_dragScale);
  float tt = t * u_dragSpeed, seed = u_dragSeed * 13.71;
  float ph = s * sc + seed + tt;
  float along = tug(ph * 0.83 + 41.0, u_dragJerk * 0.6) + 0.4 * tug(ph * 2.1 + 9.0, u_dragJerk * 0.6);
  float s2 = s + u_drag * u_dragSmear * 0.55 * along / sc;
  float ph2 = s2 * sc + seed + tt;
  // how far a row slides is measured against the scan's own length, so a wide canvas isn't torn apart
  float unit = vert ? uAspect : 1.0 / uAspect;
  float dx = u_drag * 0.5 * unit * (tug(ph2, u_dragJerk) + 0.35 * tug(ph2 * 2.7 + 5.3, u_dragJerk));
  dx += u_dragSkew * 0.6 * unit * (s - 0.5);
  float row = floor(s * (vert ? uRes.x : uRes.y) * 0.5);
  dx += u_dragJitter * 0.012 * (hash12(vec2(row, floor(tt * 12.0) + seed)) - 0.5);
  x += dx;
  return vert ? vec2(s2, x) : vec2(x, s2);
}

void main() {
  vec2 uv = vUv;
  if (u_warp > 0.001) uv = warpUv(uv, uTime);
  if (u_drag > 0.001 || abs(u_dragSkew) > 0.001 || u_dragJitter > 0.001) uv = dragUv(uv, uTime);
  vec4 c;
  if (u_split > 0.001) {
    // misregistration: each ink lands a little off, as on a press out of register
    float a = radians(u_splitAngle);
    vec2 off = vec2(cos(a), sin(a) * uAspect) * u_split * 0.03;
    vec4 r = samp(uv + off), g = samp(uv), b = samp(uv - off);
    c = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
  } else {
    c = samp(uv);
  }
  vec3 col = basicGrade(unpre(c), u_preExp, u_preBright, u_preContrast, u_preSat, u_preTemp, u_preTint, u_preHue);
  o = vec4(col * c.a, c.a);
}`;

  // ---------------------------------------------------------------- glitch
  const SLOTS = [1, 2, 3, 4];
  const FIELDS = ['Amt', 'Type', 'Rate', 'Len', 'Chance', 'Size', 'Width', 'Count', 'Pos', 'Spread', 'Dir', 'Move', 'Speed', 'Edge', 'Tint', 'Blend', 'Seed'];
  const slot = (i) => `
  if (u_g${i}Amt > 0.001) {
    // when: Rate windows a second, each firing with Chance and staying on for Length seconds
    float rate = max(u_g${i}Rate, 0.01), win = t * rate, id = floor(win), seed = u_g${i}Seed * 7.13 + ${i}.0 * 19.7;
    float on = step(hash11(id * 0.731 + seed), u_g${i}Chance) * step(fract(win) / rate, u_g${i}Len);
    if (on > 0.5) {
      float amt = u_g${i}Amt, fr = floor(t * 30.0);
      int type = int(u_g${i}Type + 0.5), move = int(u_g${i}Move + 0.5);
      float dirA = radians(u_g${i}Dir);
      vec2 d = vec2(cos(dirA), sin(dirA)), n = vec2(-d.y, d.x);
      vec2 p = uv0 - 0.5;
      float a = dot(p, d) + 0.5, b = dot(p, n) + 0.5;
      float cy = mix(u_g${i}Pos, hash11(id * 1.31 + seed), u_g${i}Spread);
      float ph = t * u_g${i}Speed;
      if (move == 1) cy = hash11(floor(t * max(u_g${i}Speed * 8.0, 1.0)) * 0.77 + seed);
      else if (move == 2) cy = fract(cy + ph);
      else if (move == 3) cy = fract(cy - ph);
      else if (move == 4) cy += 0.08 * sin(ph * 6.2831853);
      else if (move == 5) cy = abs(fract(cy * 0.5 + ph * 0.5) * 2.0 - 1.0);
      float count = max(u_g${i}Count, 1.0);
      float step32 = floor(a * 28.0);
      float be = b + u_g${i}Edge * (hash12(vec2(step32, id + seed)) - 0.5) * 0.9 / count;
      float dy = abs(be - cy); dy = min(dy, 1.0 - dy);
      float reg = step(dy, u_g${i}Size * 0.5) * step(abs(a - 0.5), u_g${i}Width * 0.5 + 0.0005);
      if (reg > 0.5) {
        float band = floor(be * count);
        float r = hash12(vec2(band, id + seed)), r2 = hash12(vec2(band + 3.7, id * 1.7 + seed));
        if (type == 0) {         // Slice Shift
          uv += d * (r - 0.5) * amt * 0.6;
        } else if (type == 1) {  // Block Shift
          vec2 cell = floor(vec2(a * count * aspect, be * count));
          float c1 = hash12(cell + id + seed), c2 = hash12(cell.yx + id * 1.3 + seed);
          if (c1 < 0.25 + amt * 0.6) uv += (d * (c2 - 0.5) + n * (c1 - 0.5) * 0.4) * amt * 0.5;
        } else if (type == 2) {  // Line Hold
          float a0 = 0.5 + (r - 0.5) * 0.7;
          uv += d * (a0 - a) * amt;
        } else if (type == 3) {  // Mosaic
          vec2 c = vec2(count * aspect, count) * (1.1 - amt);
          uv = (floor(uv * c) + 0.5) / c;
        } else if (type == 4) {  // Pixel Sort
          sortD = d * amt * 0.28; sortOn = 1.0;
        } else if (type == 5) {  // Sparkle Dashes
          vec2 g = vec2(a * (6.0 + count * 0.5), b * (40.0 + count * 3.0));
          vec2 c = floor(g);
          float h = hash12(c + fr * 0.37 + seed);
          float w = hash12(c + 4.1 + seed);
          float dash = step(1.0 - amt * 0.22, h) * step(abs(fract(g.x) - 0.5), 0.15 + 0.35 * w) * step(abs(fract(g.y) - 0.5), 0.34);
          add += mix(vec3(1.0), u_g${i}Color, u_g${i}Tint) * dash * (0.65 + 0.6 * w);
        } else if (type == 6) {  // Streaks
          float line = floor(b * (count * 10.0));
          float h = hash12(vec2(line, id + seed));
          float run = smoothstep(0.35, 0.75, vnoise(vec2(a * 9.0 + h * 40.0, fr * 0.15 + line)));
          add += mix(vec3(1.0), u_g${i}Color, u_g${i}Tint) * step(1.0 - amt * 0.16, h) * run * 0.8;
        } else if (type == 7) {  // RGB Tear
          split += d * (r - 0.5 + 0.2 * sign(r - 0.5)) * amt * 0.09;
        } else if (type == 8) {  // Erase: the band is cut out of the picture
          cut = max(cut, amt * step(0.5 - amt * 0.5, r));
        } else {                 // Invert
          inv = max(inv, amt);
        }
        if (u_g${i}Tint > 0.001 && type != 5 && type != 6) {
          tintC[${i - 1}] = u_g${i}Color; tintA[${i - 1}] = u_g${i}Tint * (0.6 + 0.4 * r2); tintM[${i - 1}] = int(u_g${i}Blend + 0.5);
        }
      }
    }
  }`;

  const GLITCH = COMMON + `
uniform sampler2D uPic;
uniform float uTime, uAspect;
${SLOTS.map((i) => `uniform float ${FIELDS.map((f) => `u_g${i}${f}`).join(', ')};\nuniform vec3 u_g${i}Color;`).join('\n')}

vec3 blendTint(vec3 c, vec3 k, int mode) {
  if (mode == 1) return c + k;                                        // Add
  if (mode == 2) return 1.0 - (1.0 - c) * (1.0 - k);                  // Screen
  if (mode == 3) return c * k;                                        // Multiply
  if (mode == 4) return abs(c - k);                                   // Difference
  if (mode == 5) { float y = lum(c); return k * (y * 1.5); }          // Color
  return k;                                                           // Normal
}

void main() {
  vec2 uv0 = vUv, uv = vUv, split = vec2(0.0), sortD = vec2(0.0);
  float t = uTime, aspect = uAspect, cut = 0.0, inv = 0.0, sortOn = 0.0;
  vec3 add = vec3(0.0), tintC[4];
  float tintA[4]; int tintM[4];
  for (int i = 0; i < 4; i++) { tintA[i] = 0.0; tintC[i] = vec3(0.0); tintM[i] = 0; }
${SLOTS.map(slot).join('\n')}
  vec4 c = texture(uPic, uv);
  if (dot(split, split) > 0.0) {
    vec4 r = texture(uPic, uv + split), b = texture(uPic, uv - split);
    c = vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
  }
  if (sortOn > 0.5) {
    // drag the brightest thing along the direction, a stand-in for sorting pixels
    float best = lum(c.rgb);
    for (int k = 1; k <= 18; k++) {
      vec4 s = texture(uPic, uv - sortD * float(k) / 18.0);
      float l = lum(s.rgb);
      if (l > best + 0.02) { best = l; c = s * (1.0 - float(k) / 18.0 * 0.25); }
    }
  }
  vec3 col = unpre(c);
  float a = c.a;
  if (inv > 0.0) col = mix(col, 1.0 - col, inv);
  for (int i = 0; i < 4; i++) if (tintA[i] > 0.0) col = mix(col, blendTint(col, tintC[i], tintM[i]), tintA[i]);
  a *= 1.0 - cut;
  // dashes and streaks are light of their own: they show over empty canvas too
  float la = clamp(max(add.r, max(add.g, add.b)), 0.0, 1.0);
  vec3 pm = col * a + add * (1.0 - a * 0.5);
  a = a + la * (1.0 - a);
  o = vec4(max(min(pm, vec3(a)), 0.0), a);
}`;

  const COPY = COMMON + `
uniform sampler2D uTex;
void main() { o = texture(uTex, vUv); }`;

  const BLUR = COMMON + `
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec4 c = texture(uTex, vUv) * 0.2270270;
  c += (texture(uTex, vUv + uDir * 1.3846) + texture(uTex, vUv - uDir * 1.3846)) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2308) + texture(uTex, vUv - uDir * 3.2308)) * 0.0702703;
  o = c;
}`;

  // ---------------------------------------------------------------- finish
  const FINISH = COMMON + `
uniform sampler2D uPic, uA, uB, uC, uD, uE, uDry;   // A..E: the picture blurred, 1024 px across down to 64
uniform vec2 uOut;
uniform float uTime, uFrame, uAspect, uSplit, uScale;
uniform float u_mix, u_opacity;
uniform float u_spread, u_edgeSize, u_rough, u_roughSize, u_soften;
uniform float u_glow, u_glowSize, u_glowThresh, u_halation;
uniform vec3 u_haloColor;
uniform float u_postExp, u_bright, u_contrast, u_sat, u_hue, u_temp, u_tintGM, u_shHue, u_shAmt, u_hiHue, u_hiAmt, u_lift, u_gamma;
uniform float u_poster, u_solar, u_gmap, u_gmPal, u_cross, u_invert, u_chanSwap;
uniform vec3 u_gmA, u_gmB, u_gmC, u_ink, u_paper, u_leakColor, u_monoColor, u_bgColor;
uniform float u_burn, u_irid, u_iridBands, u_iridLo, u_iridHi, u_iridWarp, u_iridSpeed, u_iridShift, u_hueLuma, u_huePos, u_hueSpeed;
uniform float u_mxRR, u_mxRG, u_mxRB, u_mxGR, u_mxGG, u_mxGB, u_mxBR, u_mxBG, u_mxBB;
uniform float u_leak, u_leakPos, u_leakSize, u_leakSpeed;
uniform float u_thr, u_thrLevel, u_thrSoft, u_thrGrain, u_thrSize, u_thrPrint, u_thrDetail;
uniform float u_ht, u_htType, u_htSize, u_htAngle, u_htMode, u_dith, u_dithLevels, u_dithSize, u_dithMode;
uniform float u_scan, u_scanCount, u_scanSoft, u_scanMode, u_mask, u_maskScale, u_mono, u_vignette;
uniform float u_film, u_filmSize, u_filmColor, u_filmResp, u_filmVar, u_dust, u_scratch, u_dustOpacity, u_dustSize, u_dustSoft, u_dustHold;
uniform float u_fibre, u_fibreScale, u_toner, u_tonerSize;
uniform float u_knock, u_knockLevel, u_knockSoft, u_bg;

vec3 hueTurn(vec3 c, float a) { vec3 y = RGB2YIQ * c; y.yz = rot(a) * y.yz; return YIQ2RGB * y; }
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[q.x + q.y * 4] + 0.5) / 16.0;
}
float grainN(vec2 p) { return (vnoise(p) + 0.5 * vnoise(p * 2.13 + 7.1) - 0.75) * 1.6; }

// Gradient Map's colour for a brightness: two hues, your own three colours, or a palette
vec3 ramp4(float l, vec3 a, vec3 b, vec3 c, vec3 d) {
  float x = l * 3.0;
  return x < 1.0 ? mix(a, b, x) : x < 2.0 ? mix(b, c, x - 1.0) : mix(c, d, x - 2.0);
}
vec3 gradientMap(float l, vec3 shC, vec3 hiC) {
  int p = int(u_gmPal + 0.5);
  if (p == 1) return l < 0.5 ? mix(u_gmA, u_gmB, l * 2.0) : mix(u_gmB, u_gmC, l * 2.0 - 1.0);
  if (p == 2) return ramp4(l, vec3(0.02, 0.0, 0.0), vec3(0.42, 0.0, 0.0), vec3(0.93, 0.04, 0.02), vec3(1.0, 0.34, 0.15));  // Red Room
  if (p == 3) return ramp4(l, vec3(0.02, 0.0, 0.12), vec3(0.65, 0.0, 0.55), vec3(1.0, 0.45, 0.0), vec3(1.0, 1.0, 0.75));  // Thermal
  if (p == 4) return ramp4(l, vec3(0.0, 0.01, 0.1), vec3(0.03, 0.14, 0.5), vec3(0.32, 0.6, 1.0), vec3(1.0, 0.95, 0.75));  // Night Blue
  if (p == 5) return ramp4(l, vec3(0.0, 0.05, 0.02), vec3(0.0, 0.55, 0.3), vec3(0.55, 1.0, 0.1), vec3(1.0, 1.0, 0.6));    // Acid
  if (p == 6) return ramp4(l, vec3(0.1, 0.0, 0.22), vec3(0.85, 0.08, 0.42), vec3(1.0, 0.5, 0.15), vec3(1.0, 0.92, 0.6));  // Sunset
  if (p == 7) return ramp4(l, vec3(0.05, 0.0, 0.2), vec3(0.3, 0.2, 0.95), vec3(0.95, 0.4, 0.85), vec3(1.0, 0.92, 0.95));  // Ultraviolet
  return mix(shC * 0.12, mix(hiC, vec3(1.0), 0.3), l);
}

// the screen pattern of a halftone at grid point g: 0 at a cell's centre, 1 at its corners
float screenAt(vec2 g, int type) {
  vec2 f = fract(g) - 0.5;
  if (type == 1) return abs(f.y) * 2.0;                       // lines
  if (type == 2) return abs(f.x) + abs(f.y);                  // diamonds
  if (type == 3) return max(abs(f.x), abs(f.y)) * 2.0;        // squares
  return length(f) * 1.414;                                   // dots
}

vec3 colorFx(vec3 col, vec2 uv, float t) {
  vec2 aq = uv * vec2(uAspect, 1.0);
  col = vec3(dot(col, vec3(u_mxRR, u_mxRG, u_mxRB)), dot(col, vec3(u_mxGR, u_mxGG, u_mxGB)), dot(col, vec3(u_mxBR, u_mxBG, u_mxBB)));

  float turn = u_hueLuma * lum(col) + u_huePos * (uv.x + uv.y) + u_hueSpeed * t;
  if (abs(turn) > 0.001) col = hueTurn(col, turn * 6.2831853);

  // Burn: contrast pushed until the colours clip, like a print left under the lamp
  if (u_burn > 0.001) {
    float y = lum(max(col, 0.0));
    col = mix(vec3(y), col, 1.0 + u_burn * 1.1);
    col = clamp((col - 0.5) * (1.0 + u_burn * 2.6) + 0.5 + u_burn * 0.08, 0.0, 1.0);
  }

  // Iridescence: colour from a thin film, as on oil
  if (u_irid > 0.001) {
    float l = lum(max(col, 0.0));
    float w = smoothstep(u_iridLo - 0.08, u_iridLo + 0.08, l) * (1.0 - smoothstep(u_iridHi - 0.08, u_iridHi + 0.08, l));
    float tt = t * u_iridSpeed;
    float n = vnoise(aq * 2.1 + tt) + 0.6 * vnoise(aq * 5.3 - tt * 1.4 + 3.0) + 0.3 * vnoise(aq * 13.0 + tt * 0.7);
    float film = (l * 2.0 + n * u_iridWarp * 2.4) * u_iridBands + u_iridShift;
    vec3 sheen = 0.5 + 0.5 * cos(6.2831853 * (film * vec3(1.0, 1.21, 1.47) + vec3(0.0, 0.2, 0.45)));
    sheen = col * 0.45 + sheen * (0.18 + 0.82 * l) * vec3(0.92, 0.9, 1.0);
    col = mix(col, max(sheen, 0.0), w * u_irid);
  }

  // Halftone: ink on a turned screen, heavier where the picture is darker. Darken keeps the
  // picture's colours; Ink & Paper prints it in the two Stipple colours.
  if (u_ht > 0.001) {
    float size = mix(3.0, 40.0, u_htSize * u_htSize) * max(uScale, 0.2);
    vec2 g = rot(radians(u_htAngle)) * gl_FragCoord.xy / size;
    float d = screenAt(g, int(u_htType + 0.5));
    float aa = 0.5 * 1.414 / size + 0.03;
    float dots = smoothstep(-aa, aa, sqrt(clamp(1.0 - lum(col), 0.0, 1.0)) - d);
    vec3 printed = u_htMode > 0.5 ? mix(u_paper, u_ink, dots) : mix(col * 1.1 + 0.05, col * 0.08, dots);
    col = mix(col, printed, u_ht);
  }

  // Stipple: the picture thresholded to two colours through grain, so tones dissolve into dots.
  // With Grain at zero it's a clean screen print.
  if (u_thr > 0.001) {
    float size = mix(0.8, 6.0, u_thrSize) * max(uScale, 0.35);
    vec2 g = gl_FragCoord.xy / size;
    float grain = (hash12(floor(g) + 0.5) - 0.5) * 0.8 + (vnoise(g * 0.31) - 0.5) * 0.45;
    float v = lum(max(col, 0.0));
    // Detail: compare each point with its surroundings, so features survive however the photo was lit
    v += (v - lum(unpre(texture(uE, uv)))) * u_thrDetail * 3.0;
    v += grain * u_thrGrain;
    float s = max(u_thrSoft * 0.4, 0.001);
    float b = smoothstep(u_thrLevel - s, u_thrLevel + s, v);
    vec3 two = mix(u_ink, u_paper, b);
    if (u_thrPrint > 0.001) {   // the texture of ink on paper
      float fibre = vnoise(aq * vec2(90.0, 240.0)) * 0.6 + vnoise(aq * 9.0) * 0.4;
      two *= 1.0 + u_thrPrint * 0.5 * (fibre - 0.5);
      two = mix(two, two * step(0.1, hash12(floor(gl_FragCoord.xy * 0.5 / max(uScale, 0.35)) + 3.0)), u_thrPrint * 0.35 * (1.0 - b));
    }
    col = mix(col, two, u_thr);
  }

  // Dither: the picture in a few levels, patterned the way old screens and printers did it
  if (u_dith > 0.001) {
    float cell = max(mix(1.0, 8.0, u_dithSize) * uScale, 1.0);
    float b = bayer4(floor(gl_FragCoord.xy / cell));
    float lv = max(floor(u_dithLevels + 0.5), 2.0) - 1.0;
    vec3 q = u_dithMode > 0.5 ? mix(u_ink, u_paper, step(b, lum(col))) : floor(clamp(col, 0.0, 1.0) * lv + b) / lv;
    col = mix(col, q, u_dith);
  }

  // Light Leak: light fogging the film from one edge
  if (u_leak > 0.001) {
    float a = u_leakPos * 6.2831853;
    float along = dot(uv - 0.5, vec2(cos(a), sin(a))) + 0.5;
    float wob = vnoise(vec2(along * 3.0, t * u_leakSpeed)) - 0.5;
    float m = smoothstep(1.0 - u_leakSize, 1.15, along + wob * 0.3);
    col = 1.0 - (1.0 - col) * (1.0 - u_leakColor * m * u_leak);
  }
  return col;
}

void main() {
  vec2 uv = vUv, aq = uv * vec2(uAspect, 1.0);
  float t = uTime;
  vec4 P = texture(uPic, uv);

  // Ink & Edge: the shape's outline redrawn from a blurred copy. Spread swells it like ink soaking
  // into paper or chokes it back; Rough breaks the edge up; Soften feathers it.
  float ek = clamp(max(abs(u_spread), max(u_rough, u_soften)) * 8.0, 0.0, 1.0);
  if (ek > 0.0) {
    vec4 bl = u_edgeSize < 0.5 ? mix(texture(uA, uv), texture(uB, uv), u_edgeSize * 2.0) : mix(texture(uB, uv), texture(uC, uv), u_edgeSize * 2.0 - 1.0);
    float rs = min(mix(500.0, 40.0, u_roughSize), uOut.y * 0.4);
    float n = vnoise(aq * rs) * 0.65 + vnoise(aq * rs * 2.7 + 13.0) * 0.35 - 0.5;
    float e = bl.a + u_rough * n * 0.9;
    float th = 0.5 - u_spread * 0.42;
    float sf = max(u_soften * 0.5, fwidth(e) * 0.75);
    float a2 = smoothstep(th - sf, th + sf, e);
    vec3 c2 = mix(unpre(bl), unpre(P), P.a);
    P = mix(P, vec4(c2 * a2, a2), ek);
  }
  vec3 col = unpre(P);
  float a = P.a;

  // Glow: light spilling out of the bright parts, past the edge of the shape
  if (u_glow > 0.001 || u_halation > 0.001) {
    vec4 gB = texture(uB, uv), gC = texture(uC, uv), gD = texture(uD, uv), gE = texture(uE, uv);
    // a tight core plus a wide tail, the way light scattering falls off slowly rather than stopping
    vec4 core = mix(gB, gC, u_glowSize), tail = mix(gD, gE, u_glowSize);
    float gate = smoothstep(u_glowThresh * 0.9 - 0.02, u_glowThresh * 0.9 + 0.3, lum(max(unpre(core), unpre(tail))));
    vec3 light = (core.rgb * 1.0 + tail.rgb * 0.8) * gate * u_glow;
    light += gD.rgb * u_haloColor * smoothstep(0.2, 0.9, lum(unpre(gD))) * u_halation * 1.8;
    vec3 pm = col * a;
    pm = pm + light * (1.0 - 0.6 * pm);
    a = a + clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0) * (1.0 - a);
    col = a > 0.0005 ? pm / a : vec3(0.0);
  }

  // grade: exposure, contrast, brightness and colour, then split toning, gradient map and curves
  col = basicGrade(col, u_postExp, u_bright, u_contrast, u_sat, u_temp, u_tintGM, u_hue);
  vec3 shC = hue2rgb(u_shHue / 360.0), hiC = hue2rgb(u_hiHue / 360.0);
  float l = lum(col);
  col += (shC - 0.5) * u_shAmt * 0.5 * (1.0 - smoothstep(0.0, 0.6, l));
  col += (hiC - 0.5) * u_hiAmt * 0.5 * smoothstep(0.4, 1.0, l);
  if (u_gmap > 0.001) col = mix(col, gradientMap(smoothstep(0.0, 1.0, l), shC, hiC), u_gmap);
  if (u_cross > 0.001) col = mix(col, vec3(smoothstep(0.05, 0.95, col.r), col.g * 0.9 + 0.05, col.b * 0.7 + 0.15), u_cross);
  col = max(col, 0.0);
  col = u_lift >= 0.0 ? col * (1.0 - u_lift) + u_lift : max(col + u_lift, 0.0) / (1.0 + u_lift);
  col = pow(col, vec3(1.0 / u_gamma));
  if (u_solar > 0.001) col = mix(col, 1.0 - abs(1.0 - 2.0 * col), u_solar);
  if (u_poster > 0.001) { float lv = mix(24.0, 2.0, u_poster); col = floor(col * lv + 0.5) / lv; }
  col = mix(col, 1.0 - col, u_invert);
  int cs = int(u_chanSwap + 0.5);
  col = cs == 1 ? col.rbg : cs == 2 ? col.grb : cs == 3 ? col.gbr : cs == 4 ? col.brg : cs == 5 ? col.bgr : col;

  col = colorFx(col, uv, t);

  // Screen: raster lines, a phosphor grid and a single-colour tube
  if (u_scan > 0.001) {
    float w = 0.5 + 0.5 * cos(6.2831853 * uv.y * u_scanCount);
    float aa = clamp(u_scanCount / uOut.y * 3.0, 0.0, 1.0);          // lines too fine to draw fade to their average
    float edge = mix(0.02, 0.5, u_scanSoft);
    float line = mix(smoothstep(0.5 - edge, 0.5 + edge, w), 0.5, aa * aa);
    if (u_scanMode > 0.5) a *= mix(1.0, line, u_scan);
    else col *= mix(1.0, 0.25 + 1.15 * line, u_scan);
  }
  if (u_mask > 0.001) {
    float pitch = (1.0 + 11.0 * u_maskScale * u_maskScale) * max(uScale, 0.34);
    vec3 tri = triad(gl_FragCoord.x / (3.0 * pitch)) * 2.4 / 0.9;
    float row = fract(gl_FragCoord.y / (3.0 * pitch));
    tri *= mix(1.0, smoothstep(0.0, 0.15, row) * (1.0 - smoothstep(0.85, 1.0, row)) / 0.85, 0.7);
    col *= mix(vec3(1.0), tri, u_mask);
  }
  int mono = int(u_mono + 0.5);
  if (mono > 0) {
    vec3 phc = mono == 1 ? vec3(0.239, 1.0, 0.447) : mono == 2 ? vec3(1.0, 0.69, 0.18) : mono == 3 ? vec3(0.93, 0.96, 1.0) : u_monoColor;
    float lt = lum(col);
    col = phc * lt + max(lt - 0.75, 0.0) * 0.8 * (vec3(1.0) - phc);
  }
  if (u_vignette > 0.001) {
    vec2 ph = (uv * 2.0 - 1.0) * vec2(uAspect, 1.0);
    col *= 1.0 - u_vignette * 0.75 * smoothstep(0.3, 1.0, dot(ph, ph) / (uAspect * uAspect + 1.0));
  }

  // film stock: grain that clumps and breathes, dust and straight scratches
  if (u_film > 0.001) {
    float sz = mix(1.0, 4.0, u_filmSize) * uScale;
    vec2 gp = gl_FragCoord.xy / max(sz, 0.35);
    vec2 off = vec2(hash11(uFrame * 0.13), hash11(uFrame * 0.71 + 3.0)) * 977.0;
    vec3 n = vec3(grainN(gp + off), grainN(gp + off + 31.7), grainN(gp + off + 67.3));
    vec3 g = mix(vec3(n.x), n, u_filmColor);
    float patchy = 1.0 + u_filmVar * (vnoise(aq * 5.0 + uFrame * 0.37) - 0.5) * 1.6;
    float breathe = 1.0 + u_filmVar * (hash11(uFrame * 0.91) - 0.5) * 0.8;
    float lc = lum(col);
    float resp = exp(-pow((lc - mix(0.2, 0.8, u_filmResp)) / 0.4, 2.0)) * 0.8 + 0.2;
    col += g * u_film * 0.32 * resp * patchy * breathe * clamp(sz, 0.4, 1.0);
  }
  if (u_fibre > 0.001) {
    // paper: long fibres, a soft mottle and the odd fleck, multiplied into the ink
    float fs = mix(0.5, 3.0, u_fibreScale);
    float fibre = vnoise(aq * vec2(90.0, 240.0) / fs) * 0.5 + vnoise(aq * 9.0 / fs) * 0.3 + vnoise(aq * 420.0 / fs) * 0.2;
    col *= 1.0 + u_fibre * 0.7 * (fibre - 0.5);
    col = mix(col, col * 0.55, u_fibre * 0.5 * step(0.985, hash12(floor(gl_FragCoord.xy / max(uScale * 1.5 * fs, 0.5)) + 7.0)));
  }
  if (u_dust > 0.001) {
    float held = floor(uFrame / (1.0 + floor(u_dustHold * 11.0)));
    float px = 1.0 / uOut.y;
    for (int i = 0; i < 3; i++) {
      float fi = float(i), scale = (i == 0 ? 150.0 : i == 1 ? 62.0 : 22.0) / mix(0.6, 2.2, u_dustSize);
      vec2 dq = aq * scale, cell = floor(dq);
      vec2 id = cell + fi * 41.0 + held * 17.1;
      if (hash12(id) < u_dust * (i == 0 ? 0.05 : i == 1 ? 0.03 : 0.012)) {
        vec2 c = 0.3 + 0.4 * vec2(hash12(id + 1.3), hash12(id + 2.7));
        vec2 q = rot(hash12(id + 4.1) * 3.1416) * (fract(dq) - c);
        q.y *= 1.0 + 2.2 * hash12(id + 3.1);
        float r = 0.05 + 0.15 * pow(hash12(id + 5.0), 2.0);
        float d = length(q) * (1.0 + 0.9 * (vnoise(q * 34.0 + id) - 0.5));
        float aa = max(px * scale * (0.9 + u_dustSoft * 3.0), r * (0.2 + 0.6 * u_dustSoft));
        float m = (1.0 - smoothstep(r - aa, r + aa, d)) * min(1.0, r / aa + 0.15);
        vec3 ink = hash12(id + 9.0) < 0.75 ? vec3(0.96, 0.95, 0.92) : vec3(0.015);
        col = mix(col, ink, m * (0.55 + 0.45 * hash12(id + 6.0)) * u_dustOpacity);
      }
    }
  }
  if (u_scratch > 0.001) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float seed = floor(uFrame / (8.0 + fi * 5.0));
      float on = step(1.0 - u_scratch * 0.6, hash11(seed * 2.1 + fi));
      float sx = hash11(seed * 1.3 + fi * 7.0);
      float w = 0.0004 + 0.0006 * hash11(seed + fi * 3.0);
      float line = (1.0 - smoothstep(w * 0.5, w, abs(uv.x - sx))) * on;
      float fade = 0.35 + 0.65 * vnoise1(uv.y * 4.0 + seed * 3.7);
      col = mix(col, vec3(0.85), line * 0.4 * fade * u_dustOpacity);
    }
  }
  col = max(col, 0.0);

  // Transparency: clear the light or the dark parts, so only the ink (or only the light) is left
  int knock = int(u_knock + 0.5);
  if (knock > 0) {
    float kl = lum(col), ks = max(u_knockSoft * 0.5, 0.004);
    float keep = smoothstep(u_knockLevel - ks, u_knockLevel + ks, kl);
    a *= knock == 1 ? 1.0 - keep : keep;
  }
  // Toner: a photocopier's stray specks around the ink, and pinholes in it
  if (u_toner > 0.001) {
    float cs = mix(1.2, 5.0, u_tonerSize) * max(uScale, 0.35);
    vec2 cell = floor(gl_FragCoord.xy / cs);
    vec4 near = texture(uE, uv);
    float clump = vnoise(cell * 0.05 + 3.0);
    float density = u_toner * (0.003 + 0.04 * smoothstep(0.0, 0.5, near.a) * clump * clump);
    float speck = step(1.0 - density, hash12(cell + 11.3)) * (1.0 - step(0.5, a));
    vec3 inkC = a > 0.05 ? col : near.a > 0.02 ? clamp(near.rgb / near.a, 0.0, 1.0) : u_ink;
    col = mix(col, inkC, speck);
    a = max(a, speck * 0.92);
    a *= 1.0 - 0.95 * step(1.0 - u_toner * 0.03, hash12(cell + 71.9));
  }
  a = clamp(a * u_opacity, 0.0, 1.0);

  // dry/wet, the background, and the compare split
  vec4 dry = texture(uDry, uv);
  vec4 outp = mix(dry, vec4(min(col, 1.0) * a, a), u_mix);
  if (uv.x < uSplit) outp = dry;
  if (u_bg > 0.5) outp = vec4(outp.rgb + u_bgColor * (1.0 - outp.a), 1.0);
  // triangular dither of about one 8-bit step, so glow falloff and dark gradients don't band
  vec2 dq = gl_FragCoord.xy + fract(uFrame * 0.618) * 113.0;
  outp.rgb += (hash12(dq) + hash12(dq + 57.3) - 1.0) / 255.0 * outp.a;
  o = vec4(clamp(outp.rgb, vec3(0.0), vec3(outp.a)), outp.a);
}`;

  window.KodecShaders = { VERT, COMMON, PLACE, WARP, GLITCH, COPY, BLUR, FINISH };
})();
