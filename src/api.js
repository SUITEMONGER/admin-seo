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

module.exports = { ApiError, fetchApprovedListing, fetchApprovedListings, normalizeApiBaseUrl };
