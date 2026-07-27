#!/usr/bin/env node
/*
 * Pulls weekly Strategic Petroleum Reserve stocks from the EIA API and writes
 * data/spr.json. Run by .github/workflows/update-data.yml; needs EIA_API_KEY.
 *
 * Series WCSSTUS1 — Weekly U.S. Ending Stocks of Crude Oil in the SPR,
 * reported in thousand barrels, published Wednesdays around 10:30 ET.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'spr.json');

// Authorized SPR storage capacity in thousand barrels. The four sites are
// designed for ~713.5M bbl of usable capacity; 727M is the statutory maximum.
// Override with SPR_CAPACITY_THOUSAND if you prefer the design figure.
const CAPACITY = Number(process.env.SPR_CAPACITY_THOUSAND || 727_000);

const WEEKS = 60; // keep about a year of history in the file

async function main() {
  const key = process.env.EIA_API_KEY;
  if (!key) throw new Error('EIA_API_KEY is not set. Get a free key at https://www.eia.gov/opendata/register.php');

  const url = new URL('https://api.eia.gov/v2/petroleum/stoc/wstk/data/');
  url.searchParams.set('api_key', key);
  url.searchParams.set('frequency', 'weekly');
  url.searchParams.append('data[0]', 'value');
  url.searchParams.append('facets[series][]', 'WCSSTUS1');
  url.searchParams.append('sort[0][column]', 'period');
  url.searchParams.append('sort[0][direction]', 'desc');
  url.searchParams.set('length', String(WEEKS));

  const res = await fetch(url, { headers: { 'User-Agent': 'oiltracker (github actions)' } });
  if (!res.ok) throw new Error(`EIA responded ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);

  const body = await res.json();
  const rows = body?.response?.data ?? [];
  if (!rows.length) throw new Error(`EIA returned no rows: ${JSON.stringify(body).slice(0, 300)}`);

  // Newest first, values arrive as strings.
  const series = rows
    .map((r) => ({ period: r.period, value: Number(r.value) }))
    .filter((r) => r.period && Number.isFinite(r.value));

  const [latest, previous] = series;

  const payload = {
    period: latest.period,
    barrels_thousand: latest.value,
    capacity_thousand: CAPACITY,
    percent: Number(((latest.value / CAPACITY) * 100).toFixed(2)),
    change_thousand: previous ? latest.value - previous.value : null,
    units: 'thousand barrels',
    series: 'WCSSTUS1',
    source: 'EIA',
    source_url: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=pet&s=wcsstus1&f=w',
    updated: new Date().toISOString(),
    history: series.slice().reverse() // oldest first, for future sparklines
  };

  // Don't churn the git history when only the timestamp moved.
  try {
    const current = JSON.parse(await readFile(OUT, 'utf8'));
    if (current.period === payload.period && current.barrels_thousand === payload.barrels_thousand) {
      payload.updated = current.updated;
    }
  } catch {
    /* first run, or unreadable file — write fresh */
  }

  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`SPR ${payload.period}: ${payload.barrels_thousand.toLocaleString()} Mbbl (${payload.percent}% of capacity)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
