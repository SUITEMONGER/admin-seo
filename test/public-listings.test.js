'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const { after, before, test } = require('node:test');
const vm = require('node:vm');

const { createServer } = require('../server');
const {
  extractListingId,
  extractSubListingId,
  listingPath,
  subListingPath,
} = require('../src/listing');
const { renderListingPage, renderSubListingPage } = require('../src/render');

const testAndroidFingerprints = [Array(32).fill('AA').join(':'), Array(32).fill('BB').join(':')];

function resolvedStoreUrl({ userAgent, platform = '', maxTouchPoints = 0 }) {
  const link = {
    dataset: {
      fallbackUrl: '/',
      appleStoreUrl: 'https://apps.apple.com/app/example',
      googleStoreUrl: 'https://play.google.com/store/apps/details?id=example',
    },
    href: '',
  };
  const source = readFileSync(require.resolve('../public/store-redirect.js'), 'utf8');
  vm.runInNewContext(source, {
    URL,
    navigator: { userAgent, platform, maxTouchPoints },
    document: { querySelectorAll: () => [link] },
  });
  return link.href;
}

const listing = {
  id: '66e100000000000000000001',
  status: 'APPROVED',
  listing_category: 'Serviced Apartment',
  property_title: 'Luxury Two Bedroom Suite',
  full_address: 'Admiralty Way, Lekki Phase 1, Lagos',
  short_description: 'A bright and comfortable serviced apartment close to restaurants and shops.',
  currency: 'NGN',
  price: 125000,
  payment_style: 'per night',
  number_of_bedrooms: 2,
  number_of_bathrooms: 2,
  amenities: [{ name: 'Wi-Fi', icon: '✓' }],
  cover_image: { url: 'https://images.example.com/suite.jpg' },
  images: [{ url: 'https://images.example.com/lounge.jpg' }],
  sub_category: [{
    id: 'room-1',
    name: 'Executive Room',
    price: 85000,
    currency: 'NGN',
    payment_style: 'per night',
    number_of_bedrooms: 1,
    number_of_bathrooms: 1,
    amenities: [{ name: 'Air conditioning' }],
    cover_image: { url: 'https://images.example.com/executive-room.jpg' },
    images: [{ url: 'https://images.example.com/executive-bathroom.jpg' }],
  }],
  approved_at: '2026-09-12T09:00:00Z',
  updated_at: '2026-09-12T10:00:00Z',
};

test('canonical listing URL contains category, property name, address and immutable ID', () => {
  const path = listingPath(listing);
  assert.equal(
    path,
    '/suites/serviced-apartment/luxury-two-bedroom-suite-admiralty-way-lekki-phase-1-lagos--66e100000000000000000001',
  );
  assert.equal(extractListingId(path), listing.id);
  assert.equal(extractListingId(`/suites/${listing.id}`), listing.id);

  const optionPath = subListingPath(listing, listing.sub_category[0]);
  assert.equal(
    optionPath,
    `${path}/options/executive-room--room-1`,
  );
  assert.equal(extractListingId(optionPath), listing.id);
  assert.equal(extractSubListingId(optionPath), 'room-1');
});

