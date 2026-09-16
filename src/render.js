'use strict';

const {
  listingAddress,
  listingCurrency,
  listingImages,
  listingPath,
  listingPrice,
  mediaImages,
  subListingPath,
} = require('./listing');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function truncate(value, limit) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const shortened = text.slice(0, Math.max(0, limit - 1));
  const wordBoundary = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, wordBoundary > limit * 0.65 ? wordBoundary : shortened.length).trim()}…`;
}

function absoluteUrl(publicBaseUrl, path) {
  return new URL(path, `${String(publicBaseUrl).replace(/\/+$/, '')}/`).toString();
}

function formatPrice(listing) {
  const price = listingPrice(listing);
  if (!price) return '';
  const currency = listingCurrency(listing);
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString('en-NG')}`;
  }
}

function pluralFact(value, singular, plural = `${singular}s`) {
  const amount = Number(value) || 0;
  return amount > 0 ? `${amount} ${amount === 1 ? singular : plural}` : '';
}

function listingFacts(listing) {
  return [
    pluralFact(listing?.number_of_bedrooms, 'bedroom'),
    pluralFact(listing?.number_of_bathrooms, 'bathroom'),
    pluralFact(listing?.number_of_rooms, 'room'),
    listing?.furnished ? String(listing.furnished) : '',
    listing?.minimum_booking_days
      ? `${listing.minimum_booking_days} day minimum stay`
      : '',
  ].filter(Boolean);
}

function listingDescription(listing) {
  const facts = listingFacts(listing).slice(0, 3).join(', ');
  const price = formatPrice(listing);
  const details = [facts, price ? `from ${price}` : ''].filter(Boolean).join(' · ');
  return truncate([listing?.short_description, details].filter(Boolean).join(' '), 160);
}

function listingStructuredData(listing, canonicalUrl, images) {
  const address = listingAddress(listing);
  const location = Array.isArray(listing?.location) ? listing.location[0] : undefined;
  const price = listingPrice(listing);
  const currency = listingCurrency(listing);
  const amenities = Array.isArray(listing?.amenities) ? listing.amenities : [];
  const subListings = Array.isArray(listing?.sub_category) ? listing.sub_category : [];
  const subListingOffers = subListings
    .filter((item) => listingPrice(item) > 0)
    .map((item) => ({
      '@type': 'Offer',
      name: item.name,
      price: listingPrice(item),
      priceCurrency: listingCurrency(item),
      url: canonicalUrl,
      itemOffered: {
        '@type': 'Room',
        name: item.name,
        numberOfRooms: Number(item.number_of_rooms) || undefined,
      },
    }));

  const accommodation = {
    '@type': 'LodgingBusiness',
    '@id': `${canonicalUrl}#listing`,
    name: listing.property_title,
    description: listing.short_description,
    url: canonicalUrl,
    image: images,
    address: address ? { '@type': 'PostalAddress', streetAddress: address } : undefined,
    geo: Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.long))
      ? {
          '@type': 'GeoCoordinates',
          latitude: Number(location.lat),
          longitude: Number(location.long),
        }
      : undefined,
    amenityFeature: amenities
      .filter((amenity) => amenity?.name)
      .map((amenity) => ({ '@type': 'LocationFeatureSpecification', name: amenity.name, value: true })),
    aggregateRating: Number(listing?.review_count) > 0 && Number(listing?.average_rating) > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(listing.average_rating),
          reviewCount: Number(listing.review_count),
        }
      : undefined,
    makesOffer: subListingOffers.length
      ? subListingOffers
      : price > 0 ? {
          '@type': 'Offer',
          price,
          priceCurrency: currency,
          url: canonicalUrl,
        }
      : undefined,
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${new URL(canonicalUrl).origin}/#website`,
        name: 'SuiteMonger',
        url: `${new URL(canonicalUrl).origin}/`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'SuiteMonger', item: `${new URL(canonicalUrl).origin}/` },
          { '@type': 'ListItem', position: 2, name: String(listing.listing_category || 'Suites'), item: canonicalUrl },
          { '@type': 'ListItem', position: 3, name: listing.property_title, item: canonicalUrl },
        ],
      },
      accommodation,
    ],
  };
}

