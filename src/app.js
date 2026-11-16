// Kodec app core: engine, the timeline, effective parameters (automation and macros), sources,
// render loop, transport and preview sizing. The controls are in rack.js, the Source tab and the
// type setter in source.js, the automation lanes in timeline.js and the interface settings in settings.js.
(function () {
  const { MACROS, GROUPS, DEFAULTS, BY_KEY } = window.KodecParams;
  const Auto = window.KodecAuto;
  const $ = (id) => document.getElementById(id);
  const canvas = $('out');
  const K = (window.Kodec = {});

  let engine;
  try {
    engine = new window.KodecEngine(canvas);
  } catch (err) {
    $('app').innerHTML = '<div class="fatal"><h2>Kodec needs WebGL2</h2><p>' +
      'This browser could not start the GPU renderer. Open the page in a current Chrome, Edge, Safari or Firefox.</p>' +
      '<p class="fineprint"></p></div>';
    $('app').querySelector('p:last-child').textContent = String(err.message || err).slice(0, 400);
    return;
  }
  K.engine = engine;
  engine.colorKeys = Object.values(BY_KEY).filter((c) => c.color).map((c) => c.k);

  const state = (K.state = {
    params: { ...DEFAULTS },
    enabled: Object.fromEntries(GROUPS.map((g) => [g.id, true])),
    look: null,
    out: '2000',   // the long side of the export in pixels, or 'source'
    shape: 0,      // canvas shape, width over height; 0 keeps the source's
    split: 0.5,
    compare: false,
    playing: false,
    auto: {}, // key -> { mode: 'keys' or 'lfo', off, keys, lfo }, see automation.js
    micro: {}, // key -> stutter, jitter, spike and drift settings, see automation.js
    length: 10, // seconds of timeline for text and photos
    text: { str: 'KODEC', font: 'Helvetica Neue', align: 'center', caps: true },
  });

  // ------------------------------------------------------------ helpers
  // action: { label, run } adds a button, such as Undo, and gives it longer on screen
  function toast(msg, action) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    if (action) {
      const b = K.el('button', 'toast-act', action.label);
      b.type = 'button';
      b.onclick = () => { t.hidden = true; action.run(); };
      t.append(b);
    }
    toast.timer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3200);
  }
  K.toast = toast;

  const fmtTime = (s) => {
    s = Math.max(0, s || 0);
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  // with hundredths, for the running time
  K.fmtClock = (s) => {
    s = Math.max(0, s || 0);
    return fmtTime(s) + '.' + String(Math.floor((s % 1) * 100)).padStart(2, '0');
  };

  K.store = store;
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  // small interface helpers, shared by the panels
  K.el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  K.icon = (name, cls) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'i' + (cls ? ' ' + cls : ''));
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + name);
    s.append(u);
    return s;
  };
  // a segmented control: items are [value, label]; returns set(value) to move it from outside
  K.segmented = (host, items, value, onChange, cls) => {
    const seg = K.el('div', 'segmented' + (cls ? ' ' + cls : ''));
    seg.setAttribute('role', 'tablist');
    seg.style.setProperty('--n', items.length);
    const thumb = K.el('span', 'segment-thumb');
    const buttons = items.map(([v, label]) => {
      const b = K.el('button', 'segment', label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.onclick = () => { set(v); onChange(v); };
      seg.append(b);
      return b;
    });
    seg.append(thumb);
    function set(v) {
      const i = items.findIndex(([x]) => x === v);
      seg.style.setProperty('--i', Math.max(0, i));
      buttons.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    }
    set(value);
    host.replaceChildren(seg);
    return set;
  };

  const listeners = {};
  K.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  K.emit = (ev, arg) => (listeners[ev] || []).forEach((fn) => fn(arg));

  // how this person has arranged the interface
  K.ui = Object.assign({
    theme: 'dark', accent: '', textSize: 1, rackSide: 'right', rackW: 372, tlPos: 'bottom', tlH: 290,
    modOrder: [], modHidden: [], pinned: [], snap: 'frame', laneH: {}, laneSize: 'm', backdrop: 'dark',
  }, store('kodec.ui') || {});
  K.saveUi = () => store('kodec.ui', K.ui);

  // ------------------------------------------------------------ the timeline
  // Keyframes, LFOs and every moving effect run on one timeline: the video's own time, or for text
  // and photos a loop as long as state.length. A still is the frame under the playhead, and exports
  // play the same timeline, so they repeat the preview.
  let tl = 0;
  K.timelineLength = () => (src.kind === 'video' ? src.el.duration || 1 : state.length);
  K.timeNow = () => (src.kind === 'video' ? src.el.currentTime : tl);
  K.clockNow = K.timeNow;
  K.frameAt = (t) => Math.floor(t * 30 + 1e-6);
  K.seek = (t) => {
    t = Math.max(0, Math.min(t, K.timelineLength()));
    // setting currentTime starts a new seek even to the same time, and the frame is unreadable until it ends
    if (src.kind === 'video') { if (Math.abs(src.el.currentTime - t) > 1e-6) src.el.currentTime = t; }
    else tl = t;
  };
  K.live = {};

  K.effective = function () {
    const p = { ...state.params };
    const clamp = (c, v) => Math.min(c.max, Math.max(c.min, v));
    const t = K.timeNow();
    for (const k in state.auto) {
      const a = state.auto[k], c = BY_KEY[k];
      if (!c || c.opts || c.color || a.off) { delete K.live[k]; continue; }
      p[k] = K.live[k] = Auto.valueOf(a, p[k], c, t);
    }
    for (const k in state.micro) {
      const c = BY_KEY[k];
      if (c && Auto.microOn(state.micro[k])) p[k] = K.live[k] = Auto.microAt(state.micro[k], p[k], c, t);
    }
    for (const m of MACROS) {
      const f = p[m.k];
      delete p[m.k];
      if (Math.abs(f - 1) < 1e-4) continue;
      for (const k of m.keys) {
        const c = BY_KEY[k], n = c.n !== undefined ? c.n : c.min;
        p[k] = clamp(c, n + (p[k] - n) * f);
      }
    }
    for (const g of GROUPS) {
      if (state.enabled[g.id]) continue;
      for (const c of g.controls) if (c.n !== undefined) p[c.k] = c.n;
    }
    return p;
  };

  // ------------------------------------------------------------ sources
  // kind: 'text' (set in source.js), 'image' or 'video'. The last photo or video opened is kept as
  // K.media, so switching between Text and Photo in the Source tab doesn't lose it.
  const src = (K.src = { kind: null, el: null, name: 'kodec', w: 0, h: 0, url: null, audio: null, stamp: 0 });
  K.media = null;
  let actx = null;

  function useSource(kind, el, w, h, name) {
    if (src.kind === 'video' && el !== src.el) src.el.pause();
    Object.assign(src, { kind, el, w, h, name });
    src.audio = kind === 'video' ? K.media.audio : null;
    src.file = kind === 'video' ? K.media.file : null;
    src.stamp++;
    engine.setSource(el, w, h, kind === 'video');
    applyOutput();
    state.playing = kind === 'video';
    if (kind === 'video') el.play().catch(() => { state.playing = false; syncTransport(); });
    syncTransport();
    updateBadge();
    K.emit('source');
  }
  K.useSource = useSource;
  K.useMedia = () => { const m = K.media; if (m) useSource(m.kind, m.el, m.w, m.h, m.name); };

  function releaseMedia() {
    const m = K.media;
    if (!m) return;
    if (m.kind === 'video') { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); }
    if (m.url) URL.revokeObjectURL(m.url);
    K.media = null;
  }

  // the biggest picture this GPU is asked to hold
  K.sizeCap = () => Math.min(6000, engine.maxTex);

  function loadImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      releaseMedia();
      let el = img, w = img.naturalWidth, h = img.naturalHeight;
      const cap = K.sizeCap();
      if (Math.max(w, h) > cap) {
        const s = cap / Math.max(w, h);
        el = document.createElement('canvas');
        el.width = Math.round(w * s); el.height = Math.round(h * s);
        el.getContext('2d').drawImage(img, 0, 0, el.width, el.height);
        w = el.width; h = el.height;
      }
      K.media = { kind: 'image', el, w, h, name: baseName(file.name), url };
      K.useMedia();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened. Try a PNG, JPG or WebP.'); };
    img.src = url;
  }

  function loadVideo(file) {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.playsInline = true; v.loop = true; v.preload = 'auto';
    v.onloadedmetadata = () => {
      releaseMedia();
      K.media = { kind: 'video', el: v, w: v.videoWidth, h: v.videoHeight, name: baseName(file.name), url, file, audio: audioFor(v) };
      K.useMedia();
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      toast('This browser cannot decode that video. Try an MP4 (H.264) or WebM file.');
    };
    v.src = url;
  }

  function audioFor(video) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const node = actx.createMediaElementSource(video);
      const gain = actx.createGain();
      const dest = actx.createMediaStreamDestination();
      node.connect(gain).connect(actx.destination);
      node.connect(dest);
      gain.gain.value = $('muteBtn').getAttribute('aria-pressed') === 'true' ? 0 : 1;
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      return { gain, dest };
    } catch (e) {
      return null;
    }
  }

  const baseName = (n) => (n.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'kodec').slice(0, 60);

  function loadFile(file) {
    if (!file) return;
    if (K.recording) { toast('Finish or cancel the export first.'); return; }
    if (file.type.startsWith('video/')) loadVideo(file);
    else if (file.type.startsWith('image/')) loadImage(file);
    else if (/\.(ttf|otf|woff2?)$/i.test(file.name)) K.emit('fontfile', file);
    else toast('Kodec opens images, videos and font files. "' + file.name + '" is none of those.');
  }
  K.loadFile = loadFile;

  $('openBtn').onclick = () => $('file').click();
  $('file').onchange = (e) => { loadFile(e.target.files[0]); e.target.value = ''; };

  // drop a file anywhere on the page
  const vp = $('viewport'), drop = $('drop');
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; drop.classList.add('show'); });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.classList.remove('show'); } });
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; drop.classList.remove('show');
    loadFile(e.dataTransfer.files[0]);
  });
  // an image on the clipboard opens too
  document.addEventListener('paste', (e) => {
    if (e.target.closest('input, textarea')) return;
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); loadFile(f); }
  });
  document.addEventListener('pointerdown', () => { if (actx && actx.state === 'suspended') actx.resume().catch(() => {}); });

  // ------------------------------------------------------------ output
  // the export's long side in pixels: the chosen size, or the source's own
  K.longSide = () => {
    const cap = K.sizeCap();
    if (state.out !== 'source') return Math.min(cap, +state.out);
    return src.kind === 'text' ? Math.min(cap, 3000) : Math.min(cap, Math.max(src.w, src.h));
  };
  function applyOutput() {
    if (!src.w) return;
    const aspect = state.shape || src.w / src.h, long = K.longSide();
    engine.setShape(state.shape);
    engine.setOutput(aspect >= 1 ? long : long * aspect, aspect >= 1 ? long / aspect : long);
    fitView();
    updateBadge();
  }
  K.applyOutput = applyOutput;

  // title bar: the source on the left, the export's size on the right
  function updateBadge() {
    if (!engine.expW) return;
    $('srcName').textContent = src.kind === 'text' ? 'Text' : src.name;
    $('badge').textContent = `${engine.expW}×${engine.expH}` + (state.params.bg > 0.5 ? '' : ' · transparent');
  }
  K.updateBadge = updateBadge;

  K.setOut = (o) => { state.out = o; K.emit('size'); applyOutput(); };
  K.setShape = (ratio) => { state.shape = ratio; applyOutput(); };

  // ------------------------------------------------------------ render loop
  K.hooks = [];
  K.prepare = []; // run on the frame's parameters before it is drawn (the type setter lives here)

  // While paused, the picture only changes when something feeds it: a control, the view, a seek, a
  // new source. Each frame sums those up, and once they hold still the GPU rests instead of drawing
  // the same frame again.
  const SETTLE_FRAMES = 3;
  let idleKey = '', settle = 0, last = performance.now();
  function idleSignature(params, split) {
    const v = src.kind === 'video' ? src.el : null;
    return JSON.stringify(params) + '|' + [
      split, K.timeNow(), canvas.width, canvas.height, engine.outW, engine.outH, engine.expW, engine.viewW,
      engine.ratio, engine.srcDirty, v ? v.readyState : '', v ? v.seeking : '', src.stamp, src.w, src.h,
    ].join();
  }
  K.redraw = () => { idleKey = ''; };

  // one frame at time t, used by the loop and by exports
  K.renderAt = (t, extra) => {
    const params = K.effective();
    K.prepare.forEach((fn) => fn(params));
    return engine.render(params, t, K.frameAt(t), extra);
  };

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!src.el) return;
    if (K.offline) return; // an export is rendering frame by frame, at its own pace
    const running = state.playing || K.recording;
    if (running && src.kind !== 'video') tl = (tl + dt) % K.timelineLength();
    const split = state.compare && !K.recording ? state.split : -1;
    const params = K.effective();
    K.prepare.forEach((fn) => fn(params));
    const key = running ? '' : idleSignature(params, split);
    if (running || key !== idleKey) { idleKey = key; settle = SETTLE_FRAMES; }
    if (settle > 0) {
      settle--;
      const t = K.timeNow();
      engine.render(params, t, K.frameAt(t), { uSplit: split });
    }
    K.hooks.forEach((fn) => fn(now));
    updateTime();
  }
  requestAnimationFrame(tick);

  // ------------------------------------------------------------ transport
  function syncTransport() {
    $('playBtn').replaceChildren(K.icon(state.playing ? 'i-pause' : 'i-play'));
    $('playBtn').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    $('scrub').disabled = !src.el;
    $('muteBtn').hidden = src.kind !== 'video';
  }
  K.syncTransport = syncTransport;

  function togglePlay() {
    if (K.recording) return;
    state.playing = !state.playing;
    if (src.kind === 'video') {
      if (state.playing) src.el.play().catch(() => { state.playing = false; syncTransport(); });
      else src.el.pause();
    }
    syncTransport();
  }
  $('playBtn').onclick = togglePlay;
  K.togglePlay = togglePlay;

  let scrubbing = false;
  $('scrub').addEventListener('input', (e) => {
    if (!src.el) return;
    scrubbing = true;
    K.seek((e.target.value / 1000) * K.timelineLength());
    paintScrub();
  });
  $('scrub').addEventListener('change', () => { scrubbing = false; });

  function paintScrub() {
    const s = $('scrub');
    s.style.setProperty('--pct', (s.value / 10) + '%');
  }
  function updateTime() {
    const len = K.timelineLength(), t = K.timeNow();
    if (!scrubbing) $('scrub').value = Math.round((t / len) * 1000);
    $('time').textContent = K.fmtClock(t) + ' / ' + fmtTime(len);
    paintScrub();
  }

  $('muteBtn').replaceChildren(K.icon('i-sound'));
  $('muteBtn').onclick = () => {
    const b = $('muteBtn');
    const muted = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(muted));
    b.replaceChildren(K.icon(muted ? 'i-muted' : 'i-sound'));
    if (src.audio) src.audio.gain.gain.value = muted ? 0 : 1;
    else if (src.kind === 'video') src.el.muted = muted;
  };

  // what shows through the transparent parts of the preview: a dark or a light checkerboard
  function paintBackdrop() {
    vp.dataset.backdrop = K.ui.backdrop;
    $('bdBtn').setAttribute('aria-pressed', String(K.ui.backdrop === 'light'));
  }
  $('bdBtn').onclick = () => { K.ui.backdrop = K.ui.backdrop === 'light' ? 'dark' : 'light'; K.saveUi(); paintBackdrop(); };
  paintBackdrop();

  // compare split
  function placeSplit() {
    const line = $('split');
    line.hidden = !state.compare;
    if (!state.compare) return;
    const c = canvas.getBoundingClientRect(), v = vp.getBoundingClientRect();
    line.style.left = (c.left - v.left + vp.scrollLeft + c.width * state.split) + 'px';
    line.style.top = (c.top - v.top + vp.scrollTop) + 'px';
    line.style.height = c.height + 'px';
    line.style.bottom = 'auto';
  }
  K.hooks.push(placeSplit);
  function setCompare(on) {
    state.compare = on;
    $('compareBtn').setAttribute('aria-pressed', String(on));
    placeSplit();
  }
  $('compareBtn').onclick = () => setCompare(!state.compare);
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.compare) return;
    canvas.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = canvas.getBoundingClientRect();
      state.split = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    };
    move(e);
    canvas.onpointermove = move;
    canvas.onpointerup = () => { canvas.onpointermove = null; };
  });

  // the transport floats over the picture, and steps back while the clip plays untouched
  const stage = vp.parentElement;
  function wake() {
    stage.classList.remove('resting');
    clearTimeout(wake.t);
    wake.t = setTimeout(() => {
      const busy = !state.playing || K.recording || stage.querySelector('#transport:hover, #transport:focus-within');
      if (busy) wake(); else stage.classList.add('resting');
    }, 2600);
  }
  ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
  wake();

  // Preview sizing. Fitted to the window, the canvas renders at screen resolution;
  // at 100% and while exporting it renders at full size.
  function fitView() {
    if (!engine.expW) return;
    const zoomed = vp.classList.contains('zoomed');
    const dpr = window.devicePixelRatio || 1;
    let cw, ch;
    if (zoomed) {
      cw = engine.expW / dpr; ch = engine.expH / dpr;
    } else {
      // stacked phone layout: the preview sizes itself, so fit to the screen instead
      const stacked = matchMedia('(max-width: 900px)').matches;
      const aw = Math.max(60, vp.clientWidth - (stacked ? 0 : 24));
      const ah = Math.max(60, stacked ? window.innerHeight * 0.4 : vp.clientHeight - 24);
      const s = Math.min(aw / engine.expW, ah / engine.expH);
      cw = engine.expW * s; ch = engine.expH * s;
    }
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    if (!K.recording) engine.setView(zoomed ? null : Math.ceil(cw * dpr));
    placeSplit();
  }
  K.fitView = fitView;
  new ResizeObserver(() => fitView()).observe(vp);

  $('zoomBtn').onclick = () => {
    const on = !vp.classList.contains('zoomed');
    vp.classList.toggle('zoomed', on);
    $('zoomBtn').setAttribute('aria-pressed', String(on));
    fitView();
  };
  $('fsBtn').onclick = () => {
    const req = vp.requestFullscreen || vp.webkitRequestFullscreen;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (req) Promise.resolve(req.call(vp)).catch(() => toast('Fullscreen is not available here.'));
    else toast('Fullscreen is not available here.');
  };

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input:not([type=range]), select, textarea') || e.metaKey || e.ctrlKey) return;
    if (e.code === 'Space' && !e.target.closest('button')) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'c' || e.key === 'C') setCompare(!state.compare);
    else if (e.key === 'z' || e.key === 'Z') $('zoomBtn').click();
    else if (e.key === 'b' || e.key === 'B') $('bdBtn').click();
  });

  syncTransport();
  window.addEventListener('resize', fitView);
})();
