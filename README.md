# POTA Rare Parks

A static map of the least-activated [Parks on the Air](https://pota.app) parks
near home. Plain HTML, CSS and JavaScript with no build step, hosted on GitHub
Pages. Park data is fetched from pota.app's public API by one small Node script
and stored as JSON in `/data`.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html`, `img/` | The Parks on the Air hub page (uses the shared K1KFX kit from k1kfx.com/kit/) |
| `parks/` (`index.html`, `css/`, `js/app.js`) | The Rare Parks Finder map |
| `config.json` | Home location, list of states, API settings, repo name |
| `scripts/update-data.mjs` | Fetches every state and writes `/data` |
| `scripts/serve.mjs` | Optional local preview server |
| `data/parks.json`, `data/meta.json` | Generated data and its "generated at" timestamp |
| `.github/workflows/update-data.yml` | Nightly and manual data refresh |

## Where the data comes from

The pota.app park list page calls one public endpoint per location and needs no
login:

```
GET https://api.pota.app/location/parks/US-NE
```

It returns JSON with `reference, name, latitude, longitude, grid, locationDesc,
attempts, activations, qsos, website, notes`. The page's "Download as CSV"
button does not call the server. It builds the CSV in the browser from that
same JSON, and adds `my_activations` and `my_hunted_qsos` from a second,
signed-in-only call (`https://api.pota.app/user/stats/park`). This project never
uses that second call.

## Update the data by hand

Needs Node 18 or newer. No packages to install.

```bash
node scripts/update-data.mjs
```

Then commit and push `data/`:

```bash
git add data && git commit -m "Update park data" && git push
```

The script makes one request per state, two seconds apart, with a User-Agent
that names this project. If any state fails after three tries it stops without
writing anything, so partial data never replaces good data. If nothing changed
it leaves the files (and the timestamp) alone.

## How the nightly update works

`.github/workflows/update-data.yml` runs the same script every night at 09:17
UTC, and also whenever `config.json` or the script is pushed. It commits
`data/` only when it changed. GitHub Pages republishes
automatically after that commit.

To refresh on demand, open the repo's **Actions** tab, pick **Update park
data**, and press **Run workflow**. The site's "Refresh via GitHub Actions" link
goes straight there.

Good to know:

- "Data last updated" on the site is the last time the data actually changed,
  not the last time the job ran.
- GitHub pauses scheduled workflows in repos with no activity for 60 days. The
  nightly data commits normally count as activity. If the schedule ever stops,
  re-enable it from the Actions tab.
- If pota.app ever blocks GitHub's servers, run the script by hand and push.

## Add a state

Edit `config.json` and add a line to `states`, using the location code that
pota.app shows in its park list (for example `US-CO`):

```json
{ "code": "US-CO", "name": "Colorado" }
```

Commit and push. The workflow runs by itself whenever `config.json` or the
update script changes, so the data refreshes a minute or two later (or run the
update script yourself first). The new state shows up in the site's state
filter by itself. Parks that span several states are stored once.

## Load my own activations

Your POTA login is never used by this project.

1. Sign in at pota.app, open the park list for a state, and download the CSV.
2. On the site, open **Filters and settings**, press **Load my CSV**, and pick
   the file (several at once is fine, one per state).
3. Parks you have activated get a blue ring, and "Hide parks I've already
   activated" starts working.

The file is read inside your browser and only the `reference` and
`my_activations` columns are kept, in that browser's local storage. Nothing is
uploaded. **Clear** forgets it. Do the same on your phone if you want it there.

`.gitignore` blocks `*.csv`, `*.ods` and similar so a personal export can't be
committed by accident. Keep those files outside this folder anyway.

## Preview locally

```bash
node scripts/serve.mjs
```

Then open http://localhost:8765.

## Notes on the map

- Dot colors by activation count: 0-3 red, 4-5 orange, 6-8 amber, 9-12 yellow,
  13+ tan. Dashed distance rings sit at 50, 100, 200, 300 and 400 miles from home. Dashed
  circles with "×N" are clusters, colored by their rarest park.
- Distances are straight-line miles from home, not driving miles.
- The flags (closed / seasonal, hike / boat / rough road, permit, fee) come from
  keyword matching on the free-text notes. They miss things and sometimes
  over-flag. Read the note before you drive.
- Multi-state parks and long trails have a single map point from pota.app. It
  is a reference point, not the nearest place to activate.
- Map tiles come from OpenStreetMap's standard tile server under its
  [tile usage policy](https://operations.osmfoundation.org/policies/tiles/):
  attribution is shown and nothing is prefetched. That is fine for a personal
  site. If this ever gets real traffic, switch to a tile provider.
- Leaflet and Leaflet.markercluster load from unpkg.com at pinned versions.
