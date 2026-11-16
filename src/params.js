// Kodec controls, quick macros and factory looks.
// Control fields: k key, l label, min/max/step, d default, n value when the module is switched off,
// u unit, opts for stepped choices, pow = the slider follows this power curve so small values get
// most of its travel, dp = decimals shown, color = a colour held as 0xRRGGBB, keep = part of the
// layout (type, placement, background) rather than the look, so looks, Reset and Randomize leave it alone.
(function () {
  const pick = (labels) => labels.map((l, v) => ({ v, l }));
  const amt = (k, l, d = 0, extra = {}) => ({ k, l, min: 0, max: 1, step: 0.01, d, n: 0, ...extra });
  const keep = (c) => ({ ...c, keep: 1 });

  const MASTER = [
    { k: 'mix', l: 'Intensity', min: 0, max: 1, step: 0.01, d: 1 },
    { k: 'opacity', l: 'Opacity', min: 0, max: 1, step: 0.01, d: 1 },
  ];

  // Quick macros scale whole families of controls away from (or toward) neutral.
  const MACROS = [
    { k: 'mWarp', l: 'Warp', keys: ['warp', 'drag', 'dragSkew', 'dragJitter', 'split'] },
    { k: 'mPrint', l: 'Print', keys: ['thr', 'ht', 'dith', 'poster'] },
    { k: 'mTexture', l: 'Texture', keys: ['film', 'dust', 'scratch', 'fibre', 'toner', 'rough'] },
    { k: 'mGlow', l: 'Glow', keys: ['glow', 'halation', 'leak'] },
    { k: 'mColor', l: 'Color', keys: ['preSat', 'preTemp', 'preTint', 'preHue', 'hue', 'sat', 'temp', 'tintGM', 'shAmt', 'hiAmt', 'gmap', 'cross', 'solar', 'burn', 'irid'] },
    { k: 'mGlitch', l: 'Glitch', keys: ['g1Amt', 'g2Amt', 'g3Amt', 'g4Amt'] },
  ].map((m) => ({ ...m, min: 0, max: 2, step: 0.01, d: 1 }));

  // ------------------------------------------------------------ the Source tab
  // Type sets the words; Place puts the source on the canvas; Canvas is what's behind it.
  const TYPE = {
    id: 'type', title: 'Type',
    controls: [
      { k: 'tWeight', l: 'Weight', min: 100, max: 900, step: 100, d: 700 },
      { k: 'tTrack', l: 'Tracking', min: -0.15, max: 1.5, step: 0.005, d: 0, u: 'em' },
      { k: 'tLead', l: 'Line Height', min: 0.6, max: 2.5, step: 0.01, d: 1.05 },
      { k: 'tStretch', l: 'Width', min: 0.3, max: 3, step: 0.01, d: 1, u: 'condensed → extended' },
      { k: 'tSlant', l: 'Slant', min: -40, max: 40, step: 0.5, d: 0, u: '°' },
      { k: 'tFill', l: 'Fill', d: 0xffffff, color: 1 },
      { k: 'tStyle', l: 'Style', d: 0, opts: pick(['Filled', 'Outline', 'Filled + Outline']) },
      { k: 'tStroke', l: 'Outline Width', min: 0.002, max: 0.2, step: 0.001, d: 0.02, u: 'em', pow: 2, dp: 3 },
      { k: 'tStrokeColor', l: 'Outline Color', d: 0xffffff, color: 1 },
      { k: 'tMargin', l: 'Margin', min: 0, max: 2, step: 0.01, d: 0.4, u: 'room around the words for warps and glow' },
    ].map(keep),
  };
  const PLACE = {
    id: 'place', title: 'Place',
    controls: [
      { k: 'pScale', l: 'Scale', min: 0.05, max: 4, step: 0.005, d: 1, pow: 2 },
      { k: 'pX', l: 'Across', min: -1, max: 1, step: 0.002, d: 0, dp: 3 },
      { k: 'pY', l: 'Up', min: -1, max: 1, step: 0.002, d: 0, dp: 3 },
      { k: 'pRot', l: 'Rotation', min: -180, max: 180, step: 0.1, d: 0, u: '°' },
      { k: 'pFit', l: 'Fit', d: 0, opts: pick(['Fit Inside', 'Fill the Canvas']) },
    ].map(keep),
  };
  const CANVAS = {
    id: 'canvas', title: 'Canvas',
    controls: [
      { k: 'bg', l: 'Background', d: 0, opts: pick(['Transparent', 'Color']) },
      { k: 'bgColor', l: 'Background Color', d: 0x0a0a0a, color: 1 },
    ].map(keep),
  };
  const SOURCE = [TYPE, PLACE, CANVAS];

  // one glitch slot: what breaks, when, where, which way, how it moves, and what colour it comes out
  const glitchSlot = (i) => {
    const g = (s) => 'g' + i + s;
    return {
      id: 'glitch' + i, title: 'Glitch ' + i,
      hint: i === 1 ? 'Four slots, each breaking the picture its own way. Open Amount with its arrow for size, position, direction, movement, edges and color. Erase cuts the bands clean out of the picture.' : '',
      controls: [
        amt(g('Amt'), 'Amount'),
        { k: g('Type'), l: 'Type', d: [0, 7, 8, 5][i - 1], opts: pick(['Slice Shift', 'Block Shift', 'Line Hold', 'Mosaic', 'Pixel Sort', 'Sparkle Dashes', 'Streaks', 'RGB Tear', 'Erase', 'Invert']) },
        { k: g('Rate'), l: 'How Often', min: 0.05, max: 30, step: 0.01, d: 2, u: '/s', pow: 2 },
        { k: g('Len'), l: 'How Long', min: 0.01, max: 3, step: 0.01, d: 3, u: 's', pow: 2 },
        { k: g('Chance'), l: 'Chance', min: 0, max: 1, step: 0.01, d: 1 },
        { k: g('Size'), l: 'Height', min: 0.01, max: 1, step: 0.01, d: 0.35 },
        { k: g('Width'), l: 'Width', min: 0.02, max: 1, step: 0.01, d: 1 },
        { k: g('Count'), l: 'Bands', min: 1, max: 128, step: 1, d: 24, pow: 2 },
        { k: g('Pos'), l: 'Position', min: 0, max: 1, step: 0.01, d: 0.5 },
        { k: g('Spread'), l: 'Random Position', min: 0, max: 1, step: 0.01, d: 0 },
        { k: g('Dir'), l: 'Direction', min: 0, max: 360, step: 1, d: 0, u: '°' },
        { k: g('Move'), l: 'Movement', d: 0, opts: pick(['Still', 'Jump', 'Scan Forward', 'Scan Back', 'Sway', 'Bounce']) },
        { k: g('Speed'), l: 'Move Speed', min: 0, max: 4, step: 0.01, d: 0.5 },
        { k: g('Edge'), l: 'Stepped Edges', min: 0, max: 1, step: 0.01, d: 0.25 },
        { k: g('Color'), l: 'Color', d: [0xff2a2a, 0x2a7bff, 0xffffff, 0x35ff8a][i - 1], color: 1 },
        { k: g('Tint'), l: 'Tint', min: 0, max: 1, step: 0.01, d: 0 },
        { k: g('Blend'), l: 'Blend', d: 0, opts: pick(['Normal', 'Add', 'Screen', 'Multiply', 'Difference', 'Color']) },
        { k: g('Seed'), l: 'Pattern', min: 0, max: 99, step: 1, d: i },
      ],
    };
  };

  const GROUPS = [
    {
      id: 'scan', title: 'Scan Drag', hint: 'The page moved while the scanner was reading it. Amount slides the rows sideways; Stretch pulls them long and squashes them short. Change Pattern until the bends land where you want them.',
      controls: [
        amt('drag', 'Amount'),
        { k: 'dragSmear', l: 'Stretch', min: 0, max: 1, step: 0.01, d: 0.5 },
        { k: 'dragScale', l: 'Wave Size', min: 0, max: 1, step: 0.01, d: 0.35, u: 'long drifts → short tugs' },
        { k: 'dragJerk', l: 'Jerk', min: 0, max: 1, step: 0.01, d: 0.3, u: 'smooth → sudden' },
        { k: 'dragSeed', l: 'Pattern', min: 0, max: 99, step: 1, d: 1 },
        { k: 'dragAxis', l: 'Scan Direction', d: 0, opts: pick(['Down the Page', 'Across the Page']) },
        { k: 'dragSkew', l: 'Lean', min: -1, max: 1, step: 0.01, d: 0, n: 0 },
        amt('dragJitter', 'Line Jitter'),
        { k: 'dragSpeed', l: 'Speed', min: 0, max: 3, step: 0.01, d: 0.3, u: 'how fast it moves when played' },
      ],
    },
    {
      id: 'warp', title: 'Warp', hint: 'Bends the whole picture. Edges decides what a warp finds past the picture\'s border.',
      controls: [
        amt('warp', 'Warp'),
        { k: 'warpType', l: 'Type', d: 0, opts: pick(['Flow', 'Liquid', 'Horizontal Waves', 'Vertical Waves', 'Ripple', 'Swirl', 'Mirror Fold', 'Pinch & Bulge', 'Arch', 'Squeeze']) },
        { k: 'warpScale', l: 'Scale', min: 0, max: 1, step: 0.01, d: 0.3 },
        { k: 'warpSpeed', l: 'Speed', min: 0, max: 3, step: 0.01, d: 0.5 },
        { k: 'warpTurb', l: 'Turbulence', min: 0, max: 1, step: 0.01, d: 0.3 },
        { k: 'warpStutter', l: 'Stutter', min: 0, max: 1, step: 0.01, d: 0 },
        { k: 'warpEdge', l: 'Edges', d: 0, opts: pick(['Transparent', 'Extend', 'Mirror', 'Tile']) },
      ],
    },
    {
      id: 'edge', title: 'Ink & Edge', hint: 'Works on the outline of text and cut-outs: ink soaking into the paper, a worn photocopy edge, plates printed out of register.',
      controls: [
        { k: 'spread', l: 'Ink Spread', min: -1, max: 1, step: 0.01, d: 0, n: 0, u: 'choke ← → bleed' },
        amt('rough', 'Rough Edge'),
        { k: 'roughSize', l: 'Rough Size', min: 0, max: 1, step: 0.01, d: 0.3 },
        amt('soften', 'Soften'),
        { k: 'edgeSize', l: 'Reach', min: 0, max: 1, step: 0.01, d: 0.2, u: 'how far from the edge it works' },
        amt('split', 'Misregister'),
        { k: 'splitAngle', l: 'Misregister Angle', min: 0, max: 360, step: 1, d: 0, u: '°' },
      ],
    },
    {
      id: 'pregrade', title: 'Pre Grade', hint: 'Grades the source before anything else, so print, glow and the grade all work on the graded picture.',
      controls: [
        { k: 'preExp', l: 'Exposure', min: -3, max: 3, step: 0.01, d: 0, n: 0, u: 'EV' },
        { k: 'preBright', l: 'Brightness', min: -0.5, max: 0.5, step: 0.005, d: 0, n: 0 },
        { k: 'preContrast', l: 'Contrast', min: 0, max: 2.5, step: 0.01, d: 1, n: 1 },
        { k: 'preSat', l: 'Saturation', min: 0, max: 2, step: 0.01, d: 1, n: 1 },
        { k: 'preTemp', l: 'Temperature', min: -1, max: 1, step: 0.01, d: 0, n: 0 },
        { k: 'preTint', l: 'Tint', min: -1, max: 1, step: 0.01, d: 0, n: 0 },
        { k: 'preHue', l: 'Hue Shift', min: -180, max: 180, step: 1, d: 0, n: 0, u: '°' },
      ],
    },
    {
      id: 'grade', title: 'Color Grade', hint: 'Exposure, contrast and color, then split toning, gradient maps and curves.',
      controls: [
        { k: 'postExp', l: 'Exposure', min: -3, max: 3, step: 0.01, d: 0, n: 0, u: 'EV' },
        { k: 'bright', l: 'Brightness', min: -0.5, max: 0.5, step: 0.005, d: 0, n: 0 },
        { k: 'contrast', l: 'Contrast', min: 0, max: 2.5, step: 0.01, d: 1, n: 1 },
        { k: 'sat', l: 'Saturation', min: 0, max: 2, step: 0.01, d: 1, n: 1 },
        { k: 'hue', l: 'Hue Shift', min: -180, max: 180, step: 1, d: 0, n: 0, u: '°' },
        { k: 'temp', l: 'Temperature', min: -1, max: 1, step: 0.01, d: 0, n: 0 },
        { k: 'tintGM', l: 'Tint', min: -1, max: 1, step: 0.01, d: 0, n: 0 },
        { k: 'shHue', l: 'Shadow Color', min: 0, max: 360, step: 1, d: 200, u: '°' },
        amt('shAmt', 'Shadow Tint'),
        { k: 'hiHue', l: 'Highlight Color', min: 0, max: 360, step: 1, d: 35, u: '°' },
        amt('hiAmt', 'Highlight Tint'),
        amt('gmap', 'Gradient Map'),
        { k: 'gmPal', l: 'Palette', d: 1, opts: pick(['Two Hues', 'Your Three Colors', 'Red Room', 'Thermal', 'Night Blue', 'Acid', 'Sunset', 'Ultraviolet']) },
        { k: 'gmA', l: 'Shadows', d: 0x05050a, color: 1 },
        { k: 'gmB', l: 'Midtones', d: 0xc01818, color: 1 },
        { k: 'gmC', l: 'Highlights', d: 0xffd9a0, color: 1 },
        amt('cross', 'Cross Process'),
        { k: 'lift', l: 'Black Level', min: -0.2, max: 0.3, step: 0.005, d: 0, n: 0 },
        { k: 'gamma', l: 'Gamma', min: 0.4, max: 2.5, step: 0.01, d: 1, n: 1 },
        amt('solar', 'Solarize'),
        amt('poster', 'Posterize'),
        amt('invert', 'Invert'),
        { k: 'chanSwap', l: 'Channel Swap', d: 0, n: 0, opts: pick(['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR']) },
      ],
    },
    {
      id: 'colorfx', title: 'Color FX', hint: 'Big color moves that stay fully adjustable: burn, oil-slick iridescence, hue cycling and light leaks.',
      controls: [
        amt('burn', 'Burn'),
        amt('irid', 'Iridescence'),
        { k: 'iridBands', l: 'Bands', min: 0.2, max: 6, step: 0.01, d: 1.6 },
        { k: 'iridLo', l: 'Tones From', min: 0, max: 1, step: 0.01, d: 0.45 },
        { k: 'iridHi', l: 'Tones To', min: 0, max: 1.2, step: 0.01, d: 1.2 },
        { k: 'iridWarp', l: 'Swirl', min: 0, max: 1, step: 0.01, d: 0.5 },
        { k: 'iridSpeed', l: 'Flow Speed', min: 0, max: 1, step: 0.01, d: 0.1 },
        { k: 'iridShift', l: 'Color Shift', min: 0, max: 1, step: 0.01, d: 0 },
        { k: 'hueSpeed', l: 'Hue Cycle', min: -1, max: 1, step: 0.01, d: 0, n: 0, u: 'turns a second' },
        { k: 'hueLuma', l: 'Hue by Brightness', min: -2, max: 2, step: 0.01, d: 0, n: 0 },
        { k: 'huePos', l: 'Hue Across Picture', min: -2, max: 2, step: 0.01, d: 0, n: 0 },
        amt('leak', 'Light Leak'),
        { k: 'leakColor', l: 'Leak Color', d: 0xff4a18, color: 1 },
        { k: 'leakPos', l: 'Leak Side', min: 0, max: 1, step: 0.01, d: 0 },
        { k: 'leakSize', l: 'Leak Size', min: 0.05, max: 1, step: 0.01, d: 0.45 },
        { k: 'leakSpeed', l: 'Leak Movement', min: 0, max: 2, step: 0.01, d: 0.4 },
      ],
    },
    {
      id: 'mixer', title: 'Channel Mixer', hint: 'How much of each color goes into each output channel.',
      controls: [
        { k: 'mxRR', l: 'Red from Red', min: -1, max: 2, step: 0.01, d: 1, n: 1 },
        { k: 'mxRG', l: 'Red from Green', min: -1, max: 2, step: 0.01, d: 0, n: 0 },
        { k: 'mxRB', l: 'Red from Blue', min: -1, max: 2, step: 0.01, d: 0, n: 0 },
        { k: 'mxGR', l: 'Green from Red', min: -1, max: 2, step: 0.01, d: 0, n: 0 },
        { k: 'mxGG', l: 'Green from Green', min: -1, max: 2, step: 0.01, d: 1, n: 1 },
        { k: 'mxGB', l: 'Green from Blue', min: -1, max: 2, step: 0.01, d: 0, n: 0 },
        { k: 'mxBR', l: 'Blue from Red', min: -1, max: 2, step: 0.01, d: 0, n: 0 },
        { k: 'mxBG', l: 'Blue from Green', min: -1, max: 2, step: 0.01, d: 0, n: 0 },
        { k: 'mxBB', l: 'Blue from Blue', min: -1, max: 2, step: 0.01, d: 1, n: 1 },
      ],
    },
    {
      id: 'print', title: 'Stipple & Print', hint: 'Turns the picture into ink: grainy stipple, a clean screen print, halftone screens or a dither. Ink and Paper are under Stipple; set Transparency to Light Areas to keep the ink alone.',
      controls: [
        amt('thr', 'Stipple'),
        { k: 'thrLevel', l: 'Threshold', min: 0, max: 1, step: 0.01, d: 0.5 },
        { k: 'thrSoft', l: 'Softness', min: 0, max: 1, step: 0.01, d: 0.05 },
        { k: 'thrGrain', l: 'Grain', min: 0, max: 1, step: 0.01, d: 0.6, u: '0 is a clean screen print' },
        { k: 'thrSize', l: 'Grain Size', min: 0, max: 1, step: 0.01, d: 0.15 },
        { k: 'thrDetail', l: 'Detail', min: 0, max: 1, step: 0.01, d: 0.5, u: 'keeps features visible' },
        { k: 'thrPrint', l: 'Paper Texture', min: 0, max: 1, step: 0.01, d: 0.2 },
        { k: 'ink', l: 'Ink', d: 0x050506, color: 1 },
        { k: 'paper', l: 'Paper', d: 0xf5f2ea, color: 1 },
        amt('ht', 'Halftone'),
        { k: 'htType', l: 'Screen', d: 0, opts: pick(['Dots', 'Lines', 'Diamonds', 'Squares']) },
        { k: 'htSize', l: 'Screen Size', min: 0, max: 1, step: 0.01, d: 0.3 },
        { k: 'htAngle', l: 'Screen Angle', min: 0, max: 180, step: 1, d: 45, u: '°' },
        { k: 'htMode', l: 'Halftone Color', d: 0, opts: pick(['Darken the Picture', 'Ink & Paper']) },
        amt('dith', 'Dither'),
        { k: 'dithLevels', l: 'Levels', min: 2, max: 16, step: 1, d: 2 },
        { k: 'dithSize', l: 'Pixel Size', min: 0, max: 1, step: 0.01, d: 0.2 },
        { k: 'dithMode', l: 'Dither Color', d: 0, opts: pick(['The Picture\'s Colors', 'Ink & Paper']) },
      ],
    },
    {
      id: 'screen', title: 'Screen', hint: 'A monitor\'s face without the rest of the TV: raster lines, a phosphor grid and single-color tubes. Cut Out makes the lines slice through the shape itself.',
      controls: [
        amt('scan', 'Scanlines'),
        { k: 'scanCount', l: 'Line Count', min: 8, max: 1200, step: 1, d: 180, pow: 2 },
        { k: 'scanSoft', l: 'Line Softness', min: 0, max: 1, step: 0.01, d: 0.6 },
        { k: 'scanMode', l: 'Lines', d: 0, opts: pick(['Darken', 'Cut Out']) },
        amt('mask', 'Phosphor Grid'),
        { k: 'maskScale', l: 'Grid Scale', min: 0, max: 1, step: 0.01, d: 0.3 },
        { k: 'mono', l: 'Tube Color', d: 0, n: 0, opts: pick(['Full Color', 'Green', 'Amber', 'White', 'Your Color']) },
        { k: 'monoColor', l: 'Your Tube Color', d: 0x35e0a0, color: 1 },
        amt('vignette', 'Vignette'),
      ],
    },
    {
      id: 'glow', title: 'Glow', hint: 'Light spilling out of the bright parts and past the edge of the shape, so it carries into the transparent area too.',
      controls: [
        amt('glow', 'Glow'),
        { k: 'glowSize', l: 'Glow Size', min: 0, max: 1, step: 0.01, d: 0.4 },
        { k: 'glowThresh', l: 'Glow From', min: 0, max: 1, step: 0.01, d: 0.3, u: 'everything → only highlights' },
        amt('halation', 'Halation'),
        { k: 'haloColor', l: 'Halation Color', d: 0xff5224, color: 1 },
      ],
    },
    {
      id: 'texture', title: 'Grain & Texture', hint: 'Film grain that clumps, dust and scratches, paper fibre, and a photocopier\'s stray toner.',
      controls: [
        amt('film', 'Film Grain'),
        { k: 'filmSize', l: 'Grain Size', min: 0, max: 1, step: 0.01, d: 0.3 },
        { k: 'filmColor', l: 'Grain Color', min: 0, max: 1, step: 0.01, d: 0.3, u: 'mono → rgb' },
        { k: 'filmResp', l: 'Grain Response', min: 0, max: 1, step: 0.01, d: 0.5, u: 'shadows → highlights' },
        { k: 'filmVar', l: 'Grain Variation', min: 0, max: 1, step: 0.01, d: 0.3 },
        amt('dust', 'Dust'),
        amt('scratch', 'Scratches'),
        { k: 'dustOpacity', l: 'Dust Opacity', min: 0, max: 1, step: 0.01, d: 1 },
        { k: 'dustSize', l: 'Dust Size', min: 0, max: 1, step: 0.01, d: 0.4 },
        { k: 'dustSoft', l: 'Dust Softness', min: 0, max: 1, step: 0.01, d: 0.4 },
        { k: 'dustHold', l: 'Dust Hold', min: 0, max: 1, step: 0.01, d: 0, u: 'how long specks stay' },
        amt('fibre', 'Paper Fibre'),
        { k: 'fibreScale', l: 'Fibre Size', min: 0, max: 1, step: 0.01, d: 0.3 },
        amt('toner', 'Toner Specks'),
        { k: 'tonerSize', l: 'Speck Size', min: 0, max: 1, step: 0.01, d: 0.3 },
      ],
    },
    glitchSlot(1), glitchSlot(2), glitchSlot(3), glitchSlot(4),
    {
      id: 'alpha', title: 'Transparency', hint: 'Clears part of the picture for the export. Light Areas leaves only the ink, ready for a shirt or a sleeve; Dark Areas leaves only the light.',
      controls: [
        { k: 'knock', l: 'Clear', d: 0, n: 0, opts: pick(['Nothing', 'Light Areas', 'Dark Areas']) },
        { k: 'knockLevel', l: 'Level', min: 0, max: 1, step: 0.01, d: 0.5 },
        { k: 'knockSoft', l: 'Softness', min: 0, max: 1, step: 0.01, d: 0.1 },
      ],
    },
  ];

  // Detail controls live in a dropdown under the control they belong to, so a module opens simple
  const UNDER = {
    drag: ['dragSmear', 'dragScale', 'dragJerk', 'dragSeed', 'dragAxis', 'dragSpeed'],
    warp: ['warpType', 'warpScale', 'warpSpeed', 'warpTurb', 'warpStutter', 'warpEdge'],
    rough: ['roughSize'], split: ['splitAngle'],
    shAmt: ['shHue'], hiAmt: ['hiHue'], gmap: ['gmPal', 'gmA', 'gmB', 'gmC'],
    irid: ['iridBands', 'iridLo', 'iridHi', 'iridWarp', 'iridSpeed', 'iridShift'],
    leak: ['leakColor', 'leakPos', 'leakSize', 'leakSpeed'],
    thr: ['thrLevel', 'thrDetail', 'thrSoft', 'thrGrain', 'thrSize', 'thrPrint', 'ink', 'paper'],
    ht: ['htType', 'htSize', 'htAngle', 'htMode'], dith: ['dithLevels', 'dithSize', 'dithMode'],
    scan: ['scanCount', 'scanSoft', 'scanMode'], mask: ['maskScale'],
    glow: ['glowSize', 'glowThresh'], halation: ['haloColor'],
    film: ['filmSize', 'filmColor', 'filmResp', 'filmVar'], dust: ['dustOpacity', 'dustSize', 'dustSoft', 'dustHold'],
    fibre: ['fibreScale'], toner: ['tonerSize'],
  };
  [1, 2, 3, 4].forEach((i) => {
    UNDER['g' + i + 'Amt'] = ['Rate', 'Len', 'Chance', 'Size', 'Width', 'Count', 'Pos', 'Spread', 'Dir', 'Move', 'Speed', 'Edge', 'Color', 'Tint', 'Blend', 'Seed'].map((s) => 'g' + i + s);
  });

  const ALL = [...MASTER, ...MACROS, ...SOURCE.flatMap((g) => g.controls), ...GROUPS.flatMap((g) => g.controls)];
  const DEFAULTS = {};
  const BY_KEY = {};
  ALL.forEach((c) => { DEFAULTS[c.k] = c.d; BY_KEY[c.k] = c; });
  for (const parent in UNDER) UNDER[parent].forEach((k) => { BY_KEY[k].of = parent; });
  const KEEP = ALL.filter((c) => c.keep).map((c) => c.k);

  // Factory looks. Each one is laid over the defaults, which leave the picture untouched.
  const INK_ONLY = { knock: 1, knockLevel: 0.5, knockSoft: 0.1 };
  const PRESETS = [
    // Type: made for words and cut-outs, and everything here keeps the background clear
    { cat: 'Type', name: 'Init', p: {} },
    { cat: 'Type', name: 'Scan Drag', p: { drag: 0.55, dragSmear: 0.6, dragScale: 0.32, dragJerk: 0.35, dragSeed: 4, rough: 0.25, roughSize: 0.15, spread: 0.08 } },
    { cat: 'Type', name: 'Moved the Page', p: { drag: 0.8, dragSmear: 0.9, dragScale: 0.5, dragJerk: 0.7, dragSeed: 12, dragSkew: 0.15, dragJitter: 0.3, rough: 0.3, toner: 0.25 } },
    { cat: 'Type', name: 'Photocopy', p: { spread: 0.12, rough: 0.55, roughSize: 0.12, toner: 0.55, tonerSize: 0.2, contrast: 1.3, drag: 0.08, dragSmear: 0.2, dragJitter: 0.25 } },
    { cat: 'Type', name: 'Tenth Generation', p: { spread: 0.18, rough: 0.75, roughSize: 0.35, edgeSize: 0.15, toner: 0.9, tonerSize: 0.45, drag: 0.1, dragScale: 0.7, dragJitter: 0.5, dragSkew: 0.04 } },
    { cat: 'Type', name: 'Ink Bleed', p: { spread: 0.5, soften: 0.1, edgeSize: 0.3, rough: 0.2, roughSize: 0.5, fibre: 0.5 } },
    { cat: 'Type', name: 'Liquid', p: { warp: 0.55, warpType: 1, warpScale: 0.22, warpTurb: 0.6, warpSpeed: 0.4 } },
    { cat: 'Type', name: 'Heat Haze', p: { warp: 0.35, warpType: 0, warpScale: 0.5, warpTurb: 0.7, soften: 0.1, glow: 0.3, glowSize: 0.3 } },
    { cat: 'Type', name: 'Flag', p: { warp: 0.5, warpType: 3, warpScale: 0.12, warpTurb: 0.2, warpSpeed: 0.6 } },
    { cat: 'Type', name: 'Arch', p: { warp: 0.5, warpType: 8, warpScale: 1, warpTurb: 0 } },
    { cat: 'Type', name: 'Cut Lines', p: { scan: 1, scanMode: 1, scanCount: 46, scanSoft: 0.05, g1Amt: 0.35, g1Type: 0, g1Count: 14, g1Size: 0.5, g1Spread: 0 } },
    { cat: 'Type', name: 'Off Register', p: { split: 0.55, splitAngle: 20, rough: 0.15, fibre: 0.35 } },
    { cat: 'Type', name: 'Neon Tube', p: { glow: 0.9, glowSize: 0.55, glowThresh: 0.05, halation: 0.6, soften: 0.06, film: 0.1 } },
    { cat: 'Type', name: 'Sliced', p: { g1Amt: 0.7, g1Type: 0, g1Count: 18, g1Size: 0.7, g1Edge: 0.4, g2Amt: 0.6, g2Type: 7, g2Size: 0.5, g2Count: 30, g3Amt: 0.5, g3Type: 8, g3Count: 60, g3Size: 0.9 } },

    // Print: the picture as ink on paper
    { cat: 'Print', name: 'Stipple', p: { thr: 1, thrLevel: 0.55, thrGrain: 0.9, thrDetail: 0.7, thrSize: 0.12, thrSoft: 0.02, ink: 0x000000, paper: 0xffffff } },
    { cat: 'Print', name: 'Stipple, Ink Only', p: { thr: 1, thrLevel: 0.55, thrGrain: 0.9, thrDetail: 0.7, thrSize: 0.12, thrSoft: 0.02, thrPrint: 0, ink: 0x000000, paper: 0xffffff, ...INK_ONLY } },
    { cat: 'Print', name: 'Stipple Red', p: { thr: 1, thrLevel: 0.52, thrGrain: 0.75, thrDetail: 0.6, thrSize: 0.05, thrSoft: 0.15, ink: 0x080000, paper: 0xb80000 } },
    { cat: 'Print', name: 'Screen Print', p: { thr: 1, thrLevel: 0.46, thrGrain: 0.03, thrDetail: 0.85, thrSoft: 0.03, thrPrint: 0.5, ink: 0xc40f16, paper: 0x0b9fe0 } },
    { cat: 'Print', name: 'Acid Print', p: { thr: 1, thrLevel: 0.42, thrGrain: 0.1, thrDetail: 0.85, thrSoft: 0.02, thrPrint: 0.7, ink: 0x14171a, paper: 0x3cea62, ht: 0.25, htSize: 0.08 } },
    { cat: 'Print', name: 'Halftone', p: { sat: 0, contrast: 1.2, ht: 1, htMode: 1, htSize: 0.22, htAngle: 45, ink: 0x0a0a0a, paper: 0xf2efe6, fibre: 0.3 } },
    { cat: 'Print', name: 'Halftone, Ink Only', p: { sat: 0, contrast: 1.2, ht: 1, htMode: 1, htSize: 0.22, htAngle: 45, ink: 0x000000, paper: 0xffffff, ...INK_ONLY } },
    { cat: 'Print', name: 'Newsprint', p: { sat: 0.25, contrast: 1.15, ht: 0.85, htSize: 0.14, htAngle: 30, fibre: 0.7, temp: 0.25, lift: 0.06, film: 0.15, split: 0.08 } },
    { cat: 'Print', name: 'Line Engraving', p: { sat: 0, contrast: 1.3, ht: 1, htType: 1, htMode: 1, htSize: 0.16, htAngle: 20, ink: 0x10100f, paper: 0xece6d6, fibre: 0.4 } },
    { cat: 'Print', name: 'Risograph', p: { gmap: 1, gmPal: 1, gmA: 0x1f2a7a, gmB: 0xff4f6e, gmC: 0xfff3dc, ht: 0.5, htSize: 0.1, htAngle: 75, split: 0.18, splitAngle: 140, fibre: 0.6, film: 0.2 } },
    { cat: 'Print', name: 'Bitmap', p: { dith: 1, dithLevels: 2, dithSize: 0.25, dithMode: 1, ink: 0x000000, paper: 0xffffff, contrast: 1.15 } },
    { cat: 'Print', name: 'Xerox Portrait', p: { thr: 1, thrLevel: 0.5, thrGrain: 0.35, thrDetail: 0.9, thrSize: 0.1, thrSoft: 0.04, ink: 0x0b0b0b, paper: 0xf4f1e8, toner: 0.4, drag: 0.06, dragJitter: 0.3, fibre: 0.3 } },

    // Photo: retro processing for pictures and covers
    { cat: 'Photo', name: 'Sage Monitor', p: { gmap: 1, gmPal: 1, gmA: 0x05130f, gmB: 0x2f6f5c, gmC: 0xd9f2e2, contrast: 1.2, scan: 0.55, scanCount: 260, scanSoft: 0.7, glow: 0.45, glowSize: 0.5, glowThresh: 0.45, film: 0.35, filmSize: 0.4, split: 0.06, vignette: 0.45, dust: 0.2 } },
    { cat: 'Photo', name: 'Expired Film', p: { glow: 0.3, glowThresh: 0.5, halation: 0.55, sat: 1.25, temp: 0.2, lift: 0.05, shHue: 200, shAmt: 0.3, hiHue: 30, hiAmt: 0.15, film: 0.4, filmSize: 0.5, filmColor: 0.5, dust: 0.3, leak: 0.3, leakSize: 0.35, leakPos: 0.02, vignette: 0.3 } },
    { cat: 'Photo', name: 'Red Room', p: { gmap: 1, gmPal: 2, contrast: 1.12, halation: 0.35, glow: 0.2, film: 0.12, vignette: 0.25 } },
    { cat: 'Photo', name: 'Oil Slick', p: { gmap: 0.88, gmPal: 4, contrast: 1.1, irid: 0.9, iridLo: 0.6, iridHi: 1.2, iridBands: 1.3, iridWarp: 0.6, iridSpeed: 0.06, film: 0.22, filmSize: 0.4, vignette: 0.2 } },
    { cat: 'Photo', name: '16mm Print', p: { vignette: 0.55, film: 0.6, filmSize: 0.6, filmColor: 0.45, filmVar: 0.7, dust: 0.45, scratch: 0.3, halation: 0.35, glow: 0.2, temp: 0.15, lift: 0.04, contrast: 1.1, sat: 0.9 } },
    { cat: 'Photo', name: 'Green Phosphor', p: { mono: 1, scan: 0.7, scanCount: 240, mask: 0.3, maskScale: 0.2, glow: 0.6, glowThresh: 0.3, contrast: 1.2, vignette: 0.6, film: 0.1 } },
    { cat: 'Photo', name: 'Thermal', p: { gmap: 1, gmPal: 3, contrast: 1.15, soften: 0, glow: 0.25, film: 0.15 } },
    { cat: 'Photo', name: 'Liquid Dream', p: { warp: 0.35, warpType: 0, warpScale: 0.25, warpTurb: 0.5, warpEdge: 2, sat: 1.4, hueLuma: 0.5, glow: 0.4, halation: 0.3, film: 0.15, vignette: 0.25 } },

    // Color: grades on a clean picture
    { cat: 'Color', name: 'Teal Night', p: { shHue: 190, shAmt: 0.55, hiHue: 40, hiAmt: 0.3, temp: -0.3, sat: 1.25, halation: 0.35, glow: 0.3, lift: 0.02 } },
    { cat: 'Color', name: 'Cross Processed', p: { cross: 0.85, sat: 1.35, contrast: 1.15, lift: 0.05, hiHue: 60, hiAmt: 0.2, film: 0.2 } },
    { cat: 'Color', name: 'Duotone', p: { gmap: 0.9, gmPal: 0, shHue: 255, hiHue: 25, contrast: 1.15, film: 0.15 } },
    { cat: 'Color', name: 'Bleach Bypass', p: { sat: 0.4, contrast: 1.45, lift: -0.04, temp: -0.1, film: 0.3, filmColor: 0, halation: 0.1 } },
    { cat: 'Color', name: 'Burnt', p: { burn: 0.6, sat: 1.2, gmap: 0.4, gmPal: 7, film: 0.2, vignette: 0.3 } },
    { cat: 'Color', name: 'Solar', p: { solar: 0.85, sat: 0.6, contrast: 1.2, film: 0.25 } },

    // Glitch: the picture breaking
    { cat: 'Glitch', name: 'Data Rot', p: { gmap: 0.5, gmPal: 7, dust: 0.65, scratch: 0.4, film: 0.15, g1Amt: 0.9, g1Type: 2, g1Size: 0.34, g1Pos: 0.2, g1Count: 60, g1Edge: 0.2, g2Amt: 0.75, g2Type: 3, g2Size: 0.4, g2Width: 0.6, g2Count: 90, g3Amt: 0.6, g3Type: 5, g3Size: 0.7 } },
    { cat: 'Glitch', name: 'RGB Tear', p: { g1Amt: 0.8, g1Type: 7, g1Size: 1, g1Count: 40, g1Edge: 0.5, g2Amt: 0.4, g2Type: 0, g2Size: 0.6, g2Count: 20, split: 0.2, film: 0.2 } },
    { cat: 'Glitch', name: 'Block Party', p: { g1Amt: 0.8, g1Type: 1, g1Size: 1, g1Count: 12, g2Amt: 0.9, g2Type: 3, g2Size: 0.3, g2Pos: 0.7, g2Count: 40, g3Amt: 0.5, g3Type: 9, g3Size: 0.2, g3Pos: 0.3, sat: 1.3 } },
    { cat: 'Glitch', name: 'Pixel Sort', p: { g1Amt: 1, g1Type: 4, g1Size: 1, g1Dir: 90, g1Count: 40, g2Amt: 0.5, g2Type: 6, g2Dir: 90, g2Size: 0.8, contrast: 1.15 } },
  ];

  const CATS = ['Type', 'Print', 'Photo', 'Color', 'Glitch'];

  window.KodecParams = { MASTER, MACROS, GROUPS, SOURCE, DEFAULTS, BY_KEY, KEEP, PRESETS, CATS };
})();
