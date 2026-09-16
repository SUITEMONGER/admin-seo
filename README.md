# SuiteMonger public listing pages

This service renders approved SuiteMonger listings as complete HTML responses for search engines and link previews. It has no browser framework or runtime dependencies.

The project is standalone. Its runtime code and brand images are contained in `suitemonger_seo`; it does not need to be built or deployed with the Flutter mobile app.

## URLs

The canonical route includes the category, property name, address and immutable listing ID:

```text
/suites/serviced-apartment/luxury-two-bedroom-suite-admiralty-way-lekki-phase-1-lagos--66e100000000000000000001
```

The ID keeps the route permanent. If a listing name, category or address changes, an old route still finds the listing and permanently redirects to its new canonical route.

Each suite option also has a permanent canonical route using the parent listing ID and the sublisting ID:

```text
/suites/{category}/{name-and-address}--{listing-id}/options/{option-name}--{sublisting-id}
```

The listing call-to-action selects its destination in the browser: Android devices use `GOOGLE_PLAY_STORE_URL`, iPhones and iPads use `APPLE_STORE_URL`, and desktop browsers return to the landing page at `/`.

Only the backend's public approved-listing endpoint is used. A suspended, archived, rejected or missing listing returns an HTML `404` page with `noindex` metadata.

## Run locally

Node.js 20 or newer is required.

```powershell
$env:API_BASE_URL = 'http://localhost:5000/api/v1'
$env:PUBLIC_BASE_URL = 'http://localhost:8080'
$env:PORT = '8080'
$env:APPLE_STORE_URL = 'https://apps.apple.com/app/id...'
$env:GOOGLE_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.mobile.suitemonger'
npm start
```

Production defaults to `https://api.suitemonger.com/api/v1` and `https://www.suitemonger.com`.

## Routes

- `/` serves the SuiteMonger landing page from `src/landing/index.html`.
- `/suites` lists recently approved suites with crawlable links.
- `/suites?page={page}` paginates approved listings from newest to oldest, with crawlable previous and next links.
- `/suites/{category}/{name-and-address}--{id}` renders a listing.
- `/suites/{id}` redirects to the listing's canonical route.
- `/suites/{category}/{name-and-address}--{id}/options/{option-name}--{sublisting-id}` renders a sublisting.
- `/suites/{id}/options/{sublisting-id}` redirects to the sublisting's canonical route.
- `/robots.txt` allows crawling and points to the sitemap.
- `/sitemap.xml` is the sitemap index.
- `/sitemaps/listings-{page}.xml` lists approved listing URLs.
- `/health` provides a deployment health check.

Listing pages show every available sublisting returned in `sub_category` as a compact horizontal carousel of clickable cards. Each card includes its cover image, price, room details and amenities and opens the sublisting's permanent page. Main-listing and sublisting images are combined into a styled modal gallery with previous and next controls, an image counter and a selectable thumbnail rail.

## Deploy on Vercel

Connect the `suitemonger_seo` repository and leave **Root Directory** as `./`. The checked-in `vercel.json` packages the landing and public assets and routes every public URL through `api/index.js`; no build command or output directory is required.

Set `API_BASE_URL`, `PUBLIC_BASE_URL`, `APPLE_STORE_URL`, and `GOOGLE_PLAY_STORE_URL` in the Vercel project's environment variables, then redeploy. Set `PUBLIC_BASE_URL` to the exact public origin so canonical tags and sitemap URLs agree.

For listing app links, use `PUBLIC_BASE_URL=https://www.suitemonger.com`. Set `ANDROID_APP_SHA256` in Vercel to a JSON array of every Android signing-certificate SHA-256 fingerprint that should open links. For the current Play release and this development machine's debug build, the value is:

```text
["32:A8:A4:F8:C6:69:13:67:4F:BA:10:CA:E3:7E:AB:AC:87:6F:03:A7:E3:D0:99:9F:D0:FE:57:E9:37:33:38:B0","D6:B9:72:5A:DE:59:B0:64:1A:4A:63:05:92:29:E7:7B:A4:C3:BA:6A:B7:57:E3:AA:04:AD:97:77:9D:AD:C7:DE"]
```

The endpoint also accepts a comma-separated value for existing deployments, removes duplicates, and rejects invalid fingerprints. Each developer's debug keystore can have a different SHA-256 fingerprint; obtain it with `keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android` on Windows, then add its `SHA256` value to the array. The default when `ANDROID_APP_SHA256` is unset is the Play fingerprint only. The iOS association uses Apple Team ID `N5MP95N62Q`; override it with `APPLE_TEAM_ID` only if the signing team changes. Both `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` must return `200` directly from `www.suitemonger.com`. The apex domain currently redirects to `www`, so shared links and native associations use `www`.

## Verify

```powershell
npm test
```

The implementation status and remaining backend/admin share work are documented in [`docs/deep-link-sharing-workflow.md`](docs/deep-link-sharing-workflow.md).
