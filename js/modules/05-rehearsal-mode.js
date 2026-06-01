/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/05-rehearsal-mode.js
 *   @brief      Modo Coro: 5-clicks en ícono iglesia, animación de ingreso, badge
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r10
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   05-rehearsal-mode.js
   ============================================================================
   Modo Coro (rehearsal mode) — activación y animación

   5 clicks en el ícono de iglesia → animación Sello Litúrgico → body.rehearsal-mode.

   ORDEN DE CARGA: posición 5 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── REHEARSAL MODE ────────────────────────────────
(function() {
  var CLICKS_NEEDED = 5;
  var CLICK_WINDOW  = 2000; // ms
  var clicks = 0, timer = null;
  var active = false;

  // The secret trigger: 5 clicks on the ceremony cover icon
  document.addEventListener('click', function(e) {
    var icon = e.target.closest('#pd-coro-trigger');
    if (!icon) return;
    clicks++;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() { clicks = 0; }, CLICK_WINDOW);
    if (clicks >= CLICKS_NEEDED) {
      clicks = 0;
      if (!active) activateRehearsal();
    }
  });

  function activateRehearsal() {
    active = true;

    // Mutex con Modo Bodas (módulo 29): si está activo, lo desactivamos
    // primero para evitar que ambos modos especiales coexistan. El módulo
    // 29 hace lo mismo en su activateWedding(). Cierre simétrico.
    if (document.body.classList.contains('wedding-mode')) {
      document.body.classList.remove('wedding-mode');
      var weddingBadge = document.getElementById('wedding-badge');
      if (weddingBadge) weddingBadge.classList.remove('active');
      if (window.SLB && typeof window.SLB.close === 'function') {
        window.SLB.close();
      }
      if (window.WeddingMode && typeof window.WeddingMode.deactivate === 'function') {
        // Ya removimos las clases arriba; esta llamada limpia el estado
        // interno del módulo 29 (active = false, etc.).
        window.WeddingMode.deactivate();
      }
    }

    playRehearsalIntro(function() {
      document.body.classList.add('rehearsal-mode');
      var badge = document.getElementById('rehearsal-badge');
      badge.classList.add('active', 'entrance');
      badge.addEventListener('animationend', function() {
        badge.classList.remove('entrance');
      }, { once: true });
      try { localStorage.setItem('pdMode', 'coro'); } catch(e) {}
    });
  }

  // ── INTRO ANIMATION (sello) ──────
  // Generic version — acepta cualquier label HTML. Usada por Modo Coro y Modo Dev.
  window.playModeIntro = function(label, onDone) {
    var overlay = document.getElementById('rehearsal-intro');
    var labelEl = overlay.querySelector('.ri-seal-label');
    if (labelEl) labelEl.innerHTML = label;

    overlay.classList.remove('fade-out');
    overlay.classList.add('playing');

    setTimeout(function() {
      overlay.classList.add('fade-out');
      setTimeout(function() {
        overlay.classList.remove('playing', 'fade-out');
        onDone();
      }, 550);
    }, 2000);
  };

  function playRehearsalIntro(onDone) {
    window.playModeIntro('Modo<br>Coro', onDone);
  }

  function deactivateRehearsal() {
    active = false;
    document.body.classList.remove('dev-mode');
    document.body.classList.remove('rehearsal-mode');
    document.getElementById('rehearsal-badge').classList.remove('active');
    document.getElementById('rehearsal-confirm').classList.remove('open');
    // Close edge panel if open
    if (window.SL) window.SL.close();
    try { localStorage.removeItem('pdMode'); } catch(e) {}
  }

  function deactivateDevOnly() {
    document.body.classList.remove('dev-mode');
    document.getElementById('rehearsal-confirm').classList.remove('open');
    // Close edge panel if open (will reopen as Coro-only, tab stays)
    if (window.SL) window.SL.close();
    try { localStorage.setItem('pdMode', 'coro'); } catch(e) {}
  }

  // ── RESTORE MODE ON PAGE LOAD (silent, no animation) ──
  // Solo restauramos el Modo Coro aquí. La restauración del Modo Bodas la
  // hace el módulo 29-wedding-mode.js leyendo el mismo localStorage. Como
  // los modos son mutuamente excluyentes, solo uno se ejecuta a la vez.
  //
  // Valores válidos de pdMode:
  //   'coro'       → restaurar Modo Coro
  //   'coro+dev'   → restaurar Modo Coro + Dev
  //   'bodas'      → manejado por el módulo 29
  //   'bodas+dev'  → manejado por el módulo 29
  //   'dev'        → legacy, se interpreta como 'coro+dev' (para compatibilidad
  //                   con sesiones guardadas con la versión anterior).
  (function restoreMode() {
    try {
      var saved = localStorage.getItem('pdMode');
      if (!saved) return;
      // Si el modo guardado corresponde a bodas, no hacemos nada aquí.
      if (saved === 'bodas' || saved === 'bodas+dev') return;

      active = true;
      document.body.classList.add('rehearsal-mode');
      document.getElementById('rehearsal-badge').classList.add('active');
      // v3.6.7r10: la restauración de dev-mode ya NO se hace aquí (permitía
      // "guardar" sin sesión Firebase → las reglas rechazaban en silencio y la
      // UI fingía éxito). El módulo 11 restaura dev-mode tras validar la sesión
      // con AuthGate.ensureReady().
      console.log('[Mode] Restaurado: ' + saved);
    } catch(e) {}
  })();

  // Badge click → show confirm dialog (mensaje según modo activo)
  document.getElementById('rehearsal-badge').addEventListener('click', function() {
    var isDevMode = document.body.classList.contains('dev-mode');
    document.querySelector('#rehearsal-confirm p').textContent =
      isDevMode ? '¿Salir del modo Dev?' : '¿Salir del modo Coro?';
    document.getElementById('rehearsal-confirm').classList.add('open');
  });

  // Confirm yes → step down: Dev→Coro, or Coro→Normal
  document.getElementById('confirm-yes').addEventListener('click', function() {
    if (document.body.classList.contains('dev-mode')) {
      deactivateDevOnly();
    } else {
      deactivateRehearsal();
    }
  });
  document.getElementById('confirm-no').addEventListener('click', function() {
    document.getElementById('rehearsal-confirm').classList.remove('open');
  });
  // Click outside dialog box closes it
  document.getElementById('rehearsal-confirm').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
})();
