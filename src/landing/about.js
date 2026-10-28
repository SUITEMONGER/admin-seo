'use strict';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setupEntryMotion() {
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-enter]').forEach((element) => {
      const delay = reducedMotion ? 0 : Number(element.dataset.enterDelay || 0);
      window.setTimeout(() => element.classList.add('is-visible'), delay);
    });
  });

  const elements = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || reducedMotion) {
    elements.forEach((element) => element.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.13, rootMargin: '0px 0px -7% 0px' });

  elements.forEach((element) => observer.observe(element));
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
    ring.classList.toggle('is-hovering', Boolean(event.target.closest('a, button')));
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

function setupSectionNavigation() {
  const links = [...document.querySelectorAll('.about-index a')];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  if (!links.length || !sections.length || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`);
    });
  }, { rootMargin: '-22% 0px -60% 0px', threshold: [0, 0.2, 0.5] });

  sections.forEach((section) => observer.observe(section));
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

function setFooterYear() {
  const year = document.querySelector('#footer-year');
  if (year) year.textContent = String(new Date().getFullYear());
}

setupEntryMotion();
setupCursor();
setupMenu();
setupSectionNavigation();
setFooterYear();
loadStoreLinks();
