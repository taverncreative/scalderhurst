/**
 * main.js — Scroll-triggered reveal animations via IntersectionObserver
 */

(function () {
  'use strict';

  // Elements that should animate when scrolled into view
  var selectors = [
    'main > section > h2',
    '.card-grid article',
    'section[aria-labelledby="why-heading"] > article',
    'section[aria-labelledby="process-heading"] li',
    '.trust-bar li',
    'section[aria-labelledby="cta-heading"] h2',
    'section[aria-labelledby="cta-heading"] p',
    'section[aria-labelledby="cta-heading"] .btn-primary',
    '.section-image'
  ];

  function initReveal() {
    var elements = document.querySelectorAll(selectors.join(', '));

    if (!elements.length || !('IntersectionObserver' in window)) return;

    // Mark all as hidden
    elements.forEach(function (el) {
      el.classList.add('reveal');
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    elements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // Init after a short delay to ensure includes have loaded
  if (document.readyState === 'complete') {
    setTimeout(initReveal, 100);
  } else {
    window.addEventListener('load', function () {
      setTimeout(initReveal, 100);
    });
  }
})();