test('listing page renders crawlable metadata and safely escapes listing content', () => {
  const dangerous = {
    ...listing,
    property_title: 'Suite <script>alert(1)</script>',
  };
  const html = renderListingPage(dangerous, 'https://suitemonger.com');

  assert.match(html, /<link rel="canonical" href="https:\/\/suitemonger\.com\/suites\//);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /"@type":"LodgingBusiness"/);
  assert.match(html, /Admiralty Way, Lekki Phase 1, Lagos/);
  assert.match(html, /Available suite options/);
  assert.match(html, /Executive Room/);
  assert.match(html, /data-sublisting-section/);
  assert.match(html, /data-sublisting-list/);
  assert.match(html, /options\/executive-room--room-1/);
  assert.match(html, /All photos/);
  assert.match(html, /data-open-app-path="\/suites\//);
  assert.match(html, /id="gallery-data"/);
  assert.match(html, /data-gallery-index="3"/);
  assert.match(html, /data-gallery-thumbnail-index="3"/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('multiple sublistings render as a horizontal clickable carousel', () => {
  const secondOption = {
    ...listing.sub_category[0],
    id: 'room-2',
    name: 'Premium Room',
  };
  const html = renderListingPage(
    { ...listing, sub_category: [...listing.sub_category, secondOption] },
    'https://suitemonger.com',
  );

  assert.match(html, /data-sublisting-list-previous/);
  assert.match(html, /data-sublisting-list-next/);
  assert.match(html, /class="sublisting-card"[^>]+href="[^"]+options\/executive-room--room-1"/);
  assert.match(html, /class="sublisting-card"[^>]+href="[^"]+options\/premium-room--room-2"/);
});

test('sublisting page has its own canonical URL and links back to its parent listing', () => {
  const subListing = listing.sub_category[0];
  const html = renderSubListingPage(listing, subListing, 'https://suitemonger.com');

  assert.match(html, new RegExp(`<link rel="canonical" href="https://suitemonger\\.com${subListingPath(listing, subListing)}`));
  assert.match(html, /<h1>Executive Room<\/h1>/);
  assert.match(html, new RegExp(`href="${listingPath(listing)}`));
  assert.match(html, /Executive Room at Luxury Two Bedroom Suite/);
  assert.match(html, /data-gallery-dialog/);
  assert.doesNotMatch(html, /Available suite options/);
});

test('ordinary listings use the hero gallery without repeating every photo below', () => {
  const html = renderListingPage({ ...listing, sub_category: [] }, 'https://suitemonger.com');

  assert.doesNotMatch(html, /<section class="photo-browser"/);
  assert.doesNotMatch(html, /id="all-photos"/);
  assert.match(html, /data-gallery-dialog/);
  assert.match(html, /id="gallery-data"/);
});

test('store button chooses Android, Apple mobile and desktop destinations', () => {
  assert.equal(
    resolvedStoreUrl({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' }),
    'https://play.google.com/store/apps/details?id=example',
  );
  assert.equal(
    resolvedStoreUrl({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }),
    'https://apps.apple.com/app/example',
  );
  assert.equal(resolvedStoreUrl({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), '/');
});

test('listing app button opens the installed app and falls back to the store', () => {
  const source = readFileSync(require.resolve('../public/store-redirect.js'), 'utf8');
  const handlers = {};
  const link = {
    dataset: {
      openAppPath: '/suites/apartment/example--listing-1',
      fallbackUrl: '/',
      googleStoreUrl: 'https://play.google.com/store/apps/details?id=example',
    },
    addEventListener(type, handler) { handlers[type] = handler; },
    href: '',
  };
  const location = { href: '', assign(url) { this.href = url; } };
  let timeout;
  vm.runInNewContext(source, {
    URL,
    navigator: { userAgent: 'Android', platform: '', maxTouchPoints: 0 },
    document: {
      hidden: false,
      querySelectorAll: (selector) => selector === '[data-open-app-path]' ? [link] : [],
      addEventListener() {},
      removeEventListener() {},
    },
    window: { location },
    setTimeout(callback) { timeout = callback; return 1; },
    clearTimeout() {},
  });
  handlers.click({ preventDefault() {} });
  assert.equal(location.href, 'suitemonger://www.suitemonger.com/suites/apartment/example--listing-1');
  timeout();
  assert.equal(location.href, 'https://play.google.com/store/apps/details?id=example');
});

test('Vercel entry exports a request handler without starting a listener', async () => {
  const handler = require('../api');
  assert.equal(typeof handler, 'function');

  const result = await new Promise((resolve, reject) => {
    let status;
    let headers;
    const response = {
      writeHead(nextStatus, nextHeaders) {
        status = nextStatus;
        headers = nextHeaders;
      },
      end(body) {
        resolve({ status, headers, body: String(body || '') });
      },
    };

    Promise.resolve(handler({ method: 'GET', url: '/health' }, response)).catch(reject);
  });

  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(result.body, '{"status":"ok"}');
});

let apiServer;
let publicServer;
let apiBaseUrl;
let publicBaseUrl;

before(async () => {
  apiServer = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === `/api/v1/listings/${listing.id}`) {
      response.end(JSON.stringify({ status: true, data: listing }));
      return;
    }
    if (request.url === '/api/v1/listings?page=1' || request.url === '/api/v1/listings?page=2') {
      const page = request.url.endsWith('2') ? 2 : 1;
      response.end(JSON.stringify({ status: true, data: { items: [listing], page, limit: 10, total: 21, total_pages: 3, has_next: page < 3 } }));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ status: false }));
  });
  await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}/api/v1`;

  publicServer = createServer({
    apiBaseUrl,
    publicBaseUrl: 'http://127.0.0.1',
    appleStoreUrl: 'https://apps.apple.com/app/example',
    googlePlayStoreUrl: 'https://play.google.com/store/apps/details?id=example',
    androidAppSha256: JSON.stringify([...testAndroidFingerprints, testAndroidFingerprints[0].toLowerCase()]),
  });
  await new Promise((resolve) => publicServer.listen(0, '127.0.0.1', resolve));
  publicBaseUrl = `http://127.0.0.1:${publicServer.address().port}`;
});

after(async () => {
  await Promise.all([
    new Promise((resolve) => publicServer.close(resolve)),
    new Promise((resolve) => apiServer.close(resolve)),
  ]);
});

test('ID-only routes permanently redirect to the descriptive canonical URL', async () => {
  const response = await fetch(`${publicBaseUrl}/suites/${listing.id}`, { redirect: 'manual' });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), `http://127.0.0.1${listingPath(listing)}`);

  const subListing = listing.sub_category[0];
  const optionResponse = await fetch(
    `${publicBaseUrl}/suites/${listing.id}/options/${subListing.id}`,
    { redirect: 'manual' },
  );
  assert.equal(optionResponse.status, 301);
  assert.equal(
    optionResponse.headers.get('location'),
    `http://127.0.0.1${subListingPath(listing, subListing)}`,
  );
});

