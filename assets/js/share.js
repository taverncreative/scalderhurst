/**
 * share.js — Share button on news posts.
 *
 * Uses the native share sheet where available (mobile, Safari), otherwise
 * copies the article URL to the clipboard and confirms on the button.
 * Dependency-free; degrades to doing nothing if neither API exists.
 */

(function () {
  'use strict';

  var RESET_MS = 2000;

  function init() {
    var buttons = document.querySelectorAll('[data-share]');
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      var defaultLabel = btn.textContent;

      function confirmCopy() {
        btn.textContent = 'Link copied';
        setTimeout(function () {
          btn.textContent = defaultLabel;
        }, RESET_MS);
      }

      btn.addEventListener('click', function () {
        var payload = {
          title: document.title,
          url: window.location.href
        };

        if (navigator.share) {
          // User cancelling the share sheet rejects with AbortError — fine.
          navigator.share(payload).catch(function () {});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(payload.url).then(confirmCopy, function () {});
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
