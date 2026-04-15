/*
 * share.js — native Web Share API button.
 *
 * Progressive enhancement:
 *   - Modern browsers: opens native share sheet via navigator.share().
 *   - Older browsers: copies the URL to clipboard and shows "Link copied".
 *   - No JS: the <button> is visible but inert — no error.
 *
 * No third-party scripts, no trackers. ~400 bytes.
 */
(function () {
  'use strict';

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-share]');
    if (!btn) return;

    e.preventDefault();

    var shareData = {
      title: document.title,
      url: window.location.href,
    };

    // Prefer native share sheet
    if (navigator.share) {
      navigator.share(shareData).catch(function () {
        // User cancelled — no action
      });
      return;
    }

    // Fallback — copy URL to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareData.url).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Link copied';
        setTimeout(function () {
          btn.textContent = original;
        }, 2000);
      });
    }
  });
})();
