/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/05-rehearsal-mode.js
 *   @brief      Modo Coro: 5-clicks en ícono iglesia, animación de ingreso, badge
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.40r2
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
  (function restoreMode() {
    try {
      var saved = localStorage.getItem('pdMode');
      if (!saved) return;
      active = true;
      document.body.classList.add('rehearsal-mode');
      document.getElementById('rehearsal-badge').classList.add('active');
      if (saved === 'dev') {
        document.body.classList.add('dev-mode');
      }
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
