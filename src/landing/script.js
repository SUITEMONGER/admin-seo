'use strict';

const form = document.querySelector('#search');
const categorySelect = document.querySelector('#apartment-type');
const checkInInput = document.querySelector('#check-in');
const checkOutInput = document.querySelector('#check-out');
const guestsSelect = document.querySelector('#guests');
const searchMessage = document.querySelector('#search-message');
const listingRail = document.querySelector('#listing-rail');
const resultsState = document.querySelector('#results-state');
const viewAllLink = document.querySelector('#view-all');
const searchButton = form?.querySelector('.search-submit');
const serviceProviderGrid = document.querySelector('#service-provider-grid');
const serviceProviderState = document.querySelector('#service-provider-state');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let cardObserver;

function localDateValue(date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

function setupDates() {
  const today = localDateValue(new Date());
  checkInInput.min = today;
  checkOutInput.min = addDays(today, 1);
  checkInInput.addEventListener('change', () => {
    checkOutInput.min = addDays(checkInInput.value || today, 1);
    if (checkOutInput.value && checkOutInput.value < checkOutInput.min) {
      checkOutInput.value = checkOutInput.min;
    }
  });
}

function setupEntryMotion() {
  requestAnimationFrame(() => {
    document.querySelector('.hero__backdrop')?.classList.add('is-ready');
    document.querySelectorAll('[data-enter]').forEach((element) => {
      const delay = reducedMotion ? 0 : Number(element.dataset.enterDelay || 0);
      window.setTimeout(() => element.classList.add('is-visible'), delay);
    });
  });

  const reveal = (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  };

  if (!('IntersectionObserver' in window) || reducedMotion) {
    document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-visible'));
    cardObserver = { observe: (element) => element.classList.add('is-visible') };
    return;
  }

  const sectionObserver = new IntersectionObserver(reveal, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal]').forEach((element) => sectionObserver.observe(element));
  cardObserver = new IntersectionObserver(reveal, { threshold: 0.12, rootMargin: '0px 5% -5% 5%' });
}

function setupCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const dot = document.querySelector('.cursor--dot');
  const ring = document.querySelector('.cursor--ring');
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let ringX = targetX;
  let ringY = targetY;

  const draw = () => {
    ringX += (targetX - ringX) * (reducedMotion ? 1 : 0.18);
    ringY += (targetY - ringY) * (reducedMotion ? 1 : 0.18);
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
    requestAnimationFrame(draw);
  };

  window.addEventListener('pointermove', (event) => {
    targetX = event.clientX;
    targetY = event.clientY;
    dot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    dot.classList.remove('is-hidden');
    ring.classList.remove('is-hidden');
  });
  document.addEventListener('pointerover', (event) => {
    ring.classList.toggle('is-hovering', Boolean(event.target.closest('a, button, input, select, label')));
  });
  document.documentElement.addEventListener('mouseleave', () => {
    dot.classList.add('is-hidden');
    ring.classList.add('is-hidden');
  });
  draw();
}

function setupMenu() {
  const button = document.querySelector('.menu-button');
  const menu = document.querySelector('#mobile-menu');
  if (!button || !menu) return;

  const close = () => {
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open navigation');
    menu.hidden = true;
    document.body.classList.remove('menu-open');
  };

  button.addEventListener('click', () => {
    const opening = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(opening));
    button.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
    menu.hidden = !opening;
    document.body.classList.toggle('menu-open', opening);
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
}

function setupFaq() {
  const items = [...document.querySelectorAll('.faq-item')];
  items.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      items.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });
}

function setFooterYear() {
  const year = document.querySelector('#footer-year');
  if (year) year.textContent = String(new Date().getFullYear());
}

function currentFilters() {
  return {
    category: categorySelect.value,
    check_in: checkInInput.value,
    check_out: checkOutInput.value,
    guests: guestsSelect.value,
  };
}

function filterQuery(filters, includeGuests = true) {
  const query = new URLSearchParams();
  for (const key of ['category', 'check_in', 'check_out', 'guests']) {
    if (!includeGuests && key === 'guests') continue;
    const value = String(filters[key] || '').trim();
    if (value) query.set(key, value);
  }
  return query;
}

function showMessage(message = '') {
  searchMessage.textContent = message;
  searchMessage.hidden = !message;
}

function validDates(filters) {
  if (!filters.check_in && !filters.check_out) return true;
  if (!filters.check_in || !filters.check_out) {
    showMessage('Select both check-in and check-out dates to search by availability.');
    return false;
  }
  if (filters.check_out <= filters.check_in) {
    showMessage('Check-out must be after your check-in date.');
    return false;
  }
  return true;
}

async function loadCategories() {
  try {
    const response = await fetch('/landing/api/categories', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Categories are unavailable');
    const payload = await response.json();
    for (const category of payload.items || []) {
      const option = document.createElement('option');
      option.value = category.slug;
      option.textContent = category.name;
      categorySelect.append(option);
    }
  } catch {
    // The all-types option remains usable if category metadata is temporarily unavailable.
  }
}

function currencyLabel(value, currency) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return 'View price';
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency || 'NGN',
      maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return `${currency || 'NGN'} ${Number(value).toLocaleString('en-NG')}`;
  }
}

