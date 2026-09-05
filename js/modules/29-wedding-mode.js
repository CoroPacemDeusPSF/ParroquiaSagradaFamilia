/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/29-wedding-mode.js
 *   @brief      Modo Bodas: activación desde el selector de modos, sello de
 *               ingreso y degradación sin sesión del director
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.8
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   29-wedding-mode.js  —  Modo Bodas (paralelo al Modo Coro)
   ============================================================================
   ACTIVACIÓN (v3.6.8)
     Ya no hay gesto secreto de 5 clics en el contador de cantos. El Modo
     Bodas se activa desde el selector de modos de la barra superior (módulo
     34), que antes de llamar aquí exige sesión iniciada y comprueba que la
     cuenta sea administradora.

     activate({ seal: true })  → sello "Modo Bodas" y luego aplica el modo.
                                 Entrada desde el modo Pública.
     activate({ seal: false }) → aplica el modo directamente. Paso desde Coro.

   MODO PRIVADO
     A diferencia del Modo Coro, Bodas es solo para el director: muestra los
     datos de los eventos contratados. Por eso la restauración tras recargar
     es condicional: se aplica de inmediato para no parpadear, pero si
     AuthGate.isAdmin() no lo confirma, el modo se DEGRADA a Pública.

   MUTUAMENTE EXCLUSIVO CON MODO CORO
     Activar wedding-mode desactiva rehearsal-mode (y viceversa, gestionado
     por el módulo 05). El modo Edición (módulo 11) es una capa que se apoya
     en cualquiera de los dos.

   PERSISTENCIA
     Igual que rehearsal-mode: localStorage 'pdMode' = 'bodas' | 'bodas+dev'.
     La clase 'dev-mode' NO se restaura aquí: la restaura el módulo 11 tras
     validar la sesión de administrador.

   ANIMACIÓN
     Overlay propio #wedding-intro (sello rosa con anillos entrelazados), con
     su lógica de fade in/out. Expuesta como window.playWeddingIntro porque el
     módulo 28 (Modo Novios) la reutiliza.

   ORDEN DE CARGA: posición 29 — después de 05-rehearsal-mode y 35-firebase-auth.
   ============================================================================ */

