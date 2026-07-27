# OilTracker

A single glass. Fill it with oil and you know how the U.S. Strategic Petroleum
Reserve is doing. Full glass, full reserve. Empty glass, empty reserve.

One number on screen — the percentage. Barrel counts stay hidden until you hover
the glass (or tap it, on a phone).

## Why the SPR and not "US oil"

The glass metaphor needs a ceiling. Commercial crude inventories don't have one —
there's no level at which the country is "full." The Strategic Petroleum Reserve
does: four salt-dome sites on the Gulf Coast with **727 million barrels** of
authorized storage capacity. That makes a fill percentage meaningful rather than
decorative.

Capacity note: 727M bbl is the statutory maximum. DOE also quotes ~713.5M bbl of
*design* capacity, and drawdowns have degraded some caverns. Set
`SPR_CAPACITY_THOUSAND` in the workflow environment if you'd rather measure
against a different denominator.

## How the data gets there

There's no backend. A GitHub Action runs every Wednesday after EIA publishes the
Weekly Petroleum Status Report, fetches series `WCSSTUS1` (weekly ending stocks
of crude oil in the SPR), and commits `data/spr.json`. The page fetches that file
from its own origin — no API key in the browser, no CORS, nothing to keep running.

Weekly is as "live" as this data gets: EIA doesn't publish SPR levels more often
than that.

### Setup

1. Get a free API key: <https://www.eia.gov/opendata/register.php>
2. Add it as a repository secret named `EIA_API_KEY`
   (Settings → Secrets and variables → Actions).
3. Run the **Refresh SPR data** workflow once manually to replace the bundled
   sample figures.

Until step 3 happens, the page renders sample data and says so in the footer.

### Publishing

Settings → Pages → Deploy from a branch → `main` / root. Everything is static;
there is no build step.

### Local

```sh
python3 -m http.server 8000    # then open http://localhost:8000
```

Opening `index.html` directly off disk also works — `fetch` can't read the JSON
over `file://`, so it falls back to the sample figures baked into `js/app.js`.

## Layout

```
index.html            markup + the glass SVG
css/style.css         type, layout, the reveal-on-hover detail line
js/app.js             fill animation, wave surface, data binding
data/spr.json         committed by the workflow; read by the page
scripts/fetch-spr.mjs the EIA fetch
```

The oil surface is two out-of-phase sine waves redrawn each frame and clipped to
the glass interior, so it drifts instead of ticking. Everything stills under
`prefers-reduced-motion`.

Data: U.S. Energy Information Administration.
