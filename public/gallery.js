(() => {
  'use strict';

  document.querySelectorAll('[data-sublisting-section]').forEach((section) => {
    const rail = section.querySelector('[data-sublisting-list]');
    const previous = section.querySelector('[data-sublisting-list-previous]');
    const next = section.querySelector('[data-sublisting-list-next]');
    if (!rail || !previous || !next) return;

    function updateControls() {
      previous.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 2;
    }

    function scroll(direction) {
      const card = rail.querySelector('.sublisting-card');
      const gap = Number.parseFloat(getComputedStyle(rail).columnGap) || 0;
      const distance = (card?.getBoundingClientRect().width || rail.clientWidth) + gap;
      rail.scrollBy({ left: distance * direction, behavior: 'smooth' });
    }

    previous.addEventListener('click', () => scroll(-1));
    next.addEventListener('click', () => scroll(1));
    rail.addEventListener('scroll', updateControls, { passive: true });
    window.addEventListener('resize', updateControls);
    updateControls();
  });

  const dataElement = document.getElementById('gallery-data');
  const dialog = document.querySelector('[data-gallery-dialog]');
  if (!dataElement || !dialog) return;

  let photos;
  try {
    photos = JSON.parse(dataElement.textContent || '[]');
  } catch {
    return;
  }
  if (!Array.isArray(photos) || photos.length === 0) return;

  const image = dialog.querySelector('[data-gallery-image]');
  const title = dialog.querySelector('[data-gallery-title]');
  const count = dialog.querySelector('[data-gallery-count]');
  const thumbnails = [...dialog.querySelectorAll('[data-gallery-thumbnail-index]')];
  let currentIndex = 0;
  let opener = null;

  function update(index) {
    currentIndex = (index + photos.length) % photos.length;
    const photo = photos[currentIndex];
    image.src = photo.src;
    image.alt = photo.alt;
    if (title) title.textContent = photo.alt;
    if (count) count.textContent = `${currentIndex + 1} of ${photos.length}`;
    thumbnails.forEach((thumbnail, thumbnailIndex) => {
      const isCurrent = thumbnailIndex === currentIndex;
      thumbnail.classList.toggle('current', isCurrent);
      thumbnail.setAttribute('aria-current', isCurrent ? 'true' : 'false');
    });
    thumbnails[currentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

    const nextPhoto = photos[(currentIndex + 1) % photos.length];
    const preload = new Image();
    preload.src = nextPhoto.src;
  }

  function openGallery(index, trigger) {
    opener = trigger;
    update(index);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('gallery-open');
  }

  function closeGallery() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    document.body.classList.remove('gallery-open');
    opener?.focus();
  }

  document.querySelectorAll('[data-gallery-index]').forEach((trigger) => {
    trigger.addEventListener('click', () => openGallery(Number(trigger.dataset.galleryIndex) || 0, trigger));
  });
  dialog.querySelector('[data-gallery-close]')?.addEventListener('click', closeGallery);
  dialog.querySelector('[data-gallery-previous]')?.addEventListener('click', () => update(currentIndex - 1));
  dialog.querySelector('[data-gallery-next]')?.addEventListener('click', () => update(currentIndex + 1));
  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener('click', () => update(Number(thumbnail.dataset.galleryThumbnailIndex) || 0));
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeGallery();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('gallery-open');
  });
  document.addEventListener('keydown', (event) => {
    if (!dialog.open) return;
    if (event.key === 'ArrowLeft') update(currentIndex - 1);
    if (event.key === 'ArrowRight') update(currentIndex + 1);
    if (event.key === 'Escape' && typeof dialog.close !== 'function') closeGallery();
  });
})();
