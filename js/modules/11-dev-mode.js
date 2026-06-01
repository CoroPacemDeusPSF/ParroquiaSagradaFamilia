/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/11-dev-mode.js
 *   @brief      Modo Dev: 5-clicks en cruz del footer (solo en Modo Coro)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r10
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

      /* v3.6.7: Antes de activar Modo Dev, exigir autenticación con
         Google. Solo el usuario cuyo UID está en las reglas Firebase
         puede escribir overrides — pero pedir auth aquí ANTES da feedback
         inmediato al usuario en lugar de fallar silenciosamente al
         intentar guardar. Si la sesión ya está activa, AuthGate.requireAuth
         resuelve inmediatamente sin pedir nada (el SDK Firebase persiste
         la sesión en indexedDB). */
      var requireAuth = (window.AuthGate && typeof window.AuthGate.requireAuth === 'function')
        ? window.AuthGate.requireAuth
        : function (cb) { return Promise.resolve(cb && cb()); }; // fallback

      requireAuth(function () {
        // Auth OK (o sesión ya activa): proceder con la activación
        activateDevMode(inBodas);
      }, {
        message: 'Modo Desarrollador requiere iniciar sesión con tu cuenta autorizada.'
      }).catch(function (err) {
        // Login cancelado: no activar
        console.log('[Dev] Activación cancelada:', err.message);
      });
    }
  });

  /**
   * v3.6.7: Lógica de activación extraída en función para llamarla
   * solo después de que AuthGate.requireAuth resuelva. El intro animado y el
   * cambio de clase del body solo ocurren si el usuario está autenticado.
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

  /* ──────────────────────────────────────────────────────────────────────
     RESTAURACIÓN DE MODO DEV AL CARGAR (v3.6.7r10)
     ──────────────────────────────────────────────────────────────────────
     Antes, el módulo 05 restauraba dev-mode desde localStorage SIN validar la
     sesión Firebase: la UI mostraba botones de edición sin token, las
     escrituras salían sin auth, las reglas las rechazaban y la app fingía
     "guardado" (datos que desaparecían al recargar).

     Ahora pasa por el gate de auth: solo se agrega dev-mode si
     AuthGate.ensureReady() confirma sesión válida. Si no, se degrada el modo a
     su padre (coro/bodas) y NO aparecen botones de edición. Este módulo carga
     DESPUÉS del 35, así que AuthGate ya existe.
     ────────────────────────────────────────────────────────────────────── */
  (function restoreDevMode() {
    var saved;
    try { saved = localStorage.getItem('pdMode'); } catch (e) { return; }
    if (saved !== 'coro+dev' && saved !== 'dev' && saved !== 'bodas+dev') return;

    function downgradeStoredMode() {
      try {
        localStorage.setItem('pdMode', saved === 'bodas+dev' ? 'bodas' : 'coro');
      } catch (e) {}
    }

    if (!window.AuthGate || typeof window.AuthGate.ensureReady !== 'function') {
      document.body.classList.remove('dev-mode');
      downgradeStoredMode();
      return;
    }

    window.AuthGate.ensureReady().then(function (user) {
      if (user) {
        document.body.classList.add('dev-mode');
      } else {
        document.body.classList.remove('dev-mode');
        downgradeStoredMode();
      }
    }).catch(function () {
      document.body.classList.remove('dev-mode');
      downgradeStoredMode();
    });
  })();
})();
