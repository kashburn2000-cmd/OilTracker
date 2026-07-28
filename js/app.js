/* Draws the reserve as what it physically is: oil standing in salt caverns
   under the Gulf Coast. The hero number is days of consumption, not percent —
   the percentage flatters the reserve, the days don't. */

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var SURFACE = 90;      // y of the ground line
  var FILL_MS = 2600;

  // The four storage sites, loosely to scale with one another.
  var CAVERNS = [
    { cx: 112, w: 44, top: 272, bot: 556 },
    { cx: 172, w: 54, top: 250, bot: 584 },
    { cx: 236, w: 50, top: 258, bot: 570 },
    { cx: 292, w: 42, top: 276, bot: 546 }
  ];

  var STRATA_EDGES = [126, 168, 215, 268, 330, 398, 470, 548];

  // Used when data/spr.json can't be read (opening the file straight off disk).
  var SEED = {
    period: '2025-06-27',
    barrels_thousand: 402500,
    capacity_thousand: 727000,
    consumption_thousand_bpd: 20300,
    source: 'sample'
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var targetFill = 0;
  var pourStart = null;
  var wells = [];

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------- the scene ---------- */

  // The rock runs past the viewBox on purpose — the SVG paints with overflow
  // visible so the ground spans the whole screen and continues down behind the
  // headline. The number should read as being underground too.
  var BLEED_X = -3000, BLEED_W = 6400, BLEED_Y = 3000;

  function buildStrata() {
    var g = document.getElementById('strata');
    var edges = [SURFACE].concat(STRATA_EDGES, [BLEED_Y]);
    for (var i = 0; i < edges.length - 1; i++) {
      g.appendChild(el('rect', {
        x: BLEED_X, y: edges[i], width: BLEED_W, height: edges[i + 1] - edges[i],
        fill: i % 2 ? '#0d0b10' : '#100e14'
      }));
      if (i) g.appendChild(el('line', {
        x1: BLEED_X, y1: edges[i], x2: BLEED_X + BLEED_W, y2: edges[i],
        stroke: 'rgba(255,255,255,.045)', 'stroke-width': 1
      }));
    }
  }

  function buildDome() {
    var cap = 'M18 640 C18 360, 84 176, 200 176 C316 176, 382 360, 382 640';
    // Filled body keeps going down — a salt dome is a plug, not a bubble — but
    // it fades out, so it never becomes a hard-edged slab behind the headline.
    document.getElementById('dome').setAttribute(
      'd', cap + ' L382 ' + BLEED_Y + ' L18 ' + BLEED_Y + ' Z');
    // Only the cap is drawn; the flanks would read as furniture, not geology.
    document.getElementById('domeEdge').setAttribute('d', cap);
  }

  function buildSkyline() {
    var g = document.getElementById('skyline');
    // storage tanks and a derrick, small enough to read as scale rather than detail
    [[54, 13, 9], [70, 10, 7], [326, 12, 8]].forEach(function (t) {
      g.appendChild(el('rect', { x: t[0], y: SURFACE - t[2], width: t[1], height: t[2], rx: 1.5 }));
    });
    g.appendChild(el('path', { d: 'M292 90 L299 66 L306 90 Z', 'fill-opacity': '.7' }));
    g.appendChild(el('rect', { x: 116, y: SURFACE - 5, width: 4, height: 5 }));
    g.appendChild(el('rect', { x: 240, y: SURFACE - 4, width: 3, height: 4 }));
  }

  function buildCaverns() {
    var wellG = document.getElementById('wells');
    var cavG = document.getElementById('caverns');

    CAVERNS.forEach(function (c, i) {
      // the well, drilled from the surface down into the salt
      wellG.appendChild(el('line', {
        x1: c.cx, y1: SURFACE, x2: c.cx, y2: c.top,
        stroke: 'rgba(255,255,255,.13)', 'stroke-width': 1
      }));

      var box = { x: c.cx - c.w / 2, y: c.top, width: c.w, height: c.bot - c.top, rx: c.w / 2 };

      var clip = el('clipPath', { id: 'cav' + i });
      clip.appendChild(el('rect', box));
      cavG.appendChild(clip);

      cavG.appendChild(el('rect', Object.assign({ fill: '#050408' }, box)));

      var inner = el('g', { 'clip-path': 'url(#cav' + i + ')' });
      var oil = el('path', { fill: 'url(#oilBody)' });
      var line = el('path', {
        fill: 'none', stroke: '#e0a355', 'stroke-opacity': '.5', 'stroke-width': 1.5
      });
      inner.appendChild(oil);
      inner.appendChild(line);
      cavG.appendChild(inner);

      cavG.appendChild(el('rect', Object.assign({
        fill: 'none', stroke: 'rgba(255,255,255,.14)', 'stroke-width': 1.25
      }, box)));

      wells.push({ oil: oil, line: line, top: c.top, bot: c.bot, cx: c.cx, w: c.w, phase: i * 1.9 });
    });
  }

  /* ---------- fill ---------- */

  function wave(x, t, amp, phase) {
    return Math.sin(x * 0.055 + t * 0.0012 + phase) * amp +
           Math.sin(x * 0.083 - t * 0.0019 + phase) * amp * 0.5;
  }

  function paint(w, fill, t) {
    var y = w.bot - fill * (w.bot - w.top);
    var amp = reduceMotion ? 0 : 2.2 * Math.min(1, fill * 14) * Math.min(1, (1 - fill) * 16 + 0.2);
    var x0 = w.cx - w.w, x1 = w.cx + w.w;
    var d = 'M' + x0 + ' ' + (y + wave(x0, t, amp, w.phase)).toFixed(2);
    for (var x = x0 + 6; x <= x1; x += 6) {
      d += ' L' + x + ' ' + (y + wave(x, t, amp, w.phase)).toFixed(2);
    }
    w.line.setAttribute('d', d);
    w.oil.setAttribute('d', d + ' L' + x1 + ' 640 L' + x0 + ' 640 Z');
  }

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }

  function frame(t) {
    if (pourStart === null) pourStart = t;
    var p = reduceMotion ? 1 : Math.min(1, (t - pourStart) / FILL_MS);
    var fill = targetFill * easeOutCubic(p);

    for (var i = 0; i < wells.length; i++) paint(wells[i], fill, t);

    if (!reduceMotion || p < 1) requestAnimationFrame(frame);
  }

  /* ---------- copy ---------- */

  function millions(thousandBarrels) {
    return (thousandBarrels / 1000).toFixed(1).replace(/\.0$/, '') + 'M';
  }

  function formatDate(period) {
    var d = new Date(period + 'T00:00:00Z');
    if (isNaN(d)) return period;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  function countUp(node, value, suffix) {
    var start = null;
    function step(t) {
      if (start === null) start = t;
      var p = reduceMotion ? 1 : Math.min(1, (t - start) / FILL_MS);
      node.textContent = Math.round(value * easeOutCubic(p)) + (suffix || '');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderReserve(data) {
    var capacity = data.capacity_thousand || SEED.capacity_thousand;
    var burn = data.consumption_thousand_bpd || SEED.consumption_thousand_bpd;
    var barrels = data.barrels_thousand;

    targetFill = Math.max(0, Math.min(1, barrels / capacity));
    var days = barrels / burn;
    var pct = (targetFill * 100).toFixed(0);

    countUp(document.getElementById('days'), Math.round(days));

    document.getElementById('detail').textContent =
      millions(barrels) + ' barrels · ' + pct + '% of capacity · ' + formatDate(data.period);

    document.getElementById('cutaway').setAttribute('aria-label',
      'The Strategic Petroleum Reserve holds ' + millions(barrels) + ' barrels, ' + pct +
      ' percent of its capacity, or about ' + Math.round(days) +
      ' days of U.S. petroleum consumption, as of ' + formatDate(data.period) + '.');

    if (data.source === 'sample') {
      document.getElementById('sourceNote').textContent =
        'Sample data — live figures not yet loaded';
      document.getElementById('sourceNote').classList.add('sample');
    }

    requestAnimationFrame(frame);
  }

  function renderContext(ctx) {
    var strata = document.getElementById('strataList');
    ctx.strata.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="year"></span><span class="event"></span>';
      li.querySelector('.year').textContent = s.year;
      li.querySelector('.event').textContent = s.text;
      strata.appendChild(li);
    });

    var ledger = document.getElementById('ledgerList');
    ctx.drawdowns.forEach(function (d) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="when"></span><span class="why"></span><span class="how-much"></span>';
      li.querySelector('.when').textContent = d.date;
      li.querySelector('.why').textContent = d.reason;
      li.querySelector('.how-much').textContent = d.million_barrels + 'M bbl';
      // bar width relative to the largest release, so 2022 dwarfs the rest on sight
      var max = Math.max.apply(null, ctx.drawdowns.map(function (x) { return x.million_barrels; }));
      li.style.setProperty('--share', (d.million_barrels / max * 100).toFixed(1) + '%');
      ledger.appendChild(li);
    });

    document.getElementById('quoteText').textContent = '“' + ctx.quote.text + '”';
    document.getElementById('quoteCite').textContent = ctx.quote.attribution;

    var list = document.getElementById('sourceList');
    ctx.sources.forEach(function (s) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = s.url;
      a.textContent = s.label;
      a.rel = 'noopener';
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  /* ---------- boot ---------- */

  buildStrata();
  buildDome();
  buildCaverns();
  buildSkyline();

  fetch('data/spr.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(renderReserve)
    .catch(function () { renderReserve(SEED); });

  fetch('data/context.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(renderContext)
    .catch(function () { /* the reserve still reads without the history */ });
})();
