/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/11-dev-mode.js
 *   @brief      Modo Edición: capa de escritura sobre Coro o Bodas, con
 *               sesión de administrador obligatoria
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.8
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   11-dev-mode.js
   ============================================================================
   Modo Edición — capa de escritura (clase body.dev-mode)

   NOMBRE VISIBLE
     El texto que ve el usuario es "Edición". La clase del body sigue siendo
     'dev-mode' porque la consumen decenas de reglas CSS y varios módulos; se
     conserva por compatibilidad, no como nombre de cara al usuario.

   ACTIVACIÓN (v3.6.8)
     Ya no hay gesto secreto de 5 clics en la línea de versión. El interruptor
     "Edición" del selector de modos (módulo 34) llama a DevMode.activate().

     Edición es una capa: SIEMPRE necesita un modo padre activo (Coro o
     Bodas). Sin padre, activate() rechaza con Error('sin-modo-padre').

   PERMISOS
     activate() exige sesión iniciada (AuthGate.requireAuth) Y que esa cuenta
     sea administradora (AuthGate.isAdmin). Cualquier persona con una cuenta
     de Google puede iniciar sesión, pero solo los UID autorizados pasan las
     reglas de la base de datos: sin esta comprobación, la interfaz ofrecería
     controles cuyo guardado iba a fallar. Sin permisos rechaza con
     Error('sin-permisos').

   SIN SELLO
     Entrar en Edición no reproduce animación de sello. Los sellos marcan el
     cambio de modo (Pública → Coro / Bodas), no el de capa.

   PERSISTENCIA
     localStorage 'pdMode' = 'coro+dev' | 'bodas+dev'. Al salir se degrada al
     padre ('coro' | 'bodas'). La restauración solo añade la clase si
     AuthGate.isAdmin() lo confirma; si no, degrada el valor guardado.

   ORDEN DE CARGA: posición 11, DESPUÉS del módulo 35 (AuthGate) y del 05
   (RehearsalMode). El selector (34) carga después y consume window.DevMode.
   ============================================================================ */

