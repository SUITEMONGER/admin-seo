'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const { after, before, test } = require('node:test');
const vm = require('node:vm');

const { createServer } = require('../server');
const {
  activeDiscount,
  extractListingId,
  extractSubListingId,
  listingPriceDetails,
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
    active_discount: {
      id: 'discount-1',
      active: true,
      original_price: 85000,
      new_price: 68000,
      start_at: '2020-01-01T00:00:00Z',
      end_at: '2099-01-01T00:00:00Z',
      bookings_used: 0,
    },
  }],
  approved_at: '2026-09-12T09:00:00Z',
  updated_at: '2026-09-12T10:00:00Z',
};

test('active listing price uses the lowest valid discounted price', () => {
  assert.deepEqual(listingPriceDetails(listing, Date.parse('2026-11-23T12:00:00Z')), {
    originalPrice: 85000,
    effectivePrice: 68000,
    percentageOff: 20,
    hasDiscount: true,
    currency: 'NGN',
    paymentStyle: 'per night',
  });

  const exhausted = {
    ...listing.sub_category[0],
    active_discount: {
      ...listing.sub_category[0].active_discount,
      max_bookings: 2,
      bookings_used: 2,
    },
  };
  assert.equal(activeDiscount(exhausted, Date.parse('2026-11-23T12:00:00Z')), null);
});

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
  assert.match(html, /<del>.*85,000<\/del>/);
  assert.match(html, />.*68,000<\/strong><span class="discount-percentage">20% off<\/span>/);
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
  assert.match(html, /class="price discounted"/);
  assert.match(html, /20% off/);
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
    if (request.url === '/api/v1/listings/categories') {
      response.end(JSON.stringify({ status: true, data: [{ name: 'Serviced Apartment', slug: 'serviced-apartment', active: true }] }));
      return;
    }
    if (request.url === '/api/v1/vendors/services/providers?limit=2') {
      response.end(JSON.stringify({
        status: true,
        data: {
          items: [{
            id: 'provider-1',
            full_name: 'Sparkle Home Care',
            profession_name: 'Home cleaning',
            currency: 'NGN',
            price: 28000,
            charge_type: 'PER_SESSION',
            address: 'Lekki, Lagos',
            available_anywhere: false,
            distance_label: 'Serves near Lekki, Lagos',
            service_image_urls: ['https://images.example.com/cleaning.jpg'],
          }],
          total: 1,
        },
      }));
      return;
    }
    if (request.url === '/api/v1/listings/guest/closest?page=1&limit=6&category=serviced-apartment') {
      response.end(JSON.stringify({ status: true, data: { items: [listing], page: 1, limit: 6, total: 1, total_pages: 1, has_next: false } }));
      return;
    }
    if (request.url === '/api/v1/listings/guest/closest?page=1&limit=10&category=serviced-apartment') {
      response.end(JSON.stringify({ status: true, data: { items: [listing], page: 1, limit: 10, total: 1, total_pages: 1, has_next: false } }));
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
  assert.match(html, /Find your space\./);
  assert.match(html, /id="listing-rail"/);
  assert.match(html, /href="\/suites"/);
  assert.match(html, /href="\/landing\/styles\.css\?v=20261123-1"/);
  assert.match(html, /href="\/about">About us/);
  assert.match(html, /src="\/landing\/assets\/apple\.png"/);
  assert.equal((html.match(/<details class="faq-item">/g) || []).length, 6);
  assert.doesNotMatch(html, /class="faq-copy"/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|>)/);
  assert.match(html, /support@suitemonger\.com/);
  assert.match(html, /Find the place\. Book the help\./);

  const stylesheet = await fetch(`${publicBaseUrl}/landing/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /^text\/css/);
  assert.match(await stylesheet.clone().text(), /--orange: #ff7a1a/);

  const image = await fetch(`${publicBaseUrl}/landing/assets/image-1.jpg`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');

  const appleLogo = await fetch(`${publicBaseUrl}/landing/assets/apple.png`);
  assert.equal(appleLogo.status, 200);
  assert.equal(appleLogo.headers.get('content-type'), 'image/png');
});

test('about page and alias render the complete SuiteMonger story', async () => {
  const response = await fetch(`${publicBaseUrl}/about`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(html, /About SuiteMonger/);
  assert.match(html, /Built to make the journey simpler/);
  assert.match(html, /Three parts of the experience/);
  assert.match(html, /<strong>24<\/strong><span>hours for the lister to respond<\/span>/);
  assert.match(html, /Alphahoop Limited/);
  assert.match(html, /RC 9700366/);
  assert.match(html, /src="\/landing\/assets\/apple\.png"/);

  const alias = await fetch(`${publicBaseUrl}/about-us`);
  assert.equal(alias.status, 200);
  assert.match(await alias.text(), /Our purpose/);

  const stylesheet = await fetch(`${publicBaseUrl}/landing/about.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /^text\/css/);

  const script = await fetch(`${publicBaseUrl}/landing/about.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /^application\/javascript/);
});

test('landing search proxies public categories and returns six-card listing data', async () => {
  const categories = await fetch(`${publicBaseUrl}/landing/api/categories`);
  assert.equal(categories.status, 200);
  assert.deepEqual(await categories.json(), {
    items: [{ name: 'Serviced Apartment', slug: 'serviced-apartment' }],
  });

  const response = await fetch(`${publicBaseUrl}/landing/api/listings?category=serviced-apartment&guests=2`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].title, listing.property_title);
  assert.equal(body.items[0].path, listingPath(listing));
  assert.equal(body.items[0].price, 85000);
  assert.equal(body.items[0].discountedPrice, 68000);
  assert.equal(body.items[0].discountPercentage, 20);
  assert.equal(body.filters.guests, '2');
});

test('landing exposes configured app-store destinations without hardcoding them in the page', async () => {
  const response = await fetch(`${publicBaseUrl}/landing/api/config`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    appleStoreUrl: 'https://apps.apple.com/app/example',
    googlePlayStoreUrl: 'https://play.google.com/store/apps/details?id=example',
  });
});

test('landing service showcase returns safe active-provider display data', async () => {
  const response = await fetch(`${publicBaseUrl}/landing/api/services`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.items.length, 1);
  assert.deepEqual(body.items[0], {
    id: 'provider-1',
    name: 'Sparkle Home Care',
    profession: 'Home cleaning',
    image: 'https://images.example.com/cleaning.jpg',
    currency: 'NGN',
    price: 28000,
    chargeType: 'PER_SESSION',
    address: 'Lekki, Lagos',
    distanceLabel: 'Serves near Lekki, Lagos',
    availableAnywhere: false,
  });
});

test('view-all suites route applies and preserves the landing category filter', async () => {
  const response = await fetch(`${publicBaseUrl}/suites?category=serviced-apartment&guests=2`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Luxury Two Bedroom Suite/);
  assert.match(html, /class="card-price discounted"/);
  assert.match(html, /20% off/);
  assert.match(html, /canonical" href="http:\/\/127\.0\.0\.1\/suites\?category=serviced-apartment&amp;guests=2"/);
});

test('account deletion paths return the placeholder without a 404', async () => {
  for (const route of ['/delete/user-123', '/delete?userId=user-123', '/delete']) {
    const response = await fetch(`${publicBaseUrl}${route}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.match(html, /Delete your account/);
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  }
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
