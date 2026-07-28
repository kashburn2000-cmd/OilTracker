#!/usr/bin/env node
/*
 * Diagnostic, not part of the refresh. Run it from the "Probe DOE" workflow.
 *
 * The DOE scrape in fetch-spr.mjs was written blind — no way to see the live
 * page from where it was authored. This walks a list of candidate DOE pages
 * and prints enough of what each one actually contains to write a real parser
 * against. Read the workflow log, then fix the pattern in fetch-spr.mjs.
 *
 * Add a URL to check with:  workflow_dispatch → url input, or PROBE_URL=…
 */

const CANDIDATES = [
  'https://www.energy.gov/ceser/strategic-petroleum-reserve',
  'https://www.energy.gov/ceser/spr-quick-facts',
  'https://www.energy.gov/ceser/spr-inventory',
  'https://www.energy.gov/ceser/spr-storage-sites',
  'https://www.energy.gov/ceser/office-petroleum-reserves',
  'https://www.spr.doe.gov/dir/dir.html',
  'https://sprpub.doe.gov/dir/dir.html'
];

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; oiltracker-probe/1.0)' };
const KEYWORDS = /(inventory|million barrels|barrels of|current\s+\w*\s*stock|days of)/i;

function toText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function contexts(text, re, span, max) {
  const out = [];
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = rx.exec(text)) !== null && out.length < max) {
    out.push(text.slice(Math.max(0, m.index - span), m.index + m[0].length + span));
    if (m.index === rx.lastIndex) rx.lastIndex++;
  }
  return out;
}

async function probe(url) {
  console.log('\n' + '─'.repeat(72));
  console.log(url);
  console.log('─'.repeat(72));

  let res;
  try {
    res = await fetch(url, { headers: UA, redirect: 'follow' });
  } catch (err) {
    console.log(`  ✗ request failed: ${err.message}`);
    return;
  }

  console.log(`  status       ${res.status} ${res.statusText}`);
  console.log(`  final url    ${res.url}`);
  console.log(`  content-type ${res.headers.get('content-type') || '(none)'}`);
  if (!res.ok) return;

  const body = await res.text();
  const text = toText(body);
  console.log(`  html bytes   ${body.length}   visible text chars ${text.length}`);

  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) console.log(`  title        ${toText(title[1])}`);

  if (text.length < 500 && body.length > 5000) {
    console.log('  ⚠ almost no server-rendered text — this page is probably built by JS,');
    console.log('    which means scraping it needs a different endpoint, not a better regex.');
  }

  // What the current parser looks for.
  const current = text.match(/([\d,]+(?:\.\d+)?)\s*million\s+barrels/i);
  console.log(`  current pattern "N million barrels": ${current ? '✓ ' + current[0] : '✗ no match'}`);

  const hits = contexts(text, KEYWORDS, 90, 6);
  if (hits.length) {
    console.log('  context around inventory-ish wording:');
    hits.forEach((h, i) => console.log(`    [${i + 1}] …${h}…`));
  } else {
    console.log('  no inventory-ish wording found in the visible text');
  }

  // Big numbers are the likeliest carrier of an inventory figure.
  const numbers = [...new Set(contexts(text, /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{2,3}\.\d\s*(?=million)/gi, 45, 8))];
  if (numbers.length) {
    console.log('  large numbers in context:');
    numbers.forEach((n, i) => console.log(`    [${i + 1}] …${n}…`));
  }

  // Embedded JSON often carries the real figure even when the HTML doesn't.
  const json = body.match(/<script[^>]+type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]{0,600}?)<\/script>/i);
  if (json) console.log(`  embedded json (first 300 chars): ${json[1].trim().slice(0, 300)}`);
}

const list = process.env.PROBE_URL ? [process.env.PROBE_URL, ...CANDIDATES] : CANDIDATES;

for (const url of list) await probe(url);

console.log('\n' + '─'.repeat(72));
console.log('Paste this log back to continue. What matters: which URLs returned 200,');
console.log('whether any shows a real inventory number, and whether the pages are');
console.log('server-rendered or JS-built.');
