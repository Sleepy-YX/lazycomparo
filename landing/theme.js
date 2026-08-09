/* Shared theme switch for the landing project — index.html and the four
   trust pages (about / how-we-rank / privacy / 404).

   The FOUC-critical half is NOT here. Reading storage and stamping
   data-theme on <html> has to happen before first paint, which a deferred
   external file cannot do, so those three lines are inlined in each page's
   <head>. This file only wires the button, which can safely wait.

   Anything that has to react beyond CSS listens for the `themechange` event
   rather than being called from here — that is how the landing's three.js
   world re-themes itself without this file knowing three.js exists, and it
   is why the trust pages can share the file unchanged.

   Light paper is the default and the brand. prefers-color-scheme is
   deliberately not consulted: dark is opt-in, then remembered. */
(function () {
  'use strict';

  var KEY = 'lc-theme';
  var root = document.documentElement;
  var META = { light: '#f6f1e7', dark: '#0a0a0b' };

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function label(btn, theme) {
    // the button advertises what it will DO, not what is currently on
    var text = 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme';
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }

  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');

    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', META[theme]);

    // a failed write must not block the switch — the theme still applies for
    // this session, it just will not survive a reload
    try { localStorage.setItem(KEY, theme); } catch (e) {}

    [].forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) {
      label(b, theme);
    });

    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }

  function init() {
    [].forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) {
      label(b, current());
      b.addEventListener('click', function () {
        apply(current() === 'dark' ? 'light' : 'dark');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
