/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/07-font-size-control.js
 *   @brief      Controles A− / A+ para ajustar tamaño de letra del cancionero
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r6
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   07-font-size-control.js
   ============================================================================
   Control de tamaño de fuente

   Botones +/- para ajustar el font-size global del cancionero.

   ORDEN DE CARGA: posición 7 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── FONT SIZE CONTROL ─────────────────────────────
(function() {
  var STEP = 0.05;  // rem
  var MIN  = 0.7;
  var MAX  = 1.6;
  var current = 1.02; // matches .strophe p / .chorus p default

  var targets = '.strophe p, .chorus p, .song-note, .chords-block pre';

  function applySize() {
    document.querySelectorAll(targets).forEach(function(el) {
      el.style.fontSize = current + 'rem';
    });
  }

  document.getElementById('font-increase').addEventListener('click', function() {
    if (current < MAX) { current = Math.round((current + STEP) * 100) / 100; applySize(); }
  });

  document.getElementById('font-decrease').addEventListener('click', function() {
    if (current > MIN) { current = Math.round((current - STEP) * 100) / 100; applySize(); }
  });
})();
