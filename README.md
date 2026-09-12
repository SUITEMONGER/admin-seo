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

Production defaults to `https://api.suitemonger.com/api/v1` and `https://suitemonger.com`.

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

## Verify

```powershell
npm test
```
