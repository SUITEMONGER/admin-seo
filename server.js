'use strict';

const http = require('node:http');
const { readFileSync } = require('node:fs');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const { ApiError, fetchApprovedListing, fetchApprovedListings } = require('./src/api');
const {
  extractListingId,
  extractSubListingId,
  listingPath,
  subListingPath,
} = require('./src/listing');
const {
  absoluteUrl,
  escapeXml,
  renderErrorPage,
  renderHomePage,
  renderListingPage,
  renderSubListingPage,
} = require('./src/render');

const ROOT = __dirname;
const LANDING_ROOT = path.join(ROOT, 'src', 'landing');
const DEFAULT_API_BASE_URL = 'https://api.suitemonger.com/api/v1';
const DEFAULT_PUBLIC_BASE_URL = 'https://www.suitemonger.com';
const DEFAULT_ANDROID_APP_SHA256 = '32:A8:A4:F8:C6:69:13:67:4F:BA:10:CA:E3:7E:AB:AC:87:6F:03:A7:E3:D0:99:9F:D0:FE:57:E9:37:33:38:B0';

try {
  const localEnv = readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const rawLine of localEnv.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function appConfig(overrides = {}) {
  return {
    apiBaseUrl: overrides.apiBaseUrl || process.env.API_BASE_URL || DEFAULT_API_BASE_URL,
    publicBaseUrl: String(overrides.publicBaseUrl || process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, ''),
    appleStoreUrl: overrides.appleStoreUrl ?? process.env.APPLE_STORE_URL ?? '',
    googlePlayStoreUrl: overrides.googlePlayStoreUrl ?? process.env.GOOGLE_PLAY_STORE_URL ?? '',
    appleTeamId: overrides.appleTeamId ?? process.env.APPLE_TEAM_ID ?? 'N5MP95N62Q',
    androidAppSha256: overrides.androidAppSha256 ?? process.env.ANDROID_APP_SHA256 ?? DEFAULT_ANDROID_APP_SHA256,
  };
}

function androidAppFingerprints(value) {
  let entries = value;
  if (typeof entries === 'string') {
    const trimmed = entries.trim();
    if (trimmed.startsWith('[')) {
      try {
        entries = JSON.parse(trimmed);
      } catch {
        return [];
      }
    } else {
      entries = trimmed.split(',');
    }
  }
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const fingerprints = entries.map((entry) =>
    typeof entry === 'string' ? entry.trim().toUpperCase() : '',
  );
  if (fingerprints.some((entry) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(entry))) {
    return [];
  }
  return [...new Set(fingerprints)];
}

function staticContentType(filename) {
  const extension = path.extname(filename).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  }[extension] || 'application/octet-stream';
}

function securityHeaders(contentType, cacheControl = 'public, max-age=300, stale-while-revalidate=3600') {
  return {
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  };
}

function send(response, requestMethod, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(requestMethod === 'HEAD' ? undefined : body);
}