test('canonical route returns server-rendered HTML and sitemap lists it', async () => {
  const canonicalResponse = await fetch(`${publicBaseUrl}${listingPath(listing)}`);
  assert.equal(canonicalResponse.status, 200);
  assert.match(canonicalResponse.headers.get('content-type'), /^text\/html/);
  assert.match(await canonicalResponse.text(), /Luxury Two Bedroom Suite/);

  const sitemapResponse = await fetch(`${publicBaseUrl}/sitemaps/listings-1.xml`);
  assert.equal(sitemapResponse.status, 200);
  assert.match(await sitemapResponse.text(), new RegExp(listing.id));

  const optionResponse = await fetch(`${publicBaseUrl}${subListingPath(listing, listing.sub_category[0])}`);
  assert.equal(optionResponse.status, 200);
  assert.match(await optionResponse.text(), /Executive Room at Luxury Two Bedroom Suite/);

  const logoResponse = await fetch(`${publicBaseUrl}/brand/logo.png`);
  assert.equal(logoResponse.status, 200);
  assert.equal(logoResponse.headers.get('content-type'), 'image/png');

  const galleryScriptResponse = await fetch(`${publicBaseUrl}/gallery.js`);
  assert.equal(galleryScriptResponse.status, 200);
  assert.match(galleryScriptResponse.headers.get('content-type'), /^application\/javascript/);

  const storeScriptResponse = await fetch(`${publicBaseUrl}/store-redirect.js`);
  assert.equal(storeScriptResponse.status, 200);
  assert.match(await storeScriptResponse.text(), /isAppleMobile/);
});

test('root serves the landing page and its assets', async () => {
  const response = await fetch(`${publicBaseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /SuiteMonger is the trust layer/);
  assert.match(html, /href="\/suites"/);
  assert.match(html, /href="\/landing\/styles\.css"/);

  const stylesheet = await fetch(`${publicBaseUrl}/landing/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /^text\/css/);
});

test('iOS association file describes the listing paths', async () => {
  const response = await fetch(`${publicBaseUrl}/.well-known/apple-app-site-association`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.applinks.details[0].appID, 'N5MP95N62Q.com.mobile.suitemonger');
  assert.deepEqual(body.applinks.details[0].paths, ['/suites/*']);
});

test('Android association includes distinct local and production signing fingerprints', async () => {
  const response = await fetch(`${publicBaseUrl}/.well-known/assetlinks.json`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body[0].target.package_name, 'com.mobile.suitemonger');
  assert.deepEqual(body[0].target.sha256_cert_fingerprints, testAndroidFingerprints);
});

test('Android association also accepts comma-separated fingerprints', async () => {
  const server = createServer({ androidAppSha256: testAndroidFingerprints.join(',') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/.well-known/assetlinks.json`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body[0].target.sha256_cert_fingerprints, testAndroidFingerprints);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('main page fetches the requested page and renders crawlable pagination', async () => {
  const response = await fetch(`${publicBaseUrl}/suites?page=2`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Approved suites – page 2/);
  assert.match(html, /rel="prev" href="http:\/\/127\.0\.0\.1\/suites"/);
  assert.match(html, /rel="next" href="http:\/\/127\.0\.0\.1\/suites\?page=3"/);
  assert.match(html, /aria-current="page" class="current">2<\/a>/);
  assert.match(html, /1 suite option/);
  assert.match(html, /data-apple-store-url="https:\/\/apps\.apple\.com\/app\/example"/);
  assert.match(html, /data-google-store-url="https:\/\/play\.google\.com\/store\/apps\/details\?id=example"/);
});
