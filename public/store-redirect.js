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

  document.querySelectorAll('[data-open-app-path]').forEach((link) => {
    const fallbackUrl = link.dataset.fallbackUrl || '/';
    const storeUrl = isAndroid
      ? safeHttpUrl(link.dataset.googleStoreUrl)
      : isAppleMobile ? safeHttpUrl(link.dataset.appleStoreUrl) : '';
    if (!isAndroid && !isAppleMobile) {
      link.href = fallbackUrl;
      return;
    }

    const path = link.dataset.openAppPath;
    if (!/^\/suites\/[A-Za-z0-9_~.%/-]+$/.test(path || '')) {
      link.href = storeUrl || fallbackUrl;
      return;
    }
    const appUrl = `suitemonger://www.suitemonger.com${path}`;
    const fallbackDestination = storeUrl || path;
    link.href = appUrl;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      let fallbackTimer;
      const cancelFallback = () => {
        if (document.hidden) {
          clearTimeout(fallbackTimer);
          document.removeEventListener('visibilitychange', cancelFallback);
        }
      };
      document.addEventListener('visibilitychange', cancelFallback);
      fallbackTimer = setTimeout(() => {
        document.removeEventListener('visibilitychange', cancelFallback);
        if (!document.hidden) window.location.assign(fallbackDestination);
      }, 1400);
      window.location.href = appUrl;
    });
  });
})();
