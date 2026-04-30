/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/11-dev-mode.js
 *   @brief      Modo Dev: 5-clicks en cruz del footer (solo en Modo Coro)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r3
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
    // Must be inside Modo Coro
    if (!document.body.classList.contains('rehearsal-mode')) return;

    clicks++;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() { clicks = 0; }, CLICK_WINDOW);

    if (clicks >= CLICKS_NEEDED) {
      clicks = 0;
      // Play the same sello animation but with "Modo Dev" label
      if (window.playModeIntro) {
        window.playModeIntro('Modo<br>Dev', function() {
          document.body.classList.add('dev-mode');
          try { localStorage.setItem('pdMode', 'dev'); } catch(e) {}
          console.log('[Dev] Modo Dev activado');
        });
      } else {
        // Fallback if animation not available
        document.body.classList.add('dev-mode');
        try { localStorage.setItem('pdMode', 'dev'); } catch(e) {}
        console.log('[Dev] Modo Dev activado (sin animación)');
      }
    }
  });
})();
