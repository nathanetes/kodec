// Kodec's Source tab: what goes onto the canvas. Either words, set here in any font on this computer
// (or a font file you load) and drawn with a clear background, or the photo or video you opened.
// Also the canvas's shape and the export size.
(function () {
  const K = window.Kodec;
  if (!K || !K.engine) return;
  const $ = (id) => document.getElementById(id);
  const { state, store, toast, el } = K;
  const TYPE_KEYS = window.KodecParams.SOURCE.find((g) => g.id === 'type').controls.map((c) => c.k);

  // ------------------------------------------------------------ fonts
  // Names the browser will find on a Mac or a PC; one that's missing falls back to Helvetica or Arial.
  const FONTS = [
    'Helvetica Neue', 'Arial', 'Arial Black', 'Impact', 'Futura', 'Avenir Next', 'Avenir Next Condensed', 'Gill Sans', 'Optima',
    'DIN Condensed', 'DIN Alternate', 'Copperplate', 'Didot', 'Bodoni 72', 'Baskerville', 'Times New Roman', 'Georgia', 'Palatino',
    'American Typewriter', 'Courier New', 'Menlo', 'Monaco', 'Chalkduster', 'Marker Felt', 'Papyrus', 'Snell Roundhand', 'Zapfino', 'VT323',
  ];
  const loaded = []; // fonts opened from files: { name, bytes }
  let fontEpoch = 0; // bumps when a font finishes loading, so the words are set again

  const idb = (fn) => new Promise((res, rej) => {
    const open = indexedDB.open('kodec', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => rej(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('kv', 'readwrite'), req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); res(req.result); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    };
  });

  async function addFont(name, bytes, keep) {
    const face = new FontFace(name, bytes.slice(0));
    await face.load();
    document.fonts.add(face);
    if (!loaded.some((f) => f.name === name)) loaded.push({ name, bytes });
    if (keep) idb((s) => s.put(loaded, 'fonts')).catch(() => {});
    fontEpoch++;
  }
  async function openFontFile(file) {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, ' ').trim().slice(0, 48) || 'My Font';
    try {
      await addFont(name, await file.arrayBuffer(), true);
    } catch (e) {
      toast('That font file could not be read. Try a TTF, OTF or WOFF.');
      return;
    }
    state.text.font = name;
    paintFonts();
    if (K.src.kind !== 'text') useText();
    K.changed('Font: ' + name);
    toast('Loaded ' + name + '. It stays in this browser.');
  }
  K.on('fontfile', openFontFile);

  function paintFonts() {
    const sel = $('fontSel');
    const names = [...loaded.map((f) => f.name), ...FONTS];
    if (!names.includes(state.text.font)) names.unshift(state.text.font);
    sel.replaceChildren(...names.map((n) => { const o = el('option', '', n); o.value = n; return o; }));
    sel.value = state.text.font;
  }
  // a font the browser fetches (or hasn't touched yet) draws in a fallback until it arrives
  function whenFontReady() {
    const spec = '700 64px "' + state.text.font + '"';
    if (document.fonts && document.fonts.load) document.fonts.load(spec).then(() => { fontEpoch++; }).catch(() => {});
  }

  // ------------------------------------------------------------ setting the words
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const hex = (v) => '#' + Math.round(v).toString(16).padStart(6, '0');
  const NATIVE_SPACING = 'letterSpacing' in g;

  // one line's width at size S, and a way to draw it; tracking is added between letters, not after the last
  function lineWidth(line, track) {
    if (!line) return 0;
    if (NATIVE_SPACING) { g.letterSpacing = track + 'px'; return g.measureText(line).width - track; }
    let w = 0;
    for (const ch of line) w += g.measureText(ch).width + track;
    return w - track;
  }
  function drawLine(line, track, paint) {
    if (NATIVE_SPACING) { g.letterSpacing = track + 'px'; paint(line, 0); return; }
    let x = 0;
    for (const ch of line) { paint(ch, x); x += g.measureText(ch).width + track; }
  }

  function setType(p) {
    const T = state.text;
    const lines = (T.caps ? T.str.toUpperCase() : T.str).split('\n');
    const font = (S) => Math.round(p.tWeight) + ' ' + S + 'px "' + T.font + '", "Helvetica Neue", Helvetica, Arial, sans-serif';
    const stretch = p.tStretch, tan = Math.tan((p.tSlant * Math.PI) / 180);
    const style = Math.round(p.tStyle), outline = style > 0 ? p.tStroke : 0;

    // measure at a working size, then scale so the long side matches the export
    const S0 = 200;
    g.font = font(S0);
    const widths = lines.map((l) => lineWidth(l, p.tTrack * S0) * stretch);
    const blockH0 = S0 * (1.08 + (lines.length - 1) * p.tLead);
    const pad0 = (p.tMargin + outline) * S0;
    const W0 = Math.max(S0 * 0.5, ...widths) + Math.abs(tan) * blockH0 + 2 * pad0;
    const H0 = blockH0 + 2 * pad0;
    const k = K.longSide() / Math.max(W0, H0);
    const S = S0 * k, W = Math.max(16, Math.round(W0 * k)), H = Math.max(16, Math.round(H0 * k));
    const resized = cv.width !== W || cv.height !== H;
    cv.width = W; cv.height = H; // also clears it

    g.font = font(S);
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.fillStyle = hex(p.tFill);
    g.strokeStyle = hex(p.tStrokeColor);
    g.lineWidth = Math.max(1, outline * S * 2) / Math.max(stretch, 0.3);
    const inner = W - 2 * pad0 * k - Math.abs(tan) * blockH0 * k;
    lines.forEach((line, i) => {
      const lw = widths[i] * k;
      const x = pad0 * k + Math.abs(tan) * blockH0 * k * 0.5 + (T.align === 'left' ? 0 : T.align === 'right' ? inner - lw : (inner - lw) / 2);
      const y = pad0 * k + S * 0.86 + i * p.tLead * S;
      g.save();
      g.translate(x - tan * (y - H / 2), y);
      g.transform(stretch, 0, -tan, 1, 0, 0);
      drawLine(line, p.tTrack * S, (text, dx) => {
        if (style > 0) g.strokeText(text, dx, 0);
        if (style !== 1) g.fillText(text, dx, 0);
      });
      g.restore();
    });
    return resized;
  }

  let textKey = '';
  const keyOf = (p) => {
    const T = state.text;
    return [T.str, T.font, T.align, T.caps, fontEpoch, K.longSide(), ...TYPE_KEYS.map((k) => p[k])].join('\u0001');
  };
  // before each frame: if the words or their settings changed, set them again
  K.prepare.push((p) => {
    if (K.src.kind !== 'text') return;
    const key = keyOf(p);
    if (key === textKey) return;
    textKey = key;
    const resized = setType(p);
    K.src.stamp++;
    if (resized) {
      K.src.w = cv.width; K.src.h = cv.height;
      K.engine.setSource(cv, cv.width, cv.height, false);
      K.applyOutput();
    } else {
      K.engine.srcDirty = true;
    }
  });

  const slug = () => (state.text.str.split('\n')[0].replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'kodec').slice(0, 40);
  function useText() {
    const p = K.effective();
    textKey = keyOf(p);
    setType(p);
    K.useSource('text', cv, cv.width, cv.height, slug());
    whenFontReady();
  }

  // ------------------------------------------------------------ the tab
  const setKind = K.segmented($('kindSeg'), [['text', 'Text'], ['media', 'Photo or Video']], 'text', (v) => {
    if (K.recording) { paintKind(); return; }
    if (v === 'text') useText();
    else if (K.media) K.useMedia();
    else { paintKind(); $('file').click(); }
  });
  function paintKind() {
    const text = K.src.kind === 'text';
    setKind(text ? 'text' : 'media');
    $('textBox').hidden = !text;
    $('typeSec').hidden = !text;
    $('mediaBox').hidden = text;
    if (!text) $('mediaNote').textContent = K.src.name + ' · ' + K.src.w + '×' + K.src.h + (K.src.kind === 'video' ? ' · video' : '');
  }
  K.on('source', paintKind);
  $('mediaOpen').onclick = () => $('file').click();

  const input = $('textIn');
  input.oninput = () => {
    state.text.str = input.value;
    K.src.name = slug();
    K.changed('Text');
  };
  $('fontSel').onchange = (e) => { state.text.font = e.target.value; whenFontReady(); K.changed('Font: ' + e.target.value); };
  $('fontBtn').onclick = () => $('fontFile').click();
  $('fontFile').onchange = (e) => { if (e.target.files[0]) openFontFile(e.target.files[0]); e.target.value = ''; };
  const setAlign = K.segmented($('alignSeg'), [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], state.text.align, (v) => { state.text.align = v; K.changed('Align'); }, 'sm');
  const setCaps = K.segmented($('capsSeg'), [[true, 'ALL CAPS'], [false, 'As Typed']], state.text.caps, (v) => { state.text.caps = v; K.changed('Case'); }, 'sm');
  function paintText() {
    input.value = state.text.str;
    paintFonts();
    setAlign(state.text.align);
    setCaps(state.text.caps);
  }
  K.on('text', paintText); // undo, redo and the saved session land here

  // ------------------------------------------------------------ canvas shape and export size
  const sizeSel = $('outSize');
  [['1080', '1080 px'], ['2000', '2000 px'], ['3000', '3000 px · cover art'], ['4096', '4096 px'], ['6000', '6000 px · print'], ['source', 'Source size']]
    .filter(([v]) => v === 'source' || +v <= K.sizeCap())
    .forEach(([v, l]) => { const o = el('option', '', l); o.value = v; sizeSel.append(o); });
  sizeSel.onchange = () => { K.setOut(sizeSel.value); store('kodec.out', sizeSel.value); };
  $('shapeSel').onchange = (e) => { K.setShape(+e.target.value); store('kodec.shape', +e.target.value); };
  K.paintCanvas = () => { sizeSel.value = state.out; $('shapeSel').value = String(state.shape); };

  const savedOut = store('kodec.out');
  if (savedOut && [...sizeSel.options].some((o) => o.value === savedOut)) state.out = savedOut;
  const savedShape = store('kodec.shape');
  if (Number.isFinite(savedShape)) state.shape = savedShape;
  K.paintCanvas();

  // ------------------------------------------------------------ start
  paintText();
  useText();
  idb((s) => s.get('fonts')).then(async (list) => {
    for (const f of list || []) await addFont(f.name, f.bytes, false).catch(() => {});
    paintFonts();
  }).catch(() => {});
})();
