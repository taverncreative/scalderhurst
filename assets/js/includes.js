/**
 * includes.js — Lightweight HTML component loader + nav toggle
 *
 * Usage: Add data-include="component-name" to any element.
 * The script fetches /components/{component-name}.html and injects it.
 */

document.addEventListener('DOMContentLoaded', function () {
  var includes = document.querySelectorAll('[data-include]');
  var loaded = 0;
  var total = includes.length;

  includes.forEach(function (el) {
    var component = el.getAttribute('data-include');
    var path = '/components/' + component + '.html';

    fetch(path)
      .then(function (response) {
        if (!response.ok) throw new Error('Component not found: ' + path);
        return response.text();
      })
      .then(function (html) {
        el.innerHTML = html;
      })
      .catch(function (err) {
        console.warn(err.message);
      })
      .finally(function () {
        loaded++;
        if (loaded === total) initNavToggle();
      });
  });

  // If no includes, still init
  if (total === 0) initNavToggle();
});

/**
 * Nav toggle — hamburger menu for mobile
 */
function initNavToggle() {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', function () {
    var isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Open menu' : 'Close menu');
    nav.classList.toggle('is-open');
  });
}
