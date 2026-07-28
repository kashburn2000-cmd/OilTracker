# Twenty Days

A live view of the U.S. Strategic Petroleum Reserve, drawn as what it physically
is: oil standing in salt caverns under the Gulf Coast. The headline number is
**days of U.S. consumption**, not percent full — the percentage flatters the
reserve, the days don't.

Underneath the reserve, the page lays out the record: the history buried in the
strata, every emergency drawdown DOE has ever made, and the doctrine that made
the Persian Gulf a standing American military commitment.

## The argument

The site doesn't assert anything the sources don't. That's deliberate — ratio
claims like deaths-per-barrel or dollars-per-barrel rest on contested estimates
and give readers an easy reason to dismiss everything around them. Instead:

- **The hero number is small.** ~20 days of consumption. The smallness is the
  point, and it's just arithmetic on two published figures.
- **The drawdown ledger is DOE's own record.** Four emergency releases in fifty
  years: Desert Storm, Katrina, Libya, Ukraine. The list reads as what it is.
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

`scripts/fetch-spr.mjs` tries two sources in order of freshness:

1. **DOE / Office of Fossil Energy** — publishes SPR inventory *daily*, and is
   the primary source EIA's weekly number derives from. It's a web page rather
   than an API, so the script scrapes it and hard-gates the result: anything
   outside a plausible range is treated as a parse failure, not a reading.
   **This parser has never run against the live page.** Check the first
   workflow log to see whether it worked or quietly fell back.
2. **EIA API v2**, series `WCSSTUS1` — weekly, documented, stable. This is the
   verified path and the fallback whenever DOE fails.

If both fail the script exits non-zero, leaving the committed data untouched, so
a bad run surfaces as a red workflow rather than a wrong number on the page.

Consumption (the denominator for days-of-cover) comes from EIA series
`WRPUPUS2`. That fetch is non-fatal: if it fails the previous value is kept and
a warning is logged, so a bad route can't take the whole refresh down.

A daily GitHub Action commits the result to `data/spr.json`. No backend, no API
key in the browser, no CORS.

### Setup

1. Free EIA API key: <https://www.eia.gov/opendata/register.php>
2. Add it as repository secret `EIA_API_KEY` (Settings → Secrets and variables
   → Actions).
3. Run **Refresh SPR data** manually once, and read the log to see which source
   won.
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
data/context.json      the history. edit this to correct anything
scripts/fetch-spr.mjs  DOE first, EIA fallback
```

The cutaway paints deliberately outside its viewBox (`overflow: visible`) so the
ground runs edge to edge and continues down behind the headline — the number
should read as being underground too. Everything stills under
`prefers-reduced-motion`.

## Notes on the numbers

Capacity is 727M bbl, the statutory maximum. DOE also quotes ~713.5M bbl of
design capacity, and repeated drawdowns have degraded some caverns. Override
with `SPR_CAPACITY_THOUSAND` if you prefer a different denominator.

Days-of-cover is measured against **total petroleum consumption**, not net
imports. Import-based figures look enormous now that the U.S. is a net petroleum
exporter, which makes them useless for this purpose.
