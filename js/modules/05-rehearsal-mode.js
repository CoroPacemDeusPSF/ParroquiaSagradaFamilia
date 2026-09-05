/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/05-rehearsal-mode.js
 *   @brief      Modo Coro: activación desde el selector de modos, sello de
 *               ingreso y diálogo de salida
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.8
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   05-rehearsal-mode.js
   ============================================================================
   Modo Coro (rehearsal mode) — activación, animación y salida

   ACTIVACIÓN (v3.6.8)
     Ya no hay gesto secreto de 5 clics en el ícono de iglesia. El Modo Coro
     se activa desde el selector de modos de la barra superior (módulo 34),
     que llama a RehearsalMode.activate().

     activate({ seal: true })  → reproduce el sello litúrgico y luego aplica
                                 el modo. Se usa al venir del modo Pública.
     activate({ seal: false }) → aplica el modo directamente, sin sello. Se
                                 usa al pasar de Bodas a Coro (no venimos de
                                 Pública, el sello sobraría).

   SALIDA
     requestExit() abre el diálogo #rehearsal-confirm. Confirmar sale del modo
     completo, incluido Edición: el paso Edición → Coro lo gestiona el módulo
     11 con su propio interruptor, no este diálogo.

   MUTEX CON MODO BODAS
     Los dos modos especiales son excluyentes. activate() desactiva Bodas si
     estaba activo; el módulo 29 hace lo simétrico.

   PERSISTENCIA
     localStorage 'pdMode' = 'coro' | 'coro+dev'. La restauración de esta
     clase es SÍNCRONA al parsear: evita el parpadeo de arranque y garantiza
     que el módulo 23 vea body.rehearsal-mode en su init (de eso depende la
     auto-apertura del panel pineado del SetList). La restauración de
     'dev-mode', que sí depende de la sesión, la hace el módulo 11.

   ORDEN DE CARGA: posición 5. Define window.playModeIntro, que consumen los
   módulos 28 y 29, y window.RehearsalMode, que consume el selector (34).
   ============================================================================ */

// ── REHEARSAL MODE ────────────────────────────────
(function() {
  var active = false;

  /**
   * Activa el Modo Coro.
   *
   * @param  {Object}  [opts]        Opciones.
   * @param  {boolean} [opts.seal]   false para entrar sin sello. Por defecto
   *                                 true (entrada desde el modo Pública).
   * @return {Promise}               Resuelve cuando el modo quedó aplicado.
   */
  function activateRehearsal(opts) {
    opts = opts || {};
    var seal = opts.seal !== false;

    // Mutex con Modo Bodas (módulo 29): si está activo, lo desactivamos
    // primero para evitar que ambos modos especiales coexistan. El módulo
    // 29 hace lo mismo en su activateWedding(). Cierre simétrico.
    if (document.body.classList.contains('wedding-mode')) {
      document.body.classList.remove('wedding-mode');
      if (window.SLB && typeof window.SLB.close === 'function') {
        window.SLB.close();
      }
      if (window.WeddingMode && typeof window.WeddingMode.deactivate === 'function') {
        // Ya removimos las clases arriba; esta llamada limpia el estado
        // interno del módulo 29 (active = false, etc.).
        window.WeddingMode.deactivate();
      }
    }

    active = true;

    return new Promise(function(resolve) {
      function apply() {
        document.body.classList.add('rehearsal-mode');
        try { localStorage.setItem('pdMode', 'coro'); } catch(e) {}
        console.log('[Coro] Modo Coro activado');
        resolve();
      }
      if (seal) {
        playRehearsalIntro(apply);
      } else {
        apply();
      }
    });
  }

  // ── INTRO ANIMATION (sello) ──────
  // Generic version — acepta cualquier label HTML. Usada por el Modo Coro y,
  // a través de window.playModeIntro, por otros módulos.
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
    document.getElementById('rehearsal-confirm').classList.remove('open');
    // Close edge panel if open
    if (window.SL) window.SL.close();
    try { localStorage.removeItem('pdMode'); } catch(e) {}
    console.log('[Coro] Modo Coro desactivado');
  }

  /**
   * Abre el diálogo de confirmación de salida. Lo llama el selector de modos
   * cuando el usuario elige la fila "Pública" estando en Modo Coro.
   */
  function requestExit() {
    var text = document.querySelector('#rehearsal-confirm p');
    if (text) text.textContent = '¿Salir del modo Coro?';
    document.getElementById('rehearsal-confirm').classList.add('open');
  }

  // ── RESTORE MODE ON PAGE LOAD (silent, no animation) ──
  // Solo restauramos el Modo Coro aquí. La restauración del Modo Bodas la
  // hace el módulo 29-wedding-mode.js leyendo el mismo localStorage. Como
  // los modos son mutuamente excluyentes, solo uno se ejecuta a la vez.
  //
  // Valores válidos de pdMode:
  //   'coro'       → restaurar Modo Coro
  //   'coro+dev'   → restaurar Modo Coro (el módulo 11 añade Edición si hay
  //                   sesión de administrador)
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
      // v3.6.7r10: la restauración de dev-mode ya NO se hace aquí (permitía
      // "guardar" sin sesión Firebase → las reglas rechazaban en silencio y la
      // UI fingía éxito). El módulo 11 restaura dev-mode tras validar la sesión
      // con AuthGate.isAdmin().
      console.log('[Mode] Restaurado: ' + saved);
    } catch(e) {}
  })();

  // ── DIÁLOGO DE CONFIRMACIÓN DE SALIDA ──
  // Confirmar sale del Modo Coro por completo (incluido Edición). El paso
  // Edición → Coro lo hace el interruptor del selector, no este diálogo.
  document.getElementById('confirm-yes').addEventListener('click', function() {
    deactivateRehearsal();
  });
  document.getElementById('confirm-no').addEventListener('click', function() {
    document.getElementById('rehearsal-confirm').classList.remove('open');
  });
  // Click outside dialog box closes it
  document.getElementById('rehearsal-confirm').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });

  // ── API PÚBLICA ───────────────────────────────────────────────────────
  window.RehearsalMode = {
    activate:   activateRehearsal,
    deactivate: deactivateRehearsal,
    requestExit: requestExit,
    isActive:   function() { return active; }
  };
})();
