/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/11-dev-mode.js
 *   @brief      Modo Dev: 5-clicks en cruz del footer (solo en Modo Coro)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.6r7
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

      /* v3.6.6r7: Antes de activar Modo Dev, exigir PIN de 6 dígitos.
         Si la sesión ya está desbloqueada (sessionStorage), DevPin.verify
         resuelve inmediatamente sin pedir nada. Si Firebase no tiene PIN
         configurado, DevPin.verify muestra mensaje pidiendo configurarlo
         con __setDevPin('XXXXXX') en consola y rechaza la promesa. */
      var verifyFn = (window.DevPin && typeof window.DevPin.verify === 'function')
        ? window.DevPin.verify
        : function () { return Promise.resolve(); }; // fallback si módulo 34 falla

      verifyFn().then(function () {
        // PIN OK (o sesión ya desbloqueada): proceder con la activación
        activateDevMode(inBodas);
      }).catch(function (err) {
        // PIN cancelado o no configurado: no activar
        console.log('[Dev] Activación cancelada:', err.message);
      });
    }
  });

  /**
   * v3.6.6r7: Lógica de activación extraída en función para llamarla
   * solo después de que DevPin.verify resuelva. El intro animado y el
   * cambio de clase del body solo ocurren si el PIN fue correcto.
   */
  function activateDevMode(inBodas) {
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
})();