function sitemapUrlSet(urls) {
  const entries = urls.map(({ location, lastModified }) => `  <url>
    <loc>${escapeXml(location)}</loc>${lastModified ? `
    <lastmod>${escapeXml(lastModified)}</lastmod>` : ''}
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

function sitemapIndex(publicBaseUrl, totalPages) {
  const locations = [absoluteUrl(publicBaseUrl, '/sitemaps/pages.xml')];
  for (let page = 1; page <= totalPages; page += 1) {
    locations.push(absoluteUrl(publicBaseUrl, `/sitemaps/listings-${page}.xml`));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locations.map((location) => `  <sitemap><loc>${escapeXml(location)}</loc></sitemap>`).join('\n')}
</sitemapindex>`;
}

function createRequestHandler(overrides = {}) {
  const config = appConfig(overrides);

  return async function requestHandler(request, response) {
    const method = request.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      send(response, method, 405, 'Method not allowed', { Allow: 'GET, HEAD', ...securityHeaders('text/plain; charset=utf-8', 'no-store') });
      return;
    }

    const url = new URL(request.url || '/', config.publicBaseUrl);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (pathname === '/health') {
        send(response, method, 200, JSON.stringify({ status: 'ok' }), securityHeaders('application/json; charset=utf-8', 'no-store'));
        return;
      }

      if (pathname === '/.well-known/apple-app-site-association') {
        const body = JSON.stringify({
          applinks: {
            apps: [],
            details: [{
              appIDs: [`${config.appleTeamId}.com.mobile.suitemonger`,`N5MP95N62Q.com.mobile.suitemonger`],
              paths: ['/suites/*'],
              components: [{"/":"/suites/*"}]
            }],
          },
        });
        send(response, method, 200, body, securityHeaders('application/json; charset=utf-8', 'public, max-age=3600'));
        return;
      }

      if (pathname === '/.well-known/assetlinks.json') {
        const fingerprints = androidAppFingerprints(config.androidAppSha256);
        if (fingerprints.length === 0) {
          send(response, method, 503, JSON.stringify({ error: 'ANDROID_APP_SHA256 must contain valid SHA-256 fingerprints' }), securityHeaders('application/json; charset=utf-8', 'no-store'));
          return;
        }
        const body = JSON.stringify([{
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.mobile.suitemonger',
            sha256_cert_fingerprints: fingerprints,
          },
        }]);
        send(response, method, 200, body, securityHeaders('application/json; charset=utf-8', 'public, max-age=3600'));
        return;
      }

      if (pathname === '/') {
        const html = await readFile(path.join(LANDING_ROOT, 'index.html'));
        send(response, method, 200, html, securityHeaders('text/html; charset=utf-8'));
        return;
      }

      if (pathname.startsWith('/landing/')) {
        const relativePath = pathname.slice('/landing/'.length);
        const landingRoot = `${path.resolve(LANDING_ROOT)}${path.sep}`;
        const assetPath = path.resolve(LANDING_ROOT, relativePath);
        if (!assetPath.toLowerCase().startsWith(landingRoot.toLowerCase())) {
          throw new ApiError('Landing asset not found', 404);
        }
        let asset;
        try {
          asset = await readFile(assetPath);
        } catch (error) {
          if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
            throw new ApiError('Landing asset not found', 404);
          }
          throw error;
        }
        send(response, method, 200, asset, securityHeaders(staticContentType(assetPath), 'public, max-age=86400'));
        return;
      }

      if (pathname === '/styles.css') {
        const css = await readFile(path.join(ROOT, 'public', 'styles.css'));
        send(response, method, 200, css, securityHeaders('text/css; charset=utf-8', 'public, max-age=86400'));
        return;
      }

      if (pathname === '/gallery.js') {
        const javascript = await readFile(path.join(ROOT, 'public', 'gallery.js'));
        send(response, method, 200, javascript, securityHeaders('application/javascript; charset=utf-8', 'public, max-age=86400'));
        return;
      }

      if (pathname === '/store-redirect.js') {
        const javascript = await readFile(path.join(ROOT, 'public', 'store-redirect.js'));
        send(response, method, 200, javascript, securityHeaders('application/javascript; charset=utf-8', 'public, max-age=86400'));
        return;
      }

      if (pathname === '/brand/logo.png' || pathname === '/brand/favicon.png') {
        const filename = pathname.endsWith('favicon.png') ? 'favicon.png' : 'logo.png';
        const image = await readFile(path.join(ROOT, 'public', filename));
        send(response, method, 200, image, securityHeaders('image/png', 'public, max-age=604800, immutable'));
        return;
      }

      if (pathname === '/robots.txt') {
        const body = `User-agent: *\nAllow: /\nSitemap: ${absoluteUrl(config.publicBaseUrl, '/sitemap.xml')}\n`;
        send(response, method, 200, body, securityHeaders('text/plain; charset=utf-8', 'public, max-age=3600'));
        return;
      }

      if (pathname === '/sitemap.xml') {
        const firstPage = await fetchApprovedListings(config.apiBaseUrl, 1);
        const body = sitemapIndex(config.publicBaseUrl, firstPage.totalPages);
        send(response, method, 200, body, securityHeaders('application/xml; charset=utf-8', 'public, max-age=300'));
        return;
      }

      if (pathname === '/sitemaps/pages.xml') {
        const body = sitemapUrlSet([
          { location: absoluteUrl(config.publicBaseUrl, '/') },
          { location: absoluteUrl(config.publicBaseUrl, '/suites') },
        ]);
        send(response, method, 200, body, securityHeaders('application/xml; charset=utf-8', 'public, max-age=3600'));
        return;
      }

      const sitemapMatch = pathname.match(/^\/sitemaps\/listings-(\d+)\.xml$/);
      if (sitemapMatch) {
        const page = Number(sitemapMatch[1]);
        const listings = await fetchApprovedListings(config.apiBaseUrl, page);
        if (page < 1 || (listings.totalPages > 0 && page > listings.totalPages)) throw new ApiError('Sitemap not found', 404);
        const urls = listings.items.flatMap((listing) => {
          const lastModified = listing.updated_at || listing.approved_at || '';
          const listingUrl = {
            location: absoluteUrl(config.publicBaseUrl, listingPath(listing)),
            lastModified,
          };
          const optionUrls = Array.isArray(listing.sub_category)
            ? listing.sub_category
              .filter((subListing) => subListing?.id && subListing?.name)
              .map((subListing) => ({
                location: absoluteUrl(config.publicBaseUrl, subListingPath(listing, subListing)),
                lastModified: subListing.updated_at || lastModified,
              }))
            : [];
          return [listingUrl, ...optionUrls];
        });
        const body = sitemapUrlSet(urls);
        send(response, method, 200, body, securityHeaders('application/xml; charset=utf-8', 'public, max-age=300'));
        return;
      }

      if (pathname === '/suites') {
        const rawPage = url.searchParams.get('page');
        if (rawPage !== null && (!/^\d+$/.test(rawPage) || Number(rawPage) < 1)) {
          send(response, method, 301, '', {
            Location: absoluteUrl(config.publicBaseUrl, '/suites'),
            ...securityHeaders('text/plain; charset=utf-8', 'public, max-age=3600'),
          });
          return;
        }
        const page = rawPage === null ? 1 : Number(rawPage);
        const listings = await fetchApprovedListings(config.apiBaseUrl, page);
        if (page > 1 && (listings.totalPages === 0 || page > listings.totalPages)) {
          throw new ApiError('Page not found', 404);
        }
        const body = renderHomePage(listings.items, config.publicBaseUrl, listings, config);
        send(response, method, 200, body, securityHeaders('text/html; charset=utf-8'));
        return;
      }

      const listingID = extractListingId(pathname);
      if (listingID) {
        const listing = await fetchApprovedListing(config.apiBaseUrl, listingID);
        const subListingID = extractSubListingId(pathname);
        const subListing = subListingID
          ? listing.sub_category?.find((item) => String(item?.id) === subListingID)
          : undefined;
        if (subListingID && !subListing) throw new ApiError('Suite option not found', 404);

        const canonicalPath = subListing
          ? subListingPath(listing, subListing)
          : listingPath(listing);
        if (pathname !== canonicalPath) {
          send(response, method, 301, '', {
            Location: absoluteUrl(config.publicBaseUrl, canonicalPath),
            ...securityHeaders('text/plain; charset=utf-8', 'public, max-age=3600'),
          });
          return;
        }
        const body = subListing
          ? renderSubListingPage(listing, subListing, config.publicBaseUrl, config)
          : renderListingPage(listing, config.publicBaseUrl, config);
        send(response, method, 200, body, securityHeaders('text/html; charset=utf-8'));
        return;
      }

      const body = renderErrorPage(404, config.publicBaseUrl, config);
      send(response, method, 404, body, securityHeaders('text/html; charset=utf-8', 'no-store'));
    } catch (error) {
      const status = error instanceof ApiError && error.status === 404 ? 404 : 503;
      const body = renderErrorPage(status, config.publicBaseUrl, config);
      if (status === 503) console.error(error);
      send(response, method, status, body, {
        ...(status === 503 ? { 'Retry-After': '60' } : {}),
        ...securityHeaders('text/html; charset=utf-8', 'no-store'),
      });
    }
  };
}

function createServer(overrides = {}) {
  return http.createServer(createRequestHandler(overrides));
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, () => {
    console.log(`SuiteMonger public listings listening on :${port}`);
  });
}

module.exports = { createRequestHandler, createServer, sitemapIndex, sitemapUrlSet };
