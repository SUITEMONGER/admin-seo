'use strict';

class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function normalizeApiBaseUrl(value) {
  return String(value || 'https://api.suitemonger.com/api/v1').replace(/\/+$/, '');
}

async function request(apiBaseUrl, path) {
  let response;
  try {
    response = await fetch(`${normalizeApiBaseUrl(apiBaseUrl)}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new ApiError(`SuiteMonger API is unavailable: ${error.message}`, 503);
  }

  if (!response.ok) {
    throw new ApiError(response.status === 404 ? 'Listing not found' : 'SuiteMonger API request failed', response.status);
  }

  const payload = await response.json();
  return payload?.data;
}

async function fetchApprovedListing(apiBaseUrl, id) {
  const listing = await request(apiBaseUrl, `/listings/${encodeURIComponent(id)}`);
  if (!listing || listing.status !== 'APPROVED') throw new ApiError('Listing not found', 404);
  return listing;
}

async function fetchApprovedListings(apiBaseUrl, page = 1) {
  const data = await request(apiBaseUrl, `/listings?page=${Math.max(1, Number(page) || 1)}`);
  return normalizedListingPage(data);
}

async function searchApprovedListings(apiBaseUrl, options = {}) {
  const query = new URLSearchParams({
    page: String(Math.max(1, Number(options.page) || 1)),
    limit: String(Math.max(1, Math.min(24, Number(options.limit) || 10))),
  });
  const category = String(options.category || '').trim();
  if (category) query.set('category', category);
  const data = await request(apiBaseUrl, `/listings/guest/closest?${query}`);
  return normalizedListingPage(data);
}

async function fetchListingCategories(apiBaseUrl) {
  const data = await request(apiBaseUrl, '/listings/categories');
  return Array.isArray(data)
    ? data.filter((category) => category?.active !== false && category?.slug && category?.name)
    : [];
}

async function fetchPublicServiceProviders(apiBaseUrl, limit = 2) {
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 2));
  const data = await request(apiBaseUrl, `/vendors/services/providers?limit=${safeLimit}`);
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Math.max(0, Number(data?.total) || 0),
  };
}

function normalizedListingPage(data) {
  const currentPage = Number(data?.page) || 1;
  const totalPages = Math.max(0, Number(data?.total_pages) || 0);
  return {
    items: Array.isArray(data?.items) ? data.items.filter((listing) => listing?.status === 'APPROVED') : [],
    page: currentPage,
    limit: Math.max(1, Number(data?.limit) || 10),
    total: Math.max(0, Number(data?.total) || 0),
    totalPages,
    hasNext: typeof data?.has_next === 'boolean' ? data.has_next : currentPage < totalPages,
  };
}

module.exports = {
  ApiError,
  fetchApprovedListing,
  fetchApprovedListings,
  fetchListingCategories,
  fetchPublicServiceProviders,
  normalizeApiBaseUrl,
  searchApprovedListings,
};