function listingFacts(listing) {
  const facts = [];
  if (listing.rooms) facts.push(`${listing.rooms} ${listing.rooms === 1 ? 'room' : 'rooms'}`);
  if (listing.bedrooms) facts.push(`${listing.bedrooms} ${listing.bedrooms === 1 ? 'bedroom' : 'bedrooms'}`);
  if (listing.amenities?.[0]) facts.push(listing.amenities[0]);
  return facts.join(' · ') || 'Approved SuiteMonger stay';
}

function listingHref(path, filters) {
  const query = filterQuery(filters);
  return `${path}${query.size ? `?${query}` : ''}`;
}

function createListingCard(listing, filters, index) {
  const article = document.createElement('article');
  article.className = 'listing-card';
  article.style.transitionDelay = reducedMotion ? '0ms' : `${Math.min(index * 85, 425)}ms`;

  const link = document.createElement('a');
  link.className = 'listing-card__link';
  link.href = listingHref(listing.path, filters);
  link.setAttribute('aria-label', `View ${listing.title}`);

  const media = document.createElement('div');
  media.className = 'listing-card__media';
  if (listing.image) {
    const image = document.createElement('img');
    image.src = listing.image;
    image.alt = listing.title;
    image.loading = index < 2 ? 'eager' : 'lazy';
    media.append(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'listing-card__placeholder';
    media.append(placeholder);
  }

  const tag = document.createElement('span');
  tag.className = 'listing-card__tag';
  tag.textContent = listing.category || 'Approved stay';
  const heart = document.createElement('span');
  heart.className = 'listing-card__heart';
  heart.setAttribute('aria-hidden', 'true');
  heart.textContent = '♡';
  media.append(tag, heart);

  const copy = document.createElement('div');
  copy.className = 'listing-card__copy';
  const titleRow = document.createElement('div');
  titleRow.className = 'listing-card__title-row';
  const title = document.createElement('h3');
  title.textContent = listing.title;
  const rating = document.createElement('span');
  rating.className = 'listing-card__rating';
  const star = document.createElement('b');
  star.textContent = '☆';
  rating.append(star, document.createTextNode(listing.rating > 0 ? listing.rating.toFixed(1) : 'New'));
  titleRow.append(title, rating);

  const address = document.createElement('p');
  address.className = 'listing-card__address';
  address.textContent = listing.address || 'Location available in listing';
  const facts = document.createElement('p');
  facts.className = 'listing-card__facts';
  facts.textContent = listingFacts(listing);
  const price = document.createElement('p');
  price.className = 'listing-card__price';
  const period = listing.price ? `/${String(listing.paymentStyle || 'night').replace(/^per\s+/i, '')}` : '';
  if (listing.discountedPrice > 0 && listing.discountedPrice < listing.price) {
    const originalPrice = document.createElement('del');
    originalPrice.textContent = currencyLabel(listing.price, listing.currency);
    const discountRow = document.createElement('span');
    discountRow.className = 'listing-card__discount-row';
    const priceStrong = document.createElement('strong');
    priceStrong.textContent = currencyLabel(listing.discountedPrice, listing.currency);
    const percentage = document.createElement('span');
    percentage.className = 'listing-card__discount-percentage';
    percentage.textContent = `${listing.discountPercentage}% off`;
    discountRow.append(priceStrong, percentage);
    price.append(originalPrice, discountRow, document.createTextNode(period));
  } else {
    const priceStrong = document.createElement('strong');
    priceStrong.textContent = currencyLabel(listing.price, listing.currency);
    price.append(priceStrong, document.createTextNode(period));
  }
  copy.append(titleRow, address, facts, price);
  link.append(media, copy);
  article.append(link);
  return article;
}

function createServiceProviderCard(provider, index) {
  const article = document.createElement('article');
  article.className = 'service-provider-card';
  article.style.transitionDelay = reducedMotion ? '0ms' : `${index * 110}ms`;

  const media = document.createElement('div');
  media.className = 'service-provider-card__media';
  if (provider.image) {
    const image = document.createElement('img');
    image.src = provider.image;
    image.alt = `${provider.name}, ${provider.profession}`;
    image.loading = 'lazy';
    media.append(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'service-provider-card__placeholder';
    media.append(placeholder);
  }

  const tag = document.createElement('span');
  tag.className = 'service-provider-card__tag';
  tag.textContent = provider.profession;
  media.append(tag);

  const copy = document.createElement('div');
  copy.className = 'service-provider-card__copy';
  const heading = document.createElement('div');
  heading.className = 'service-provider-card__heading';
  const title = document.createElement('h3');
  title.textContent = provider.name;
  const status = document.createElement('span');
  status.className = 'service-provider-card__status';
  status.textContent = 'Active';
  heading.append(title, status);

  const address = document.createElement('p');
  address.className = 'service-provider-card__address';
  address.textContent = provider.distanceLabel || provider.address || 'Service area available in app';
  const details = document.createElement('p');
  details.className = 'service-provider-card__details';
  details.textContent = provider.availableAnywhere
    ? 'Available around your confirmed stay'
    : 'Availability confirmed when you send a request';
  const price = document.createElement('p');
  price.className = 'service-provider-card__price';
  price.append(document.createTextNode(provider.price ? 'From ' : ''), document.createElement('strong'));
  price.querySelector('strong').textContent = provider.price
    ? currencyLabel(provider.price, provider.currency)
    : 'Price confirmed before request';
  if (provider.price && provider.chargeType) {
    price.append(document.createTextNode(` / ${String(provider.chargeType).replaceAll('_', ' ').toLowerCase()}`));
  }

  copy.append(heading, address, details, price);
  article.append(media, copy);
  return article;
}

async function loadServiceProviders() {
  if (!serviceProviderGrid || !serviceProviderState) return;
  try {
    const response = await fetch('/landing/api/services', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Providers are unavailable');
    const payload = await response.json();
    const providers = Array.isArray(payload.items) ? payload.items.slice(0, 2) : [];
    if (!providers.length) {
      serviceProviderState.textContent = 'Active service providers will appear here as they become available.';
      return;
    }
    serviceProviderState.textContent = '';
    const fragment = document.createDocumentFragment();
    providers.forEach((provider, index) => fragment.append(createServiceProviderCard(provider, index)));
    serviceProviderGrid.append(fragment);
    serviceProviderGrid.querySelectorAll('.service-provider-card').forEach((card) => cardObserver.observe(card));
  } catch {
    serviceProviderState.textContent = 'Service providers could not be loaded right now. Please check again shortly.';
  }
}

async function loadStoreLinks() {
  try {
    const response = await fetch('/landing/api/config', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const config = await response.json();
    document.querySelectorAll('[data-store-link]').forEach((link) => {
      const url = link.dataset.storeLink === 'apple'
        ? config.appleStoreUrl
        : config.googlePlayStoreUrl;
      if (url) link.href = url;
    });
  } catch {
    // Store links retain their safe public fallbacks.
  }
}

function updateViewAll(filters) {
  const query = filterQuery(filters);
  viewAllLink.href = `/suites${query.size ? `?${query}` : ''}`;
}

async function loadListings(filters, { scroll = false } = {}) {
  updateViewAll(filters);
  listingRail.replaceChildren();
  resultsState.textContent = 'Finding approved apartments…';
  searchButton.disabled = true;
  searchButton.querySelector('span').textContent = 'Searching';

  try {
    const query = filterQuery(filters);
    const response = await fetch(`/landing/api/listings?${query}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Search is temporarily unavailable');
    const payload = await response.json();
    const listings = Array.isArray(payload.items) ? payload.items.slice(0, 6) : [];

    if (!listings.length) {
      resultsState.textContent = 'No approved apartments match this search yet. Try another apartment type.';
    } else {
      resultsState.textContent = '';
      const fragment = document.createDocumentFragment();
      listings.forEach((listing, index) => fragment.append(createListingCard(listing, filters, index)));
      listingRail.append(fragment);
      listingRail.querySelectorAll('.listing-card').forEach((card) => cardObserver.observe(card));
    }
  } catch {
    resultsState.textContent = 'Apartments could not be loaded right now. You can still browse all approved stays.';
  } finally {
    searchButton.disabled = false;
    searchButton.querySelector('span').textContent = 'Search';
  }

  if (scroll) {
    document.querySelector('#stays').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

function setupRailControls() {
  const scrollRail = (direction) => {
    listingRail.scrollBy({ left: listingRail.clientWidth * 0.82 * direction, behavior: reducedMotion ? 'auto' : 'smooth' });
  };
  document.querySelector('#rail-previous').addEventListener('click', () => scrollRail(-1));
  document.querySelector('#rail-next').addEventListener('click', () => scrollRail(1));
}

async function initializeSearch() {
  setupDates();
  await loadCategories();

  const initial = new URLSearchParams(window.location.search);
  if ([...categorySelect.options].some((option) => option.value === initial.get('category'))) {
    categorySelect.value = initial.get('category');
  }
  if (initial.get('check_in')) checkInInput.value = initial.get('check_in');
  if (initial.get('check_out')) checkOutInput.value = initial.get('check_out');
  if ([...guestsSelect.options].some((option) => option.value === initial.get('guests'))) {
    guestsSelect.value = initial.get('guests');
  }

  await loadListings(currentFilters());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage();
    const filters = currentFilters();
    if (!validDates(filters)) return;
    await loadListings(filters, { scroll: true });
  });
}

setupEntryMotion();
setupCursor();
setupMenu();
setupFaq();
setFooterYear();
setupRailControls();
initializeSearch();
loadServiceProviders();
loadStoreLinks();