(function() {

  /* ──────────────────────────────────────────────────────────────────────
     ACTIVAR
     ──────────────────────────────────────────────────────────────────────
     Devuelve una Promise para que el selector de modos pueda dejar el
     interruptor en la posición correcta según el resultado:
       - resuelve            → Edición activa
       - 'sin-modo-padre'    → no había Coro ni Bodas
       - 'sin-permisos'      → hay sesión, pero no es administradora
       - 'cancelled' u otro  → el usuario cerró el modal de login
     ────────────────────────────────────────────────────────────────────── */
  function activate() {
    var inBodas = document.body.classList.contains('wedding-mode');
    var inCoro  = document.body.classList.contains('rehearsal-mode');

    if (!inBodas && !inCoro) {
      return Promise.reject(new Error('sin-modo-padre'));
    }

    if (!window.AuthGate || typeof window.AuthGate.requireAuth !== 'function') {
      // Sin gate de autenticación no hay forma de garantizar que las
      // escrituras vayan firmadas: no activamos.
      return Promise.reject(new Error('sin-permisos'));
    }

    return window.AuthGate.requireAuth(null, {
      message: 'El modo Edición requiere iniciar sesión con la cuenta del director.'
    }).then(function() {
      return window.AuthGate.isAdmin();
    }).then(function(ok) {
      if (!ok) throw new Error('sin-permisos');
      applyDevMode(inBodas);
    });
  }

  /**
   * Aplica la capa de edición. Sin animación: el sello marca el cambio de
   * modo, no el de capa.
   */
  function applyDevMode(inBodas) {
    document.body.classList.add('dev-mode');
    // Persistencia: indica el modo padre + edición para que tras recargar
    // se restaure correctamente.
    var savedMode = inBodas ? 'bodas+dev' : 'coro+dev';
    try { localStorage.setItem('pdMode', savedMode); } catch(e) {}
    console.log('[Edición] Modo Edición activado sobre ' + (inBodas ? 'Bodas' : 'Coro'));
  }

  /* ──────────────────────────────────────────────────────────────────────
     DESACTIVAR
     ──────────────────────────────────────────────────────────────────────
     Vuelve al modo padre sin pedir confirmación (salir de Edición no
     destruye nada). Cierra el panel de SetList correspondiente para que se
     vuelva a renderizar sin los controles de escritura.
     ────────────────────────────────────────────────────────────────────── */
  function deactivate() {
    var inBodas = document.body.classList.contains('wedding-mode');
    document.body.classList.remove('dev-mode');

    if (inBodas) {
      try { localStorage.setItem('pdMode', 'bodas'); } catch(e) {}
      if (window.SLB && typeof window.SLB.close === 'function') window.SLB.close();
      console.log('[Edición] Modo Edición desactivado, vuelta a Bodas');
    } else {
      try { localStorage.setItem('pdMode', 'coro'); } catch(e) {}
      if (window.SL && typeof window.SL.close === 'function') window.SL.close();
      console.log('[Edición] Modo Edición desactivado, vuelta a Coro');
    }
  }

  /* ──────────────────────────────────────────────────────────────────────
     RESTAURACIÓN AL CARGAR (v3.6.8)
     ──────────────────────────────────────────────────────────────────────
     Hasta v3.6.7r9 el módulo 05 restauraba dev-mode desde localStorage SIN
     validar la sesión: la interfaz mostraba botones de edición sin token, las
     escrituras salían sin auth, las reglas las rechazaban y la aplicación
     fingía "guardado" (datos que desaparecían al recargar).

     r10 lo condicionó a que existiera sesión. v3.6.8 endurece la condición:
     además de sesión hace falta que la cuenta sea administradora
     (AuthGate.isAdmin, que ya implica ensureReady). Si no lo es, se quita la
     clase y se degrada el valor guardado a su padre.
     ────────────────────────────────────────────────────────────────────── */
  (function restoreDevMode() {
    var saved;
    try { saved = localStorage.getItem('pdMode'); } catch (e) { return; }
    if (saved !== 'coro+dev' && saved !== 'dev' && saved !== 'bodas+dev') return;

    /* Degradar al modo padre. Leemos el padre del BODY, no del valor
       guardado: si la cuenta no es administradora, el módulo 29 está
       degradando Bodas a Pública en paralelo por la misma razón, y ya pudo
       haber quitado la clase. Si no queda ningún padre, no dejamos rastro. */
    function downgradeStoredMode() {
      try {
        if (document.body.classList.contains('wedding-mode')) {
          localStorage.setItem('pdMode', 'bodas');
        } else if (document.body.classList.contains('rehearsal-mode')) {
          localStorage.setItem('pdMode', 'coro');
        } else {
          localStorage.removeItem('pdMode');
        }
      } catch (e) {}
    }

    if (!window.AuthGate || typeof window.AuthGate.isAdmin !== 'function') {
      document.body.classList.remove('dev-mode');
      downgradeStoredMode();
      return;
    }

    /* Edición es una capa: solo se reaplica si su modo padre SIGUE aplicado
       cuando isAdmin() resuelve. Entre el arranque y esa respuesta pueden
       haber pasado cosas: el módulo 28 (Modo Novios) limpia todas las clases
       de modo al final de la carga, y el 29 degrada Bodas sin sesión. Sin esta
       comprobación, la respuesta tardía volvía a encender la capa de escritura
       sobre un body ya limpio. */
    function parentStillActive() {
      if (window.PD_NOVIOS_MODE === true) return false;
      if (document.body.classList.contains('novios-mode')) return false;
      return document.body.classList.contains('wedding-mode') ||
             document.body.classList.contains('rehearsal-mode');
    }

    window.AuthGate.isAdmin().then(function (ok) {
      if (ok && parentStillActive()) {
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

  /* ──────────────────────────────────────────────────────────────────────
     API PÚBLICA
     ────────────────────────────────────────────────────────────────────── */
  window.DevMode = {
    activate:   activate,
    deactivate: deactivate,
    isActive:   function() { return document.body.classList.contains('dev-mode'); }
  };
})();
