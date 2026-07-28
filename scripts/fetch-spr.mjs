#!/usr/bin/env node
/*
 * Writes data/spr.json. Run by .github/workflows/update-data.yml.
 *
 * Two sources, in order of freshness:
 *
 *   1. DOE / Office of Fossil Energy — publishes SPR inventory daily. This is
 *      the primary source; EIA's weekly figure derives from it. It is a web
 *      page, not an API, so we scrape it and gate the result hard.
 *      *** The DOE parser below has never been run against the live page.
 *      *** Check the first workflow run's log before trusting it.
 *   2. EIA API v2, series WCSSTUS1 — weekly, stable, documented. Authoritative
 *      fallback whenever DOE fails or returns something implausible.
 *
 * If both fail the script exits non-zero and leaves the committed data alone,
 * so a bad run shows up as a red workflow rather than a wrong number.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'spr.json');

// Authorized SPR storage capacity, thousand barrels. 727,000 is the statutory
// maximum; DOE also quotes ~713,500 of design capacity.
const CAPACITY = Number(process.env.SPR_CAPACITY_THOUSAND || 727_000);

// Fallback only. Real value comes from EIA series WRPUPUS2 when reachable.
const CONSUMPTION_FALLBACK = 20_300; // thousand barrels/day of product supplied

const DOE_URL = process.env.DOE_INVENTORY_URL ||
  'https://www.energy.gov/ceser/strategic-petroleum-reserve';

const UA = { 'User-Agent': 'oiltracker (+github actions)' };

/** Anything outside this range is a parse failure, not a reading. */
function plausible(thousandBarrels) {
  return Number.isFinite(thousandBarrels) &&
         thousandBarrels > 1_000 &&
         thousandBarrels <= CAPACITY * 1.02;
}

/* ── source 1: DOE, daily ─────────────────────────────────────────────── */

async function fromDOE() {
  const res = await fetch(DOE_URL, { headers: UA });
  if (!res.ok) throw new Error(`DOE responded ${res.status}`);
  const html = await res.text();

  // Looking for a phrase like "Current Inventory: 402.5 million barrels".
  const m = html.match(/([\d,]+(?:\.\d+)?)\s*million\s+barrels/i);
  if (!m) throw new Error('no inventory figure found in DOE page');

  const thousands = Math.round(parseFloat(m[1].replace(/,/g, '')) * 1000);
  if (!plausible(thousands)) throw new Error(`DOE figure implausible: ${thousands}`);

  // The page states a date alongside the figure; fall back to today if absent.
  const d = html.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const period = d ? d[0] : new Date().toISOString().slice(0, 10);

  return { period, barrels_thousand: thousands, previous: null, source: 'DOE', cadence: 'daily' };
}

/* ── source 2: EIA, weekly ────────────────────────────────────────────── */

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

async function fromEIA() {
  const rows = await eiaSeries('petroleum/stoc/wstk', 'WCSSTUS1', 60);
  const [latest, prev] = rows;
  if (!plausible(latest.value)) throw new Error(`EIA figure implausible: ${latest.value}`);
  return {
    period: latest.period,
    barrels_thousand: latest.value,
    previous: prev ? prev.value : null,
    history: rows.slice().reverse(),
    source: 'EIA',
    cadence: 'weekly'
  };
}

/* ── consumption, for the days-of-cover figure ────────────────────────── */

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

/* ── main ─────────────────────────────────────────────────────────────── */

async function main() {
  let existing = {};
  try { existing = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

  let reading;
  try {
    reading = await fromDOE();
    console.log('Source: DOE (daily).');
  } catch (doeErr) {
    console.warn(`DOE unavailable (${doeErr.message}); falling back to EIA.`);
    reading = await fromEIA();
    console.log('Source: EIA (weekly).');
  }

  const burn = await consumption(existing.consumption_thousand_bpd);

  const payload = {
    period: reading.period,
    barrels_thousand: reading.barrels_thousand,
    capacity_thousand: CAPACITY,
    percent: Number(((reading.barrels_thousand / CAPACITY) * 100).toFixed(2)),
    consumption_thousand_bpd: burn,
    days_of_consumption: Number((reading.barrels_thousand / burn).toFixed(1)),
    change_thousand: reading.previous === null ? null : reading.barrels_thousand - reading.previous,
    units: 'thousand barrels',
    source: reading.source,
    cadence: reading.cadence,
    updated: new Date().toISOString(),
    history: reading.history ?? existing.history ?? []
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
