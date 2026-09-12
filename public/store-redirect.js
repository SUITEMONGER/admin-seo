(() => {
  'use strict';

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    } catch {
      return '';
    }
  }

  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  document.querySelectorAll('[data-store-redirect]').forEach((link) => {
    const fallbackUrl = link.dataset.fallbackUrl || '/';
    const androidUrl = safeHttpUrl(link.dataset.googleStoreUrl);
    const appleUrl = safeHttpUrl(link.dataset.appleStoreUrl);

    if (isAndroid && androidUrl) link.href = androidUrl;
    else if (isAppleMobile && appleUrl) link.href = appleUrl;
    else link.href = fallbackUrl;
  });
})();