function renderDocument({
  title,
  description,
  canonicalUrl,
  image,
  robots = 'index,follow',
  structuredData = null,
  extraHead = '',
  body,
  scripts = '',
  storeUrls = {},
}) {
  const socialImage = image || absoluteUrl(canonicalUrl, '/brand/logo.png');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <meta name="theme-color" content="#e7472e">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="icon" href="/brand/favicon.png" type="image/png">
  <link rel="stylesheet" href="/styles.css?v=20260912-3">
  <meta property="og:site_name" content="SuiteMonger">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
  <meta property="og:image:alt" content="${escapeHtml(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  ${extraHead}
  ${structuredData ? `<script type="application/ld+json">${jsonForHtml(structuredData)}</script>` : ''}
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/" aria-label="SuiteMonger home">
      <img src="/brand/logo.png" alt="SuiteMonger" width="164" height="48">
    </a>
    ${renderStoreLink('Get the app', 'header-cta', storeUrls)}
  </header>
  ${body}
  <footer class="site-footer">
    <p>Find and book trusted stays with SuiteMonger.</p>
    <p>&copy; ${new Date().getUTCFullYear()} SuiteMonger</p>
  </footer>
  <script src="/store-redirect.js?v=20260916-1" defer></script>
  <script src="/gallery.js?v=20260912-3" defer></script>
  ${scripts}
</body>
</html>`;
}

function renderStoreLink(label, className, storeUrls = {}, openAppPath = '') {
  return `<a class="${escapeHtml(className)}" href="/" ${openAppPath ? `data-open-app-path="${escapeHtml(openAppPath)}"` : 'data-store-redirect'} data-fallback-url="/" data-apple-store-url="${escapeHtml(storeUrls.appleStoreUrl || '')}" data-google-store-url="${escapeHtml(storeUrls.googlePlayStoreUrl || '')}">${escapeHtml(label)}</a>`;
}

function galleryButton(url, index, title, className, loading = 'lazy') {
  return `<button class="${className}" type="button" data-gallery-index="${index}" aria-label="Open ${escapeHtml(title)} photo ${index + 1}">
    <img src="${escapeHtml(url)}" alt="${escapeHtml(`${title} photo ${index + 1}`)}" loading="${loading}" ${index === 0 ? 'fetchpriority="high"' : ''}>
  </button>`;
}

function renderSubListings(listing) {
  const subListings = Array.isArray(listing?.sub_category)
    ? listing.sub_category.filter((item) => item?.name && item?.id)
    : [];
  if (!subListings.length) return '';

  const cards = subListings.map((subListing) => {
    const facts = listingFacts(subListing);
    const price = formatPrice(subListing);
    const optionPath = subListingPath(listing, subListing);
    const optionImages = mediaImages(subListing);
    const amenities = Array.isArray(subListing?.amenities)
      ? subListing.amenities.filter((item) => item?.name).slice(0, 6)
      : [];

    return `<a class="sublisting-card" id="suite-option-${escapeHtml(subListing.id)}" href="${escapeHtml(optionPath)}">
      <div class="sublisting-card-media">
        ${optionImages[0]
          ? `<img src="${escapeHtml(optionImages[0])}" alt="${escapeHtml(subListing.name)}" loading="lazy">`
          : '<div class="card-placeholder">SuiteMonger suite option</div>'}
        ${optionImages.length ? `<span>${optionImages.length} ${optionImages.length === 1 ? 'photo' : 'photos'}</span>` : ''}
      </div>
      <div class="sublisting-copy">
        <div class="sublisting-heading">
          <h3>${escapeHtml(subListing.name)}</h3>
          ${price ? `<strong>${escapeHtml(price)}</strong>` : ''}
        </div>
        ${subListing.payment_style ? `<p class="sublisting-payment">${escapeHtml(subListing.payment_style)}</p>` : ''}
        ${facts.length ? `<ul class="facts compact">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>` : ''}
        ${amenities.length ? `<p class="sublisting-amenities">${amenities.map((amenity) => escapeHtml(amenity.name)).join(' · ')}</p>` : ''}
        <span class="sublisting-link">View this suite <span aria-hidden="true">&rarr;</span></span>
      </div>
    </a>`;
  }).join('\n');

  return `<section class="content-section sublistings" aria-labelledby="suite-options" data-sublisting-section>
    <div class="section-heading">
      <div><p class="section-kicker">Choose your space</p><h2 id="suite-options">Available suite options</h2></div>
      <div class="sublisting-section-actions">
        <span>${subListings.length} ${subListings.length === 1 ? 'option' : 'options'}</span>
        ${subListings.length > 1 ? `<div class="sublisting-rail-controls">
          <button type="button" data-sublisting-list-previous aria-label="Previous suite option" disabled>&larr;</button>
          <button type="button" data-sublisting-list-next aria-label="Next suite option">&rarr;</button>
        </div>` : ''}
      </div>
    </div>
    <div class="sublisting-grid" data-sublisting-list>${cards}</div>
  </section>`;
}

function renderPhotoBrowser(images, title, { showPreviews = true } = {}) {
  if (!images.length) return { previews: '', dialog: '', scripts: '' };

  const previews = showPreviews ? `<section class="photo-browser" aria-labelledby="all-photos">
    <div class="section-heading"><h2 id="all-photos">All photos</h2><span>${images.length} ${images.length === 1 ? 'photo' : 'photos'}</span></div>
    <div class="thumbnail-rail">${images.map((url, index) => galleryButton(url, index, title, 'thumbnail-button')).join('')}</div>
  </section>` : '';

  const dialog = `<dialog class="gallery-dialog" data-gallery-dialog aria-labelledby="gallery-title">
    <div class="gallery-toolbar">
      <div>
        <strong id="gallery-title" data-gallery-title>${escapeHtml(`${title} photo 1`)}</strong>
        <span data-gallery-count>1 of ${images.length}</span>
      </div>
      <button type="button" data-gallery-close aria-label="Close gallery">Close</button>
    </div>
    <div class="gallery-stage">
      <button class="gallery-arrow previous" type="button" data-gallery-previous aria-label="Previous photo"><span aria-hidden="true">&larr;</span><span>Previous</span></button>
      <figure><img data-gallery-image alt=""></figure>
      <button class="gallery-arrow next" type="button" data-gallery-next aria-label="Next photo"><span>Next</span><span aria-hidden="true">&rarr;</span></button>
    </div>
    <div class="gallery-thumbnail-rail" data-gallery-thumbnails aria-label="Gallery thumbnails">
      ${images.map((url, index) => `<button type="button" data-gallery-thumbnail-index="${index}" aria-label="Show ${escapeHtml(`${title} photo ${index + 1}`)}"${index === 0 ? ' class="current"' : ''}><img src="${escapeHtml(url)}" alt="" loading="lazy"></button>`).join('')}
    </div>
  </dialog>`;

  const galleryData = images.map((url, index) => ({
    src: url,
    alt: `${title} photo ${index + 1}`,
  }));
  const scripts = `<script id="gallery-data" type="application/json">${jsonForHtml(galleryData)}</script>`;
  return { previews, dialog, scripts };
}

function renderTopGallery(images, title) {
  if (!images.length) return '<div class="gallery-placeholder">SuiteMonger verified listing</div>';

  return `<section class="gallery gallery-count-${Math.min(images.length, 5)}" aria-label="Photos of ${escapeHtml(title)}">
    ${images.slice(0, 5).map((url, index) => galleryButton(url, index, title, 'gallery-item', index === 0 ? 'eager' : 'lazy')).join('\n')}
    ${images.length > 5 ? `<button class="view-all-photos" type="button" data-gallery-index="0">View all ${images.length} photos</button>` : ''}
  </section>`;
}

function renderListingPage(listing, publicBaseUrl, storeUrls = {}) {
  const path = listingPath(listing);
  const canonicalUrl = absoluteUrl(publicBaseUrl, path);
  const address = listingAddress(listing);
  const images = listingImages(listing);
  const title = truncate(`${listing.property_title}${address ? ` in ${address}` : ''} | SuiteMonger`, 68);
  const description = listingDescription(listing) || `View ${listing.property_title} and book with SuiteMonger.`;
  const price = formatPrice(listing);
  const facts = listingFacts(listing);
  const amenities = Array.isArray(listing?.amenities) ? listing.amenities.filter((item) => item?.name) : [];
  const rules = Array.isArray(listing?.house_rules) ? listing.house_rules.filter(Boolean) : [];
  const structuredData = listingStructuredData(listing, canonicalUrl, images);
  const hasSubListings = Array.isArray(listing?.sub_category)
    && listing.sub_category.some((item) => item?.name);
  const photoBrowser = renderPhotoBrowser(images, listing.property_title, {
    showPreviews: hasSubListings,
  });

  const gallery = renderTopGallery(images, listing.property_title);

  const body = `<main>
    ${gallery}
    <article class="listing-shell">
      <div class="listing-main">
        <div class="eyebrow"><span>Approved listing</span><span>${escapeHtml(listing.listing_category || 'Suite')}</span></div>
        <h1>${escapeHtml(listing.property_title)}</h1>
        ${address ? `<p class="address"><span aria-hidden="true">⌖</span> ${escapeHtml(address)}</p>` : ''}
        ${facts.length ? `<ul class="facts">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>` : ''}
        <section class="content-section">
          <h2>About this suite</h2>
          <p>${escapeHtml(listing.short_description || 'View this approved SuiteMonger listing in the app for availability and booking details.')}</p>
        </section>
        ${renderSubListings(listing)}
        ${amenities.length ? `<section class="content-section"><h2>Amenities</h2><ul class="amenities">${amenities.map((amenity) => `<li>${escapeHtml(amenity.icon || '✓')} ${escapeHtml(amenity.name)}</li>`).join('')}</ul></section>` : ''}
        ${rules.length ? `<section class="content-section"><h2>House rules</h2><ul class="rules">${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul></section>` : ''}
        ${photoBrowser.previews}
      </div>
      <aside class="booking-card">
        ${price ? `<p class="price"><strong>${escapeHtml(price)}</strong><span>${escapeHtml(listing.payment_style || '')}</span></p>` : ''}
        <p>Check live availability and complete your booking securely in the SuiteMonger app.</p>
        ${renderStoreLink('Open in SuiteMonger', 'primary-cta', storeUrls, path)}
        <small>Listing reference: ${escapeHtml(listing.id)}</small>
      </aside>
    </article>
    ${photoBrowser.dialog}
  </main>`;

  return renderDocument({ title, description, canonicalUrl, image: images[0], structuredData, body, scripts: photoBrowser.scripts, storeUrls });
}

function renderSubListingPage(listing, subListing, publicBaseUrl, storeUrls = {}) {
  const parentPath = listingPath(listing);
  const path = subListingPath(listing, subListing);
  const canonicalUrl = absoluteUrl(publicBaseUrl, path);
  const address = listingAddress(listing);
  const images = mediaImages(subListing);
  const displayName = `${subListing.name} at ${listing.property_title}`;
  const detail = {
    ...listing,
    ...subListing,
    property_title: displayName,
    short_description: subListing.short_description || listing.short_description,
    full_address: address,
    listing_category: listing.listing_category,
    sub_category: [],
  };
  const title = truncate(`${displayName}${address ? ` in ${address}` : ''} | SuiteMonger`, 68);
  const description = listingDescription(detail) || `View ${displayName} and book with SuiteMonger.`;
  const price = formatPrice(subListing);
  const facts = listingFacts(subListing);
  const amenities = Array.isArray(subListing?.amenities)
    ? subListing.amenities.filter((item) => item?.name)
    : [];
  const structuredData = listingStructuredData(detail, canonicalUrl, images);
  const photoBrowser = renderPhotoBrowser(images, displayName, { showPreviews: false });

  const body = `<main>
    ${renderTopGallery(images, displayName)}
    <article class="listing-shell">
      <div class="listing-main">
        <nav class="listing-breadcrumb" aria-label="Breadcrumb">
          <a href="${escapeHtml(parentPath)}">${escapeHtml(listing.property_title)}</a>
          <span aria-hidden="true">/</span>
          <span>${escapeHtml(subListing.name)}</span>
        </nav>
        <div class="eyebrow"><span>Approved suite option</span><span>${escapeHtml(listing.listing_category || 'Suite')}</span></div>
        <h1>${escapeHtml(subListing.name)}</h1>
        <p class="sublisting-parent">A suite option at <a href="${escapeHtml(parentPath)}">${escapeHtml(listing.property_title)}</a></p>
        ${address ? `<p class="address"><span aria-hidden="true">⌖</span> ${escapeHtml(address)}</p>` : ''}
        ${facts.length ? `<ul class="facts">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>` : ''}
        <section class="content-section">
          <h2>About this suite option</h2>
          <p>${escapeHtml(detail.short_description || `Explore this suite option at ${listing.property_title}.`)}</p>
        </section>
        ${amenities.length ? `<section class="content-section"><h2>Amenities</h2><ul class="amenities">${amenities.map((amenity) => `<li>${escapeHtml(amenity.icon || '✓')} ${escapeHtml(amenity.name)}</li>`).join('')}</ul></section>` : ''}
        <p class="back-to-listing"><a href="${escapeHtml(parentPath)}">&larr; View all options at ${escapeHtml(listing.property_title)}</a></p>
      </div>
      <aside class="booking-card">
        ${price ? `<p class="price"><strong>${escapeHtml(price)}</strong><span>${escapeHtml(subListing.payment_style || '')}</span></p>` : ''}
        <p>Check live availability for this suite option and complete your booking in the SuiteMonger app.</p>
        ${renderStoreLink('Open in SuiteMonger', 'primary-cta', storeUrls, path)}
        <small>Suite option reference: ${escapeHtml(subListing.id)}</small>
      </aside>
    </article>
    ${photoBrowser.dialog}
  </main>`;

  return renderDocument({
    title,
    description,
    canonicalUrl,
    image: images[0],
    structuredData,
    body,
    scripts: photoBrowser.scripts,
    storeUrls,
  });
}

function homePagePath(page) {
  return page > 1 ? `/suites?page=${page}` : '/suites';
}

function renderPagination(currentPage, totalPages) {
  if (totalPages <= 1) return '';
  const visiblePages = new Set([1, totalPages]);
  for (let page = Math.max(1, currentPage - 2); page <= Math.min(totalPages, currentPage + 2); page += 1) {
    visiblePages.add(page);
  }
  const orderedPages = [...visiblePages].sort((left, right) => left - right);
  let lastPage = 0;
  const links = orderedPages.map((page) => {
    const gap = lastPage && page - lastPage > 1 ? '<span class="pagination-gap" aria-hidden="true">…</span>' : '';
    lastPage = page;
    return `${gap}<a href="${homePagePath(page)}" ${page === currentPage ? 'aria-current="page" class="current"' : ''}>${page}</a>`;
  }).join('');

  return `<nav class="pagination" aria-label="Approved listing pages">
    <p class="pagination-status"><strong>Page ${currentPage}</strong><span>of ${totalPages}</span></p>
    <div class="pagination-controls">
      ${currentPage > 1
        ? `<a class="pagination-direction" rel="prev" href="${homePagePath(currentPage - 1)}"><span aria-hidden="true">&larr;</span> Newer</a>`
        : '<span class="pagination-direction disabled" aria-disabled="true"><span aria-hidden="true">&larr;</span> Newer</span>'}
      <div class="pagination-pages">${links}</div>
      ${currentPage < totalPages
        ? `<a class="pagination-direction" rel="next" href="${homePagePath(currentPage + 1)}">Older <span aria-hidden="true">&rarr;</span></a>`
        : '<span class="pagination-direction disabled" aria-disabled="true">Older <span aria-hidden="true">&rarr;</span></span>'}
    </div>
  </nav>`;
}

function renderHomePage(listings, publicBaseUrl, pagination = {}, storeUrls = {}) {
  const currentPage = Math.max(1, Number(pagination.page) || 1);
  const totalPages = Math.max(0, Number(pagination.totalPages) || 0);
  const total = Math.max(0, Number(pagination.total) || 0);
  const pageSize = Math.max(1, Number(pagination.limit) || listings.length || 10);
  const rangeStart = listings.length ? ((currentPage - 1) * pageSize) + 1 : 0;
  const rangeEnd = listings.length ? rangeStart + listings.length - 1 : 0;
  const canonicalUrl = absoluteUrl(publicBaseUrl, homePagePath(currentPage));
  const orderedListings = [...listings].sort((left, right) => {
    const leftDate = Date.parse(left?.approved_at || left?.created_at || 0) || 0;
    const rightDate = Date.parse(right?.approved_at || right?.created_at || 0) || 0;
    return rightDate - leftDate;
  });
  const cards = orderedListings.map((listing) => {
    const path = listingPath(listing);
    const image = listingImages(listing)[0];
    const subListingCount = Array.isArray(listing?.sub_category) ? listing.sub_category.length : 0;
    const approvedAt = listing.approved_at || listing.created_at;
    const approvedLabel = approvedAt && !Number.isNaN(Date.parse(approvedAt))
      ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(approvedAt))
      : '';
    return `<article class="listing-card">
      <a href="${escapeHtml(path)}">
        <div class="card-media">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(listing.property_title)}" loading="lazy">` : '<div class="card-placeholder"></div>'}
          ${subListingCount ? `<span class="sublisting-badge">${subListingCount} ${subListingCount === 1 ? 'suite option' : 'suite options'}</span>` : ''}
        </div>
        <div class="card-copy">
          <div class="card-meta"><span>${escapeHtml(listing.listing_category || 'Suite')}</span>${approvedLabel ? `<time datetime="${escapeHtml(approvedAt)}">${escapeHtml(approvedLabel)}</time>` : ''}</div>
          <h2>${escapeHtml(listing.property_title)}</h2>
          <p class="card-address">${escapeHtml(listingAddress(listing))}</p>
          <div class="card-footer">
            <strong>${escapeHtml(formatPrice(listing) || 'View details')}</strong>
            <span class="card-action" aria-hidden="true">View suite &rarr;</span>
          </div>
        </div>
      </a>
    </article>`;
  }).join('\n');

  const title = currentPage > 1
    ? `Approved suites – page ${currentPage} | SuiteMonger`
    : 'Approved suites and stays | SuiteMonger';
  const extraHead = [
    currentPage > 1 ? `<link rel="prev" href="${escapeHtml(absoluteUrl(publicBaseUrl, homePagePath(currentPage - 1)))}">` : '',
    currentPage < totalPages ? `<link rel="next" href="${escapeHtml(absoluteUrl(publicBaseUrl, homePagePath(currentPage + 1)))}">` : '',
  ].filter(Boolean).join('\n  ');

  return renderDocument({
    title,
    description: 'Discover approved apartments, hotels, houses and short-let stays on SuiteMonger.',
    canonicalUrl,
    extraHead,
    storeUrls,
    body: `<main class="home-shell">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Verified places to stay</p>
          <h1>Find a suite that feels right.</h1>
          <p>Browse recently approved places, then use the SuiteMonger app to check availability and book.</p>
        </div>
        ${total ? `<div class="hero-stat"><strong>${total}</strong><span>approved ${total === 1 ? 'stay' : 'stays'}</span><small>New listings appear here as soon as they are approved.</small></div>` : ''}
      </section>
      <section class="results-section" aria-labelledby="recent-listings">
        <div class="results-heading">
          <div><p class="section-kicker">Newest to oldest</p><h2 id="recent-listings">Recently approved suites</h2></div>
          <p>${rangeStart ? `Showing <strong>${rangeStart}&ndash;${rangeEnd}</strong> of <strong>${total || rangeEnd}</strong>` : 'No approved listings yet'}</p>
        </div>
        <div class="results-panel">
          <div class="results-toolbar">
            <span>Approved listings</span>
            <span>Page ${currentPage}${totalPages ? ` of ${totalPages}` : ''}</span>
          </div>
          <div class="listing-grid">${cards || '<p class="empty-results">No approved listings are available yet.</p>'}</div>
          ${renderPagination(currentPage, totalPages)}
        </div>
      </section>
    </main>`,
  });
}

function renderErrorPage(status, publicBaseUrl, storeUrls = {}) {
  const missing = status === 404;
  const title = missing ? 'Suite not found | SuiteMonger' : 'SuiteMonger is temporarily unavailable';
  const description = missing
    ? 'This suite is unavailable or is no longer approved.'
    : 'Please try loading this SuiteMonger page again shortly.';
  return renderDocument({
    title,
    description,
    canonicalUrl: absoluteUrl(publicBaseUrl, missing ? '/not-found' : '/unavailable'),
    robots: 'noindex,nofollow',
    body: `<main class="error-shell"><p class="eyebrow">${status}</p><h1>${escapeHtml(title.replace(' | SuiteMonger', ''))}</h1><p>${escapeHtml(description)}</p><a class="primary-cta" href="/suites">Browse approved suites</a></main>`,
    storeUrls,
  });
}

module.exports = {
  absoluteUrl,
  escapeHtml,
  escapeXml,
  renderErrorPage,
  renderHomePage,
  renderListingPage,
  renderSubListingPage,
};
