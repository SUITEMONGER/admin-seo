'use strict';

const MAX_SLUG_LENGTH = 120;

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

function listingAddress(listing) {
  const fullAddress = String(listing?.full_address ?? '').trim();
  if (fullAddress) return fullAddress;
  const locations = Array.isArray(listing?.location) ? listing.location : [];
  return String(locations.find((item) => item?.address)?.address ?? '').trim();
}

function listingCategory(listing) {
  return slugify(listing?.listing_category || listing?.main_category || 'stay') || 'stay';
}

function listingPath(listing) {
  const id = String(listing?.id ?? '').trim();
  if (!id) throw new Error('listing id is required');

  const title = String(listing?.property_title ?? 'suite').trim();
  const address = listingAddress(listing);
  const descriptiveSlug = slugify([title, address].filter(Boolean).join(' ')) || 'suite';
  return `/suites/${listingCategory(listing)}/${descriptiveSlug}--${encodeURIComponent(id)}`;
}

function subListingPath(listing, subListing) {
  const id = String(subListing?.id ?? '').trim();
  if (!id) throw new Error('sublisting id is required');

  const name = slugify(subListing?.name || 'suite-option') || 'suite-option';
  return `${listingPath(listing)}/options/${name}--${encodeURIComponent(id)}`;
}

function routeIdentifier(value) {
  const decoded = decodeURIComponent(String(value ?? ''));
  const delimiter = decoded.lastIndexOf('--');
  const id = delimiter >= 0 ? decoded.slice(delimiter + 2) : decoded;
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

function extractListingId(pathname) {
  const parts = String(pathname ?? '').split('/').filter(Boolean);
  if (parts[0] !== 'suites') return '';
  if (parts.length === 2 || parts.length === 3) return routeIdentifier(parts.at(-1));
  if (parts.length === 4 && parts[2] === 'options') return routeIdentifier(parts[1]);
  if (parts.length === 5 && parts[3] === 'options') return routeIdentifier(parts[2]);
  return '';
}

function extractSubListingId(pathname) {
  const parts = String(pathname ?? '').split('/').filter(Boolean);
  if (parts[0] !== 'suites') return '';
  if (parts.length === 4 && parts[2] === 'options') return routeIdentifier(parts[3]);
  if (parts.length === 5 && parts[3] === 'options') return routeIdentifier(parts[4]);
  return '';
}

function mediaImages(item) {
  return [...new Set([
    item?.cover_image?.url,
    ...(Array.isArray(item?.images) ? item.images.map((image) => image?.url) : []),
  ]
    .map((url) => String(url ?? '').trim())
    .filter((url) => /^https?:\/\//i.test(url)))];
}

function listingImages(listing) {
  return [...new Set([
    ...mediaImages(listing),
    ...(Array.isArray(listing?.sub_category)
      ? listing.sub_category.flatMap(mediaImages)
      : []),
  ])];
}

function listingPrice(listing) {
  const prices = [
    Number(listing?.price),
    ...(Array.isArray(listing?.sub_category)
      ? listing.sub_category.map((category) => Number(category?.price))
      : []),
  ].filter((price) => Number.isFinite(price) && price > 0);

  return prices.length ? Math.min(...prices) : 0;
}

function listingCurrency(listing) {
  const subCategory = Array.isArray(listing?.sub_category)
    ? listing.sub_category.find((item) => item?.currency)
    : undefined;
  return String(listing?.currency || subCategory?.currency || 'NGN').trim().toUpperCase();
}

module.exports = {
  extractListingId,
  extractSubListingId,
  listingAddress,
  listingCategory,
  listingCurrency,
  listingImages,
  listingPath,
  listingPrice,
  mediaImages,
  slugify,
  subListingPath,
};
