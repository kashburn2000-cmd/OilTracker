#!/usr/bin/env node
/*
 * Writes data/spr.json. Run by .github/workflows/update-data.yml.
 *
 * Source: EIA API v2, series WCSSTUS1 — weekly U.S. ending stocks of crude oil
 * in the SPR, published Wednesdays around 10:30 ET.
 *
 * Why not DOE, which publishes daily?
 * ----------------------------------
 * An earlier version scraped energy.gov first, since DOE is the primary source
 * EIA derives from. Probing the live pages (scripts/probe-doe.mjs) killed that
 * idea, and it is worth recording why:
 *
 *   - The pages that state a number state *capacity*, not inventory. The
 *     scraper's pattern matched "714 million barrels" on the SPR landing page —
 *     the authorized capacity figure. That is 98% of the denominator, so it
 *     would have rendered the reserve as nearly full and looked entirely
 *     plausible while doing it.
 *   - /ceser/spr-inventory, the page that does carry current inventory, ships
 *     no number in its server-rendered text. The figure arrives client-side.
 *   - DOE's own "Historical Inventory" link points at EIA.
 *
 * The lesson isn't "write a better regex" — it's that a number scraped from
 * prose has no schema, so nothing distinguishes the figure you want from a
 * differently-meaning number in the same sentence shape. Until a real endpoint
 * turns up, weekly EIA data that is unambiguously the right series beats daily
 * data that might be the wrong number.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'spr.json');

// Authorized SPR storage capacity, thousand barrels. 727,000 is the statutory
// maximum; DOE quotes 714,000 of authorized capacity across the four sites.
const CAPACITY = Number(process.env.SPR_CAPACITY_THOUSAND || 727_000);

// Fallback only. Real value comes from EIA series WRPUPUS2.
const CONSUMPTION_FALLBACK = 20_300; // thousand barrels/day of product supplied

const WEEKS = 60;
const UA = { 'User-Agent': 'oiltracker (+github actions)' };

function eiaUrl(route, series, length) {
  const url = new URL(`https://api.eia.gov/v2/${route}/data/`);
  url.searchParams.set('api_key', process.env.EIA_API_KEY);
  url.searchParams.set('frequency', 'weekly');
  url.searchParams.append('data[0]', 'value');
  url.searchParams.append('facets[series][]', series);
  url.searchParams.append('sort[0][column]', 'period');
  url.searchParams.append('sort[0][direction]', 'desc');
  url.searchParams.set('length', String(length));
  return url;
}

async function eiaSeries(route, series, length) {
  if (!process.env.EIA_API_KEY) throw new Error('EIA_API_KEY is not set');
  const res = await fetch(eiaUrl(route, series, length), { headers: UA });
  if (!res.ok) throw new Error(`EIA responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const rows = (body?.response?.data ?? [])
    .map((r) => ({ period: r.period, value: Number(r.value) }))
    .filter((r) => r.period && Number.isFinite(r.value));
  if (!rows.length) throw new Error(`EIA returned no rows for ${series}`);
  return rows; // newest first
}

/** Non-fatal: a bad consumption fetch shouldn't take the whole refresh down. */
async function consumption(previousValue) {
  try {
    const rows = await eiaSeries('petroleum/sum/sndw', 'WRPUPUS2', 1);
    const v = rows[0].value;
    if (v > 5_000 && v < 40_000) return v;
    console.warn(`Consumption figure implausible (${v}); keeping previous.`);
  } catch (err) {
    console.warn(`Could not refresh consumption: ${err.message}`);
  }
  return previousValue || CONSUMPTION_FALLBACK;
}

async function main() {
  let existing = {};
  try { existing = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

  const rows = await eiaSeries('petroleum/stoc/wstk', 'WCSSTUS1', WEEKS);
  const [latest, prev] = rows;

  // A stocks reading can legitimately be anywhere from near-empty to full, so
  // this only catches a broken response, not a wrong-meaning number. That's
  // exactly why the source has to be a named series rather than scraped prose.
  if (!(latest.value > 1_000 && latest.value <= CAPACITY * 1.02)) {
    throw new Error(`SPR figure outside plausible range: ${latest.value}`);
  }

  const burn = await consumption(existing.consumption_thousand_bpd);

  const payload = {
    period: latest.period,
    barrels_thousand: latest.value,
    capacity_thousand: CAPACITY,
    percent: Number(((latest.value / CAPACITY) * 100).toFixed(2)),
    consumption_thousand_bpd: burn,
    days_of_consumption: Number((latest.value / burn).toFixed(1)),
    change_thousand: prev ? latest.value - prev.value : null,
    units: 'thousand barrels',
    series: 'WCSSTUS1',
    source: 'EIA',
    cadence: 'weekly',
    updated: new Date().toISOString(),
    history: rows.slice().reverse() // oldest first
  };

  // Don't churn git history when only the timestamp moved.
  if (existing.period === payload.period &&
      existing.barrels_thousand === payload.barrels_thousand &&
      existing.consumption_thousand_bpd === payload.consumption_thousand_bpd) {
    payload.updated = existing.updated;
  }

  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`SPR ${payload.period}: ${payload.barrels_thousand.toLocaleString()} Mbbl ` +
              `(${payload.percent}% of capacity, ${payload.days_of_consumption} days of consumption)`);
}

main().catch((err) => {
  console.error(`Refresh failed, leaving existing data in place: ${err.message}`);
  process.exit(1);
});
