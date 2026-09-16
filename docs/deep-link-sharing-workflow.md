# Listing deep links and sharing workflow

## Current implementation (September 2026)

- The mobile app shares public `https://www.suitemonger.com/suites/...` URLs from approved listing and suite-option detail views.
- Android App Links and iOS Universal Links are declared for `www.suitemonger.com/suites/*`.
- The SEO service serves both association files. Android uses the supplied Play app-signing fingerprint; iOS uses the Team ID in the Xcode project.
- Incoming links check the listing and current account. A lister opens their own listing in the lister area; other non-user accounts are asked before switching to guest view.
- Pending and rejected listings can now be edited and resubmitted for review.
- Backend-generated `public_url` fields and admin-portal share controls remain to be implemented. The mobile app currently derives the URL when `public_url` is absent.

## Goal

Use one public HTTPS URL for every approved listing and suite option. A tap should open the corresponding screen in the SuiteMonger app when it is installed and show the crawlable web page when it is not. The mobile app and admin portal should both generate and share the same URL.

The app identifier currently used by Android and iOS is `com.mobile.suitemonger`. The mobile app already uses `go_router`.

## URL contract

- Listing: `https://www.suitemonger.com/suites/{category}/{name-and-address}--{listing-id}`
- Suite option: `https://www.suitemonger.com/suites/{category}/{name-and-address}--{listing-id}/options/{option-name}--{sublisting-id}`
- The listing and sublisting IDs are authoritative. Descriptive segments are for people and search engines.
- Existing ID-only routes remain the durable fallback and redirect to the current canonical URL:
  - `/suites/{listing-id}`
  - `/suites/{listing-id}/options/{sublisting-id}`
- Only approved, publicly available listings may produce a share action.

## Implementation order

### 1. Make the backend the URL authority

- Add one URL builder in `suitemonger-go` using `PUBLIC_WEB_URL` as its origin.
- Return `public_url` on listing responses and `public_url` on each sublisting.
- Generate the URL only for approved listings.
- Reuse the existing SEO slug rules so the backend, SEO site, mobile app, and admin portal cannot create different URLs.
- Keep ID-only redirects so an already shared link survives later changes to a listing's name, category, or address.

### 2. Prove domain ownership to Android and Apple

- Serve `/.well-known/assetlinks.json` from `www.suitemonger.com` without authentication or redirects.
- Associate Android package `com.mobile.suitemonger` with every production signing-certificate SHA-256 fingerprint.
- Serve `/.well-known/apple-app-site-association` from `www.suitemonger.com` with the correct Apple Team ID and app bundle identifier.
- Limit both association files to `/suites/*` routes.
- Add Android verified App Link intent filters for `https://www.suitemonger.com/suites/...`.
- Add the iOS Associated Domains entitlement `applinks:www.suitemonger.com`.

The Apple Developer Team ID and Play production app-signing SHA-256 fingerprint have been configured. Add any future production signing fingerprint to `ANDROID_APP_SHA256` before rotating certificates.

### 3. Handle incoming links in Flutter

- Add a deep-link service that handles both cold starts and links received while the app is running.
- Parse the listing ID and optional sublisting ID from the HTTPS path; do not depend on the descriptive slug.
- Fetch the latest approved listing from the backend before opening it.
- Route to the existing listing detail screen with `go_router` and select the requested sublisting when present.
- Preserve a pending deep link through startup/auth initialization, then continue after the app is ready.
- Show a clear unavailable message when a listing has been suspended, archived, rejected, or removed.
- Prevent duplicate navigation when the same startup link is emitted more than once.

### 4. Add sharing to the mobile app

- Add a Share action to the listing detail and sublisting detail views.
- Share the backend-provided `public_url`, never a locally assembled URL.
- Include a short title plus the HTTPS URL in the platform share sheet.
- Hide or disable sharing when `public_url` is absent because the listing is not publicly approved.

### 5. Add sharing to the admin portal

- After approval succeeds, refresh the listing so the response contains `public_url`.
- Add `View public page`, `Copy link`, and `Share` actions for approved listings.
- Use the browser Web Share API where available and copy to the clipboard as the fallback.
- Add the same actions for each approved sublisting using its own `public_url`.
- Do not expose a public-share action for pending, rejected, suspended, or archived listings.

### 6. Improve the web page's Open in SuiteMonger action

- Keep the public HTTPS URL as the shared and indexed address.
- Once App Links and Universal Links are verified, use the associated HTTPS listing URL for the open-app action.
- If same-site browser behavior prevents the operating system from handing the URL to the app, add a dedicated associated host such as `open.suitemonger.com`. Its browser fallback should return to the canonical listing page or the correct store URL.
- Keep the current platform-specific store links as the fallback when the app is not installed.

### 7. Verify before release

- Android installed: tapping a link from messages/email opens the exact listing or suite option in the app.
- Android not installed: the same link opens its public web page.
- iOS installed and not installed: verify the same two cases on a physical device.
- Cold start, warm start, logged-in, logged-out, expired session, and duplicate-link cases work.
- Desktop links continue to open the crawlable page.
- Suspended and removed listings do not open stale app content.
- URLs copied from the app and admin portal are identical and resolve to the canonical web URL.
- `assetlinks.json` and `apple-app-site-association` are publicly accessible with valid JSON and correct response headers.

## Next work

Implement the backend `public_url` builder and include its result in approved listing and sublisting API responses, then add admin-portal share controls. After deploying the SEO service and releasing the updated app, verify link association and routing on physical Android and iOS devices.
