#!/usr/bin/env node
/*
 * Diagnostic, not part of the refresh. Run from the "Probe DOE" workflow.
 *
 * Round one established that DOE's prose carries capacity figures, not
 * inventory, and that /ceser/spr-inventory ships no number in its HTML. But
 * SPR Quick Facts links to an "inventory update window", and the inventory
 * page renders its figure client-side — so something is serving that number.
 *
 * This hunts for it: pull every link, iframe, image, script and hard-coded URL
 * off the inventory pages, then fetch the plausible ones and report what came
 * back. What we want is a JSON/CSV/text endpoint. An image means OCR, which
 * isn't worth it — weekly EIA data beats a brittle pixel parse.
 */

const PAGES = [
  'https://www.energy.gov/ceser/spr-inventory',
  'https://www.energy.gov/hgeo/opr/spr-quick-facts',
  'https://www.spr.doe.gov/dir/dir.html'
];

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; oiltracker-probe/1.0)' };
const INTERESTING = /(inventory|current|status|daily|data|report|\.json|\.csv|\.txt|\.xml)/i;
const BORING = /(google|facebook|twitter|instagram|youtube|linkedin|font|jquery|analytics|cookie|accessibility|privacy|foia|usa\.gov|whitehouse)/i;

const seen = new Set();

function abs(href, base) {
  try { return new URL(href, base).href; } catch { return null; }
}

function extract(html, base) {
  const found = [];
  const push = (url, kind, label) => {
    const u = abs(url, base);
    if (u && !BORING.test(u)) found.push({ url: u, kind, label: (label || '').trim().slice(0, 60) });
  };

  let m;
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  while ((m = anchor.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (INTERESTING.test(m[1]) || INTERESTING.test(text)) push(m[1], 'link', text);
  }

  for (const [re, kind] of [
    [/<iframe\b[^>]*src=["']([^"']+)["']/gi, 'iframe'],
    [/<img\b[^>]*src=["']([^"']+)["']/gi, 'image'],
    [/<script\b[^>]*src=["']([^"']+)["']/gi, 'script']
  ]) {
    while ((m = re.exec(html)) !== null) {
      if (kind === 'iframe' || INTERESTING.test(m[1])) push(m[1], kind, '');
    }
  }

  // URLs hard-coded inside inline scripts — where a widget's data source hides.
  const inline = /["'](https?:\/\/[^"']{10,200}|\/[a-z0-9._\-/]{6,120})["']/gi;
  while ((m = inline.exec(html)) !== null) {
    if (INTERESTING.test(m[1]) && !/\.(png|jpg|jpeg|svg|gif|woff2?|css)$/i.test(m[1])) {
      push(m[1], 'in-script', '');
    }
  }
  return found;
}

async function follow(cand) {
  if (seen.has(cand.url)) return;
  seen.add(cand.url);

  let res;
  try {
    res = await fetch(cand.url, { headers: UA, redirect: 'follow' });
  } catch (err) {
    console.log(`    ✗ ${cand.kind.padEnd(9)} ${cand.url}\n        request failed: ${err.message}`);
    return;
  }

  const type = res.headers.get('content-type') || '';
  console.log(`    ${res.ok ? '·' : '✗'} ${cand.kind.padEnd(9)} ${cand.url}`);
  if (cand.label) console.log(`        link text: "${cand.label}"`);
  console.log(`        ${res.status} ${type}`);

  if (!res.ok) return;

  if (/image\//i.test(type)) {
    console.log('        → an image. Dead end: the number is pixels, not text.');
    return;
  }

  const body = await res.text();
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                   .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  if (/json|csv|plain|xml/i.test(type)) {
    console.log(`        → machine-readable! first 400 chars:`);
    console.log(`        ${body.trim().slice(0, 400).replace(/\n/g, ' ')}`);
    return;
  }

  // An inventory reading should sit next to the word "inventory", not "capacity".
  const hit = text.match(/[^.]{0,110}\b\d{2,3}(?:[.,]\d+)?\s*(?:million)?\s*(?:barrels|MMB)\b[^.]{0,60}/i);
  console.log(`        text ${text.length} chars` + (hit ? `\n        candidate: …${hit[0].trim()}…` : '  (no barrel figure)'));
}

for (const page of PAGES) {
  console.log('\n' + '='.repeat(72));
  console.log(page);
  console.log('='.repeat(72));

  let res;
  try {
    res = await fetch(page, { headers: UA, redirect: 'follow' });
  } catch (err) {
    console.log(`  ✗ request failed: ${err.message}`);
    continue;
  }
  console.log(`  ${res.status} → ${res.url}`);
  if (!res.ok) continue;

  const html = await res.text();
  const candidates = extract(html, res.url);
  console.log(`  ${candidates.length} candidate resources; fetching up to 14\n`);

  for (const c of candidates.slice(0, 14)) await follow(c);
}

console.log('\n' + '='.repeat(72));
console.log('Looking for: any line marked "→ machine-readable!", or a candidate');
console.log('figure sitting next to the word "inventory" rather than "capacity".');
console.log('If everything resolves to images or empty shells, DOE daily is off the');
console.log('table and weekly EIA data stands.');
