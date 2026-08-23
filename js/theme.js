/* Applies a saved theme override before first paint, so a dark-locked page
   never flashes light (or vice versa). No saved value means the site follows
   the device, exactly as before this control existed. The button that cycles
   the three states lives in the header; app.js owns it. Loaded synchronously
   in <head> on every page — keep this file tiny. */
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* private mode */ }
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
})();
