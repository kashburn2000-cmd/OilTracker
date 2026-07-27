/* Renders the reserve as a glass of oil.
   One number on screen; everything else waits for a hover or a tap. */

(function () {
  'use strict';

  // Cavity geometry — must stay in sync with #cavity in index.html.
  var TOP = 66;      // y of the inside of the rim  (100% full)
  var BOTTOM = 560;  // y of the inside of the base (0% full)
  var LEFT = -20;    // draw past the walls; the clip path trims it
  var RIGHT = 420;

  var FILL_MS = 2400;   // pour-in animation
  var STEP = 8;         // px between wave sample points

  // Used when data/spr.json can't be loaded (opening index.html straight off
  // disk, for instance). Clearly flagged as sample data in the UI.
  var SEED = {
    period: '2025-06-27',
    barrels_thousand: 402500,
    capacity_thousand: 727000,
    source: 'sample'
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var oil = document.getElementById('oil');
  var oilTint = document.getElementById('oilTint');
  var surfaceLine = document.getElementById('surfaceLine');
  var reflection = document.getElementById('reflection');
  var bubbleLayer = document.getElementById('bubbles');
  var percentEl = document.getElementById('percent');
  var vessel = document.getElementById('vessel');

  var targetFill = 0;   // 0..1, where the oil is headed
  var shownFill = 0;    // 0..1, where the oil is right now
  var pourStart = null;
  var bubbles = [];

  /* ---------- shapes ---------- */

  function surfaceY(fill) {
    return BOTTOM - fill * (BOTTOM - TOP);
  }

  // Two out-of-phase sines so the surface never looks like a metronome.
  function waveOffset(x, t, amp) {
    return Math.sin(x * 0.020 + t * 0.0011) * amp +
           Math.sin(x * 0.031 - t * 0.0017) * amp * 0.45;
  }

  function oilPath(fill, t) {
    var y = surfaceY(fill);
    // Flatten the surface as the glass empties or tops out.
    var amp = reduceMotion ? 0 : 4.5 * Math.min(1, fill * 12) * Math.min(1, (1 - fill) * 14 + 0.25);
    var d = 'M' + LEFT + ' ' + (y + waveOffset(LEFT, t, amp));
    for (var x = LEFT + STEP; x <= RIGHT; x += STEP) {
      d += ' L' + x + ' ' + (y + waveOffset(x, t, amp)).toFixed(2);
    }
    return { area: d + ' L' + RIGHT + ' 600 L' + LEFT + ' 600 Z', line: d };
  }

  /* ---------- bubbles ---------- */

  function makeBubble(i) {
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('fill', '#c8791f');
    c.setAttribute('fill-opacity', '0.13');
    bubbleLayer.appendChild(c);
    return reset({ el: c }, i);
  }

  function reset(b, i) {
    b.x = 110 + Math.random() * 180;
    b.y = BOTTOM + Math.random() * 40;
    b.r = 1.6 + Math.random() * 2.6;
    b.speed = 0.14 + Math.random() * 0.22;
    b.drift = (Math.random() - 0.5) * 0.02;
    b.phase = i * 1.7;
    return b;
  }

  function stepBubbles(dt, fill) {
    var top = surfaceY(fill);
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.y -= b.speed * dt * 0.06;
      if (b.y - b.r < top || fill < 0.04) reset(b, i);
      b.el.setAttribute('cx', (b.x + Math.sin(b.y * 0.02 + b.phase) * 6).toFixed(1));
      b.el.setAttribute('cy', b.y.toFixed(1));
      b.el.setAttribute('r', b.r.toFixed(1));
    }
  }

  /* ---------- loop ---------- */

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }

  var lastT = 0;

  function frame(t) {
    var dt = lastT ? Math.min(t - lastT, 50) : 16;
    lastT = t;

    if (pourStart === null) pourStart = t;
    var p = reduceMotion ? 1 : Math.min(1, (t - pourStart) / FILL_MS);
    shownFill = targetFill * easeOutCubic(p);

    var paths = oilPath(shownFill, t);
    oil.setAttribute('d', paths.area);
    oilTint.setAttribute('d', paths.area);
    surfaceLine.setAttribute('d', paths.line);

    reflection.setAttribute('rx', (76 + 56 * shownFill).toFixed(1));
    reflection.setAttribute('opacity', (0.25 + 0.75 * shownFill).toFixed(2));

    percentEl.textContent = (targetFill * 100 * easeOutCubic(p)).toFixed(1);

    if (!reduceMotion) stepBubbles(dt, shownFill);
    if (!reduceMotion || p < 1) requestAnimationFrame(frame);
  }

  /* ---------- data ---------- */

  function millions(thousandBarrels) {
    return (thousandBarrels / 1000).toFixed(1).replace(/\.0$/, '') + 'M';
  }

  function formatDate(period) {
    var d = new Date(period + 'T00:00:00Z');
    if (isNaN(d)) return period;
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    });
  }

  function render(data) {
    var capacity = data.capacity_thousand || SEED.capacity_thousand;
    var barrels = data.barrels_thousand;

    targetFill = Math.max(0, Math.min(1, barrels / capacity));

    document.getElementById('asof').textContent = 'as of ' + formatDate(data.period);
    document.getElementById('barrels').textContent = millions(barrels) + ' bbl';
    document.getElementById('capacity').textContent = millions(capacity) + ' bbl capacity';

    var deltaEl = document.getElementById('delta');
    if (typeof data.change_thousand === 'number' && data.change_thousand !== 0) {
      var up = data.change_thousand > 0;
      deltaEl.textContent = (up ? '▲ ' : '▼ ') + millions(Math.abs(data.change_thousand)) + ' this week';
      deltaEl.className = 'delta ' + (up ? 'up' : 'down');
    }

    vessel.setAttribute('aria-label',
      'Strategic Petroleum Reserve is ' + (targetFill * 100).toFixed(1) + ' percent full: ' +
      millions(barrels) + ' of ' + millions(capacity) + ' barrels, as of ' + formatDate(data.period) + '.');

    if (data.source === 'sample') {
      var credits = document.querySelector('.credits');
      credits.classList.add('sample');
      document.getElementById('sourceNote').textContent = 'Sample data — live EIA figures not loaded';
    }

    if (!reduceMotion) {
      for (var i = 0; i < 7; i++) bubbles.push(makeBubble(i));
    }
    requestAnimationFrame(frame);
  }

  fetch('data/spr.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () { render(SEED); });

  // Touch devices have no hover, so tapping the glass reveals the detail line.
  vessel.addEventListener('click', function () { vessel.classList.toggle('revealed'); });
})();
