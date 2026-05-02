/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/29-wedding-mode.js
 *   @brief      Modo Bodas: activación con 5 clicks invisibles en el contador de cantos
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.3.0
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   29-wedding-mode.js  —  Modo Bodas (paralelo al Modo Coro)
   ============================================================================
   ACTIVACIÓN
     5 clicks en el contador de cantos (.index-song-counter .counter-number).
     Sin feedback visual al click — el contador NO debe parecer interactivo.
     Tras el 5to click se reproduce el "Sello Bodas" (animación de entrada con
     corazones y paleta rosa perlado) y body recibe la clase 'wedding-mode'.

   MUTUAMENTE EXCLUSIVO CON MODO CORO
     Activar wedding-mode desactiva rehearsal-mode (y viceversa, gestionado por
     el módulo 05). El módulo 11-dev-mode permite ahora activar Dev desde
     CUALQUIERA de los dos modos especiales — el setlist a debuggear se infiere
     del modo padre activo.

   PERSISTENCIA
     Igual que rehearsal-mode: localStorage 'pdMode' = 'bodas' | 'bodas+dev'.
     Recuperación en page reload manejada igual que el módulo 05.

   ANIMACIÓN COMPARTIDA
     Reusa window.playModeIntro() que expone el módulo 05. Solo cambia el
     overlay activado: en lugar de #rehearsal-intro (sello dorado con cruz),
     activamos #wedding-intro (sello rosa con anillos entrelazados). El módulo
     05 no toca nuestro overlay; tenemos lógica propia de fade in/out.

   ORDEN DE CARGA: posición 29 — después de 05-rehearsal-mode (depende de
   playModeIntro y del flujo de pdMode en localStorage).
   ============================================================================ */

