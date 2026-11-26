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
| `map/` (`index.html`, `css/`, `js/app.js`, `data/states.json`, `sw.js`) | The States Worked Map |
| `scripts/build-map.mjs`, `scripts/make-icon.mjs` | One-time generators for the map shapes and its icons |
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
automatically after that commit. With 24 states and provinces a normal run takes about a
minute; the job's 30-minute timeout leaves room for slow or retried requests.

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

## Which states and provinces are included

Every state or province with any part inside 600 straight-line miles of home
(Lincoln, NE), which is also the distance slider's maximum. That is 22 states
and 2 provinces: AR, CO, IA, IL, IN, KS, KY, LA, MI, MN, MO, MS, MT, ND, NE,
NM, OK, SD, TN, TX, WI, WY, plus Ontario (CA-ON) and Manitoba (CA-MB).

This was worked out from boundary data (US Census outlines via us-atlas 3.0.1,
and Natural Earth 1:50M for Canada): the distance from home to the nearest point
on each border. The closest calls just outside are Saskatchewan (about 609 mi;
its southern border is the 49th parallel) and Alabama (612 mi).

### Only parks within 650 miles are kept

pota.app serves whole states and provinces, and the far side of a big one adds
lots of parks nobody here would see (Ontario has 1,180 parks, about 20 within
600 mi). So `config.json` has `"keepWithinMiles": 650`, and the update script
drops parks farther than that from the home in `config.json`. It logs how many
it left out. This keeps `data/parks.json` around 1.5 MB (about 310 KB
compressed). The trade-off: if you move home on the map, or use "Use my
location" while travelling, parks more than 650 mi from Lincoln are not there.
Remove the setting to keep everything.

On the site the chips are alphabetical by two-letter code (provinces mixed in),
with All and None buttons. A state newly added to `config.json` starts switched
on, even for visitors who already have saved filter settings.

## Add a state

Edit `config.json` and add a line to `states`, using the location code that
pota.app shows in its park list (for example `US-CO`, or `CA-MB` for a Canadian province):

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

## States Worked Map (`/map/`)

A full-screen tool for an activation: kids tap each state we reach and it
turns green. Built for an 11" tablet or a laptop in landscape.

- **Add:** tap a state. The tiny Northeast states (VT, NH, MA, RI, CT, NJ, DE,
  MD, DC) also have big boxes off the East Coast.
- **Canada:** the 10 provinces (BC, AB, SK, MB, ON, QC on top; NB, NS, PE, NL
  centered under them) are smaller boxes in the open space above the Great
  Lakes, placed so the gap to Minnesota equals the gap to Maine. They work like
  the state boxes (tap, hold to remove, History grey, Find by name or code) but
  don't count toward the big state count or the rewards. They use the same
  2-letter codes ADIF logs use for Canada.
- **Remove:** press and hold a green state (right-click on a laptop), then
  confirm.
- **Find a state** (magnifier button): type a name or code. The state flashes
  yellow three times and keeps a yellow outline until someone taps it. Finding
  never adds a state by itself.
  Tapping the map while the Find box is open only closes the box.
- **History** (switch under the count): states reached on any earlier map
  show in light grey (kept light so it reads on e-ink screens). Today's green
  always wins, and the count is today's states only. The switch is off every
  time the app opens. It appears once a map has been finished with
  **Start fresh** (or loaded from a file).
- **Rewards** pop up at 5, 10, 15 … 50 states and at all 51, once per map.
- **Menu:** Start fresh, Save to file, Load file, Full screen, Clear history
  (erases the earlier maps on this device after a confirm; today's map stays).
- **Keyboard:** Tab to a state, Enter adds it, Delete asks to remove it.

### Saving

Everything is kept in that browser's local storage after every tap, so a
reload brings the map back. It does not sync between devices, and clearing the
browser's site data erases it. **Start fresh** moves the current map into the
History, which is what the grey **History** layer draws from.
**Save to file** downloads a `states-YYYY-MM-DD.json` file with the
current map and all of History; **Load file** brings one back.

### Offline and home screen

`map/sw.js` caches the page, the map data, the K1KFX kit and its fonts after the
first visit, so the map opens with no signal. On Android Chrome, open the map
and choose **Add to Home screen**: it then opens full screen like an app. After
changing files in `map/`, a device that already has the page shows the update
on its second load (the first load comes from the cache). If you add or rename
files, add them to `FILES` in `sw.js`, and bump `VERSION` with any change.

On Android the on-screen keyboard (opened by Find) is set to float over the
page (`interactive-widget=overlays-content`) instead of shrinking it. Where a
tablet shrinks the page anyway (seen on a Galaxy Tab A7 Lite and a Boox Go 10),
the map is pinned to its full size while Find is open and let go only once the
keyboard is fully closed, so it never jumps.

### Where the map comes from

[us-atlas 3.0.1](https://github.com/topojson/us-atlas) `states-albers-10m.json`
(ISC license, Mike Bostock; shapes from US Census Bureau cartographic boundary
files, public domain). It is already projected with Alaska and Hawaii in
insets. `node scripts/build-map.mjs` downloads it once, turns each state into
an SVG path, places each label, and writes
`map/data/states.json`, which is committed. A label goes at the state's
visual middle (the area centroid of its biggest piece). Where the two letters
would not fit there with a little room to spare (Florida, Louisiana, Kentucky,
Michigan, Hawaii), it slides toward the roomiest spot in the state and stops
as soon as it fits; West Virginia's also shrinks a little. A few far western Aleutian islands
that fall off the left edge are left out. Run it again only to change the
shapes or labels: `LABEL_OVERRIDE` in the script moves a label by hand, and
`node scripts/build-map.mjs --report` lists where every label landed.
`node scripts/make-icon.mjs` redraws the home-screen icons.

## Preview locally

```bash
node scripts/serve.mjs
```

Then open http://localhost:8765.

## Notes on the map

- Dot colors by activation count: 0-3 red, 4-5 orange, 6-8 amber, 9-12 yellow,
  13+ tan. Dashed distance rings sit at 50, 100, 200, 300, 400, 500 and 600 miles from home.
  Moving the distance slider fits the map to that radius.
- The "Max activations" slider moves in steps: 0 to 8 one at a time, then 10,
  12, 15, 20, 25, 30, 40 and Any. That gives each low value a wide notch on a
  phone and lines up with the colour boundaries (3, 5, 8, 12). Dashed
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
