/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/11-dev-mode.js
 *   @brief      Modo Dev: 5-clicks en cruz del footer (solo en Modo Coro)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.3.0
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   11-dev-mode.js
   ============================================================================
   Modo Dev — activación con 5 clicks en la cruz del footer

   body.dev-mode → muestra controles avanzados del editor.

   ORDEN DE CARGA: posición 11 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── DEV MODE ──
// Only activates inside Modo Coro. 5 clicks on version number (below church icon).
// Shows "Diagnosticar" and "Restaurar Original (HTML)" buttons in chord editor.
(function() {
  var CLICKS_NEEDED = 5;
  var CLICK_WINDOW  = 2000; // ms
  var clicks = 0, timer = null;

  document.addEventListener('click', function(e) {
    // Must be clicking the version number
    if (!e.target.closest('.cancionero-version')) return;

    // Dev Mode requiere estar en algún modo especial activo (Coro o Bodas).
    // No puede activarse desde modo público — esto preserva la jerarquía de
    // visibilidad: público → coro/bodas → dev.
    var inCoro   = document.body.classList.contains('rehearsal-mode');
    var inBodas  = document.body.classList.contains('wedding-mode');
    if (!inCoro && !inBodas) return;

    clicks++;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() { clicks = 0; }, CLICK_WINDOW);

    if (clicks >= CLICKS_NEEDED) {
      clicks = 0;
      // El intro se reproduce con la paleta del modo padre activo:
      //   • Modo Coro  → playModeIntro (dorado, cruz)
      //   • Modo Bodas → playWeddingIntro (rosa, anillos)
      var introFn = inBodas && window.playWeddingIntro
        ? window.playWeddingIntro
        : window.playModeIntro;

      if (introFn) {
        introFn('Modo<br>Dev', function() {
          document.body.classList.add('dev-mode');
          // Persistencia: indica el modo padre + dev para que tras reload
          // se restaure correctamente.
          var savedMode = inBodas ? 'bodas+dev' : 'coro+dev';
          try { localStorage.setItem('pdMode', savedMode); } catch(e) {}
          console.log('[Dev] Modo Dev activado sobre ' + (inBodas ? 'Bodas' : 'Coro'));
        });
      } else {
        // Fallback sin animación
        document.body.classList.add('dev-mode');
        var fbMode = inBodas ? 'bodas+dev' : 'coro+dev';
        try { localStorage.setItem('pdMode', fbMode); } catch(e) {}
        console.log('[Dev] Modo Dev activado (sin animación)');
      }
    }
  });
})();
