// Kodec WebGL2 engine: source upload -> place on the canvas -> warp -> (glitch) -> blur pyramid -> finish.
// Every target holds premultiplied RGBA, so transparency survives every pass and reaches the export.
(function () {
  class KodecEngine {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', {
        alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error('This browser does not support WebGL2.');
      this.gl = gl;
      this.canvas = canvas;
      this.half = !!gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear');
      this.vao = gl.createVertexArray();
      const S = window.KodecShaders;
      this.progs = {
        place: this._program(S.VERT, S.PLACE),
        warp: this._program(S.VERT, S.WARP),
        glitch: this._program(S.VERT, S.GLITCH),
        copy: this._program(S.VERT, S.COPY),
        blur: this._program(S.VERT, S.BLUR),
        finish: this._program(S.VERT, S.FINISH),
      };
      this.ratio = 0; // 0 keeps the source's shape
      this.srcTex = this._texture(true);
      this.source = null;
      this.srcW = 0; this.srcH = 0;
      this.outW = 0; this.outH = 0;
      this.expW = 0; this.expH = 0; this.viewW = 0;
      this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    }

    _shader(type, text) {
      const gl = this.gl, s = gl.createShader(type);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }

    _program(vs, fs) {
      const gl = this.gl, p = gl.createProgram();
      gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const locs = new Map(), samplers = [];
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        const loc = gl.getUniformLocation(p, info.name);
        if (info.type === gl.SAMPLER_2D) samplers.push(info.name);
        locs.set(info.name, { loc, type: info.type });
      }
      return { p, locs, samplers };
    }

    _texture(mip) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    _target(w, h, mip) {
      const gl = this.gl;
      w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
      const tex = this._texture(mip);
      if (this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, w, h };
    }

    _mips(t) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, t.tex);
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
    }

    _free(t) {
      if (!t) return;
      this.gl.deleteTexture(t.tex);
      this.gl.deleteFramebuffer(t.fbo);
    }

    // the canvas's shape: the source's, unless a ratio has been chosen
    get aspect() { return this.ratio || this.srcW / this.srcH; }
    setShape(ratio) { this.ratio = ratio; }

    // nothing here remembers earlier frames; exports call this as they do in Atlas
    resetHistory() {}

    // el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
    setSource(el, w, h, live) {
      this.source = el;
      this.live = live;
      this.srcW = w; this.srcH = h;
      this.srcDirty = true;
    }

    // export size: what stills and videos are rendered at
    setOutput(w, h) {
      this.expW = Math.max(2, Math.round(w / 2) * 2); this.expH = Math.max(2, Math.round(h / 2) * 2);
      this._applyView();
    }

    // preview size: the canvas renders smaller than the export while fitting the
    // window; pass null to render at full export size (100% view, exporting)
    setView(w) {
      this.viewW = w || 0;
      this._applyView();
    }

    _applyView() {
      if (!this.expW) return;
      let w = this.expW, h = this.expH;
      if (this.viewW && this.viewW < this.expW) {
        w = Math.max(2, Math.round(this.viewW / 2) * 2);
        h = Math.max(2, Math.round((w * this.expH) / this.expW / 2) * 2);
      }
      if (w === this.outW && h === this.outH) return;
      this.outW = w; this.outH = h;
      this.canvas.width = w; this.canvas.height = h;
      this._resize();
    }

    _resize() {
      if (!this.outW) return;
      const W = this.outW, H = this.outH;
      [this.placed, this.warped, this.fx].forEach((t) => this._free(t));
      (this.pyr || []).forEach((pair) => pair.forEach((t) => this._free(t)));
      this.placed = this._target(W, H, true);
      this.warped = this._target(W, H, true);
      this.fx = this._target(W, H, true);
      // Five levels of blur, each half the one before: edges and bleed up top, glow further down.
      // They are sized against the picture, not the output, so a blur covers the same share of the
      // picture in the fitted preview and in a 6000 px export.
      const s = 2048 / Math.max(W, H);
      this.pyr = [2, 4, 8, 16, 32].map((d) => [this._target(W * s / d, H * s / d), this._target(W * s / d, H * s / d)]);
    }

    _upload() {
      const gl = this.gl, el = this.source;
      if (!el) return false;
      if (el instanceof HTMLVideoElement && el.readyState < 2) return !this.srcDirty;
      if (!this.live && !this.srcDirty) return true;
      gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.srcDirty = false;
      return true;
    }

    _pass(prog, target, uniforms, textures) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, target ? target.w : this.outW, target ? target.h : this.outH);
      gl.useProgram(prog.p);
      prog.samplers.forEach((name, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, textures[name]);
        gl.uniform1i(prog.locs.get(name).loc, unit);
      });
      for (const [name, { loc, type }] of prog.locs) {
        const v = uniforms[name];
        if (v === undefined || type === gl.SAMPLER_2D) continue;
        if (type === gl.FLOAT_VEC2) gl.uniform2f(loc, v[0], v[1]);
        else if (type === gl.FLOAT_VEC3) gl.uniform3f(loc, v[0], v[1], v[2]);
        else gl.uniform1f(loc, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    _blur(pair, spread, iterations) {
      const prog = this.progs.blur, [a, b] = pair;
      for (let i = 0; i < iterations; i++) {
        this._pass(prog, b, { uDir: [spread / a.w, 0] }, { uTex: a.tex });
        this._pass(prog, a, { uDir: [0, spread / a.h] }, { uTex: b.tex });
      }
    }

    // params: flat {key: number}; time in seconds; frame is an integer counter;
    // extra: raw uniforms such as uSplit
    render(params, time, frame, extra) {
      const gl = this.gl;
      if (!this.placed || !this._upload()) return false;
      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      const U = { uTime: time, uFrame: frame % 8192 };
      for (const k in params) U['u_' + k] = params[k];
      // colour controls hold 0xRRGGBB, and arrive in the shaders as vec3
      for (const k of this.colorKeys || []) {
        const v = params[k];
        U['u_' + k] = [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
      }
      Object.assign(U, extra);
      U.uRes = [this.outW, this.outH];
      U.uOut = U.uRes;
      U.uAspect = this.expW / this.expH;
      U.uSrcAspect = this.srcW / this.srcH;
      U.uScale = this.outH / this.expH;

      this._pass(this.progs.place, this.placed, U, { uTex: this.srcTex });
      this._mips(this.placed);
      this._pass(this.progs.warp, this.warped, U, { uSrc: this.placed.tex });
      this._mips(this.warped);
      let picture = this.warped;
      if (params.g1Amt > 0.001 || params.g2Amt > 0.001 || params.g3Amt > 0.001 || params.g4Amt > 0.001) {
        this._pass(this.progs.glitch, this.fx, U, { uPic: picture.tex });
        this._mips(this.fx);
        picture = this.fx;
      }

      let from = picture.tex;
      this.pyr.forEach((pair, i) => {
        this._pass(this.progs.copy, pair[0], {}, { uTex: from });
        this._blur(pair, i ? 2.0 : 1.2, i ? 2 : 1);
        from = pair[0].tex;
      });

      const [A, B, C, D, E] = this.pyr.map((pair) => pair[0].tex);
      this._pass(this.progs.finish, null, U, { uPic: picture.tex, uA: A, uB: B, uC: C, uD: D, uE: E, uDry: this.placed.tex });
      return true;
    }
  }

  window.KodecEngine = KodecEngine;
})();
