# Twenty Days

A live view of the U.S. Strategic Petroleum Reserve, drawn as what it physically
is: oil standing in salt caverns under the Gulf Coast. The headline number is
**days of U.S. consumption**, not percent full — the percentage flatters the
reserve, the days don't.

Underneath the reserve, the page lays out the record: the history buried in the
strata, every declared emergency drawdown, and the doctrine that made the
Persian Gulf a standing American military commitment.

## The argument

The site doesn't assert anything the sources don't. That's deliberate — ratio
claims like deaths-per-barrel or dollars-per-barrel rest on contested estimates
and give readers an easy reason to dismiss everything around them. Instead:

- **The hero number is small.** Around fifteen days of consumption at the time
  of writing. The smallness is the point, and it's just arithmetic on two
  published figures.
- **The war comparison is the same arithmetic, twice.** The reserve stood at
  twenty days when the war with Iran began on 28 February 2026; it stands at
  fifteen now. Both figures divide by today's consumption, so the comparison
  isolates the change in the reserve rather than mixing in a moving
  denominator. The cutaway marks the pre-war level in each cavern and tints
  the gap — the drawdown at the scale it actually happened.
- **The drawdown ledger is DOE's own record.** Four declared emergency releases
  since 1975: Desert Storm, Katrina, Libya, Ukraine. Beneath it, a line computed
  from the live series reports any ongoing decline, so the page can't claim a
  complete record while the reserve is quietly falling.
- **The closing quote is primary source.** The Carter Doctrine, from the 1980
  State of the Union, declaring the Gulf a vital interest to be defended by
  military force. Not an interpretation — a president's own sentence.

## ⚠ Verify before publishing

`data/context.json` was written without network access. The dates, barrel
figures, and the Carter quote are from memory and **have not been checked line
by line against primary sources.** Everything is in that one file with source
links at the bottom of the page. Do a fact-check pass before this goes public —
on a site whose whole method is "the record speaks for itself," a wrong figure
is the only real vulnerability.

## Where the data comes from

`scripts/fetch-spr.mjs` reads **EIA API v2, series `WCSSTUS1`** — weekly U.S.
ending stocks of crude oil in the SPR. Consumption, the denominator for
days-of-cover, comes from series `WRPUPUS2`; that fetch is non-fatal, so a bad
route keeps the previous value instead of taking the refresh down.

A daily GitHub Action commits the result to `data/spr.json`. No backend, no API
key in the browser, no CORS.

### Why not DOE, which publishes daily?

An earlier version scraped energy.gov first, since DOE is the primary source EIA
derives from. Probing the live pages (`scripts/probe-doe.mjs`) killed it:

- The pages that state a number state **capacity, not inventory**. The scraper's
  pattern matched `714 million barrels` on the SPR landing page — the authorized
  capacity. That is 98% of the denominator, so it would have rendered the
  reserve as nearly full and looked entirely plausible doing it. It only failed
  because the production code matched raw HTML while the probe stripped tags
  first. Luck, not design.
- `/ceser/spr-inventory`, the page that does carry current inventory, ships no
  number in its server-rendered text.
- DOE's own "Historical Inventory" link points at EIA.

The lesson isn't "write a better regex" — a number scraped from prose has no
schema, so nothing distinguishes the figure you want from a differently-meaning
number in the same sentence shape. Weekly data that is unambiguously the right
series beats daily data that might be the wrong number.

`scripts/probe-doe.mjs` remains as a manual workflow, now hunting for the
endpoint behind the inventory widget. If one turns up, daily becomes possible
with a real parser instead of a guess.

### Setup

1. Free EIA API key: <https://www.eia.gov/opendata/register.php>
2. Add it as repository secret `EIA_API_KEY` (Settings → Secrets and variables
   → Actions).
3. Run **Refresh SPR data** manually once and check the log.
4. Settings → Pages → Deploy from a branch → `main` / root.

Until step 3, the page shows sample figures and says so in the footer.

### Local

```sh
python3 -m http.server 8000    # http://localhost:8000
```

Opening `index.html` off disk works too — `fetch` can't read JSON over `file://`,
so it falls back to the sample figures in `js/app.js`.

## Layout

```
index.html             the four sections: reserve, strata, ledger, doctrine
css/style.css          type and layout
js/app.js              builds the cutaway, animates the fill, binds the data
data/spr.json          written by the workflow — the live reading
data/context.json      the history and the war date. edit this to correct anything
scripts/fetch-spr.mjs  the EIA fetch
scripts/probe-doe.mjs  manual diagnostic, not part of the refresh
```

The cutaway paints deliberately outside its viewBox (`overflow: visible`) so the
ground runs edge to edge and continues down behind the headline — the number
should read as being underground too. Everything stills under
`prefers-reduced-motion`.

## Changing the war date

`data/context.json` → `war.started`. Everything keyed to it — the hero
comparison, the cavern marks, the drawdown line under the ledger — recomputes
from the live series. Remove the `war` block entirely and all of it hides
cleanly; the page falls back to measuring the decline from the series peak.

## Notes on the numbers

Capacity is 727M bbl, the statutory maximum. DOE also quotes ~713.5M bbl of
design capacity, and repeated drawdowns have degraded some caverns. Override
with `SPR_CAPACITY_THOUSAND` if you prefer a different denominator.

Days-of-cover is measured against **total petroleum consumption**, not net
imports. Import-based figures look enormous now that the U.S. is a net petroleum
exporter, which makes them useless for this purpose.