(function() {
  'use strict';

  // ── ESTADO INTERNO ────────────────────────────────────────────────────
  var active = false;

  // ── HELPERS DE OVERLAY DEL SELLO BODAS ────────────────────────────────
  // Misma mecánica que playModeIntro del módulo 05, pero sobre el overlay
  // #wedding-intro (que tiene su propia paleta rosa y corazones).
  function playWeddingIntro(label, onDone) {
    var overlay = document.getElementById('wedding-intro');
    if (!overlay) {
      // Fallback defensivo: si por algún motivo no existe el overlay,
      // ejecutamos onDone igual para no dejar al usuario en limbo.
      if (onDone) onDone();
      return;
    }
    var labelEl = overlay.querySelector('.wi-seal-label');
    if (labelEl) labelEl.innerHTML = label;

    overlay.classList.remove('fade-out');
    overlay.classList.add('playing');

    setTimeout(function() {
      overlay.classList.add('fade-out');
      setTimeout(function() {
        overlay.classList.remove('playing', 'fade-out');
        if (onDone) onDone();
      }, 550);
    }, 2000);
  }

  // Expuesta globalmente: el módulo 28 (Modo Novios) reutiliza este sello.
  window.playWeddingIntro = playWeddingIntro;

  // ── ACTIVAR / DESACTIVAR ──────────────────────────────────────────────
  /**
   * Activa el Modo Bodas.
   *
   * @param  {Object}  [opts]        Opciones.
   * @param  {boolean} [opts.seal]   false para entrar sin sello. Por defecto
   *                                 true (entrada desde el modo Pública).
   * @return {Promise}               Resuelve cuando el modo quedó aplicado.
   */
  function activateWedding(opts) {
    if (active) return Promise.resolve();
    opts = opts || {};
    var seal = opts.seal !== false;

    active = true;

    // ── Mutex con Modo Coro ──
    // Cerramos cualquier resto del setlist dominical, sin importar el modo
    // previo. Razón: el módulo 23 puede haber abierto el panel SL en
    // restorePinState() (si pdSetlistPinned estaba en localStorage), incluso
    // estando ya en wedding-mode persistido. La guardia CSS body.wedding-mode
    // ya oculta el panel visualmente, pero hay que limpiar el estado interno
    // del módulo SL para que no quede inconsistente:
    //   1. Forzar close() del panel.
    //   2. Forzar unpin (el pin del SL es exclusivo del Modo Coro/Edición).
    if (window.SL) {
      if (typeof window.SL.close === 'function') {
        window.SL.close();
      }
      // Si SL.isPinned() existe y devuelve true, hacer unpin.
      if (typeof window.SL.isPinned === 'function' && window.SL.isPinned() &&
          typeof window.SL.togglePin === 'function') {
        window.SL.togglePin();
      }
    }

    // Si rehearsal-mode estaba activo, además limpiar las clases del coro.
    if (document.body.classList.contains('rehearsal-mode')) {
      document.body.classList.remove('rehearsal-mode');
      document.body.classList.remove('dev-mode');
    }

    return new Promise(function(resolve) {
      function apply() {
        document.body.classList.add('wedding-mode');
        try { localStorage.setItem('pdMode', 'bodas'); } catch (e) {}
        console.log('[Bodas] Modo Bodas activado');
        resolve();
      }
      if (seal) {
        playWeddingIntro('Modo<br>Bodas', apply);
      } else {
        apply();
      }
    });
  }

  function deactivateWedding() {
    if (!active) return;
    active = false;
    document.body.classList.remove('wedding-mode');
    document.body.classList.remove('dev-mode');

    // Cerrar panel de bodas si estaba abierto (lo expone el módulo 30)
    if (window.SLB && typeof window.SLB.close === 'function') {
      window.SLB.close();
    }

    // Cerrar diálogo de confirmación si estaba abierto
    var confirmDialog = document.getElementById('wedding-confirm');
    if (confirmDialog) confirmDialog.classList.remove('open');

    try { localStorage.removeItem('pdMode'); } catch (e) {}
    console.log('[Bodas] Modo Bodas desactivado');
  }

  /**
   * Abre el diálogo de confirmación de salida. Lo llama el selector de modos
   * cuando el usuario elige la fila "Pública" estando en Modo Bodas.
   */
  function requestExit() {
    var confirmDialog = document.getElementById('wedding-confirm');
    var confirmText   = document.getElementById('wedding-confirm-text');
    if (confirmText) confirmText.textContent = '¿Salir del modo Bodas?';
    if (confirmDialog) confirmDialog.classList.add('open');
  }

  // ── RESTAURAR ESTADO TRAS PAGE LOAD ───────────────────────────────────
  // Dos fases deliberadas:
  //   1. INMEDIATA: aplicar la clase en cuanto corre este módulo (en
  //      DOMContentLoaded, como siempre). El módulo 30 registra su init en
  //      el mismo evento pero DESPUÉS, así que ya ve body.wedding-mode; de
  //      eso depende la auto-apertura del panel pineado. Sin esperar a nada.
  //   2. ASÍNCRONA: comprobar la sesión. Bodas es privado; si la cuenta no es
  //      administradora (o no hay sesión), el modo se degrada a Pública.
  function restoreWeddingMode() {
    var saved = null;
    try {
      saved = localStorage.getItem('pdMode');
    } catch (e) {
      return;
    }
    if (saved !== 'bodas' && saved !== 'bodas+dev') return;

    active = true;
    document.body.classList.add('wedding-mode');
    // La clase 'dev-mode' NO se restaura aquí: es el módulo 11 quien la
    // añade, y solo si AuthGate.isAdmin() confirma la sesión.

    function degrade() {
      deactivateWedding();
      console.log('[Bodas] Sin sesión del director: Modo Bodas no restaurado');
    }

    if (!window.AuthGate || typeof window.AuthGate.isAdmin !== 'function') {
      degrade();
      return;
    }

    window.AuthGate.isAdmin().then(function(ok) {
      if (!ok) degrade();
    }).catch(function() {
      degrade();
    });
  }

  // ── DIÁLOGO DE CONFIRMACIÓN DE SALIDA ─────────────────────────────────
  // Confirmar sale del Modo Bodas por completo (incluido Edición). El paso
  // Edición → Bodas lo hace el interruptor del selector, no este diálogo.
  function bindConfirm() {
    var confirmDialog = document.getElementById('wedding-confirm');
    var yesBtn        = document.getElementById('wedding-confirm-yes');
    var noBtn         = document.getElementById('wedding-confirm-no');

    if (yesBtn) {
      yesBtn.addEventListener('click', function() {
        if (confirmDialog) confirmDialog.classList.remove('open');
        deactivateWedding();
      });
    }
    if (noBtn) {
      noBtn.addEventListener('click', function() {
        if (confirmDialog) confirmDialog.classList.remove('open');
      });
    }
    // Click fuera del dialog también cierra
    if (confirmDialog) {
      confirmDialog.addEventListener('click', function(e) {
        if (e.target === confirmDialog) {
          confirmDialog.classList.remove('open');
        }
      });
    }
  }

  // ── INIT ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      restoreWeddingMode();
      bindConfirm();
    });
  } else {
    restoreWeddingMode();
    bindConfirm();
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────
  // La consumen el selector de modos (34) y el módulo 05 (mutex).
  window.WeddingMode = {
    activate:    activateWedding,
    deactivate:  deactivateWedding,
    requestExit: requestExit,
    isActive:    function() { return active; }
  };

})();