(function() {
  'use strict';

  // ── CONSTANTES DE ACTIVACIÓN ──────────────────────────────────────────
  var CLICKS_NEEDED = 5;
  var CLICK_WINDOW  = 2000; // ms — ventana para acumular clicks consecutivos

  // ── ESTADO INTERNO ────────────────────────────────────────────────────
  var clicks = 0;
  var clickTimer = null;
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

  // Expuesta globalmente para que el módulo 11-dev-mode pueda usarla cuando
  // el dev se activa estando en wedding-mode (mantiene paleta consistente).
  window.playWeddingIntro = playWeddingIntro;

  // ── ACTIVAR / DESACTIVAR ──────────────────────────────────────────────
  function activateWedding() {
    if (active) return;
    active = true;

    // Mutex con Modo Coro: si está activo, lo desactivamos primero.
    // Esto cierra el panel de setlist dominical y limpia rehearsal-mode.
    if (document.body.classList.contains('rehearsal-mode')) {
      document.body.classList.remove('rehearsal-mode');
      document.body.classList.remove('dev-mode');
      // Cerrar panel dominical si estaba abierto
      if (window.SL && typeof window.SL.close === 'function') {
        window.SL.close();
      }
      // Ocultar el badge del Modo Coro
      var coroBadge = document.getElementById('rehearsal-badge');
      if (coroBadge) coroBadge.classList.remove('active');
    }

    playWeddingIntro('Modo<br>Bodas', function() {
      document.body.classList.add('wedding-mode');
      // Mostrar badge bodas (si existe el elemento)
      var weddingBadge = document.getElementById('wedding-badge');
      if (weddingBadge) {
        weddingBadge.classList.add('active', 'entrance');
        // Quitar la clase entrance al final de la animación
        setTimeout(function() {
          weddingBadge.classList.remove('entrance');
        }, 800);
      }
      try { localStorage.setItem('pdMode', 'bodas'); } catch (e) {}
      console.log('[Bodas] Modo Bodas activado');
    });
  }

  function deactivateWedding() {
    if (!active) return;
    active = false;
    document.body.classList.remove('wedding-mode');
    document.body.classList.remove('dev-mode');

    var weddingBadge = document.getElementById('wedding-badge');
    if (weddingBadge) weddingBadge.classList.remove('active');

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

  // Step-down desde Dev Bodas → Bodas (mantiene wedding-mode, quita dev-mode).
  // Espejo de deactivateDevOnly del módulo 05 para coherencia de UX.
  function deactivateDevOnly() {
    document.body.classList.remove('dev-mode');
    var confirmDialog = document.getElementById('wedding-confirm');
    if (confirmDialog) confirmDialog.classList.remove('open');
    if (window.SLB && typeof window.SLB.close === 'function') {
      window.SLB.close();
    }
    try { localStorage.setItem('pdMode', 'bodas'); } catch (e) {}
    console.log('[Bodas] Modo Dev desactivado, vuelta a Bodas');
  }

  // ── RESTAURAR ESTADO TRAS PAGE LOAD ───────────────────────────────────
  // Si el usuario tenía 'pdMode' = 'bodas' guardado, restauramos el modo
  // sin animación (igual que el módulo 05 hace para 'coro').
  function restoreWeddingMode() {
    try {
      var saved = localStorage.getItem('pdMode');
      if (saved === 'bodas' || saved === 'bodas+dev') {
        active = true;
        document.body.classList.add('wedding-mode');
        var weddingBadge = document.getElementById('wedding-badge');
        if (weddingBadge) weddingBadge.classList.add('active');
        if (saved === 'bodas+dev') {
          document.body.classList.add('dev-mode');
        }
      }
    } catch (e) {}
  }

  // ── LISTENER: 5 CLICKS EN EL CONTADOR ─────────────────────────────────
  // El contador es .index-song-counter — está dentro de #dominical-index.
  // El número en sí está en .counter-number, pero tomamos el contenedor
  // entero como objetivo del click para mejor UX (más área tap-able).
  // CRÍTICO: NO debe haber feedback visual ni cursor:pointer; el comando
  // debe parecer "invisible" para que solo Renzo (o quien sepa) lo conozca.
  function handleCounterClick(e) {
    // Permitir solo si NO estamos ya en wedding-mode (evita re-activar).
    if (document.body.classList.contains('wedding-mode')) return;

    clicks++;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(function() { clicks = 0; }, CLICK_WINDOW);

    if (clicks >= CLICKS_NEEDED) {
      clicks = 0;
      activateWedding();
    }
  }

  // Delegación: el contador se renderiza en runtime por buildIndex (módulo 15),
  // así que escuchamos en document y filtramos por el contenedor.
  document.addEventListener('click', function(e) {
    var counter = e.target.closest('.index-song-counter');
    if (counter) handleCounterClick(e);
  });

  // ── BADGE BODAS: TAP PARA SALIR ───────────────────────────────────────
  // Mismo flujo que Modo Coro: tap en badge abre dialog "¿Salir del modo
  // Bodas?". Confirmar = deactivateWedding. Cancelar = cerrar dialog.
  function bindBadgeAndConfirm() {
    var badge         = document.getElementById('wedding-badge');
    var confirmDialog = document.getElementById('wedding-confirm');
    var confirmText   = document.getElementById('wedding-confirm-text');
    var yesBtn        = document.getElementById('wedding-confirm-yes');
    var noBtn         = document.getElementById('wedding-confirm-no');

    if (badge && confirmDialog) {
      badge.addEventListener('click', function() {
        // El texto del dialog cambia según el sub-modo activo.
        // Coherencia con el comportamiento del módulo 05 (dominical).
        var isDev = document.body.classList.contains('dev-mode');
        if (confirmText) {
          confirmText.textContent = isDev
            ? '¿Salir del modo Dev?'
            : '¿Salir del modo Bodas?';
        }
        confirmDialog.classList.add('open');
      });
    }
    if (yesBtn) {
      yesBtn.addEventListener('click', function() {
        if (confirmDialog) confirmDialog.classList.remove('open');
        // Step-down: Dev Bodas → Bodas. Bodas → Normal.
        if (document.body.classList.contains('dev-mode')) {
          deactivateDevOnly();
        } else {
          deactivateWedding();
        }
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
      bindBadgeAndConfirm();
    });
  } else {
    restoreWeddingMode();
    bindBadgeAndConfirm();
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────
  // Expuesta para que otros módulos (ej. 11-dev-mode) puedan consultar/
  // controlar el estado del modo bodas.
  window.WeddingMode = {
    activate:   activateWedding,
    deactivate: deactivateWedding,
    isActive:   function() { return active; }
  };

})();
