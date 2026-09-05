/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/34-mode-switcher.js
 *   @brief      Selector de modos de la barra superior: chip de estado, menú
 *               de modos, bloque de cuenta e interruptor de Edición
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.8
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   34-mode-switcher.js  —  Selector de modos
   ============================================================================
   QUÉ SUSTITUYE
     Hasta v3.6.7 los tres modos de trabajo se activaban con gestos secretos
     de 5 clics: en el ícono de iglesia (Coro), en la línea de versión
     (Edición) y en el contador de cantos (Bodas). Nadie que no lo supiera
     podía llegar a ellos, y los propios coristas dependían de que alguien les
     enseñara el gesto. Este módulo los reemplaza por un control visible en la
     barra superior: un chip que dice en qué modo estás y un menú donde se
     elige el modo.

   MODELO DE MODOS
     ┌───────────┬────────────────────┬──────────────────────────────────────┐
     │ Modo      │ Clase del body     │ Quién                                │
     ├───────────┼────────────────────┼──────────────────────────────────────┤
     │ Pública   │ (ninguna)          │ feligrés — letras, contexto, salmo   │
     │ Coro      │ rehearsal-mode     │ coristas — acordes, transposición    │
     │ Bodas     │ wedding-mode       │ solo el director (sesión + permisos) │
     │ Edición   │ dev-mode (capa)    │ solo el director (sesión + permisos) │
     │ Novios    │ novios-mode        │ los novios — llega por URL con PIN   │
     └───────────┴────────────────────┴──────────────────────────────────────┘

     Coro y Bodas son excluyentes. Edición es una CAPA: siempre se apoya en
     Coro o en Bodas, nunca existe sola. El texto visible de la capa es
     "Edición"; la clase sigue llamándose 'dev-mode' por compatibilidad.

     En Modo Novios el selector no se muestra (novios-mode.css lo oculta) y
     este módulo no toca nada: el módulo 28 limpia las clases de modo al final
     de la carga, y el MutationObserver de aquí simplemente refleja el
     resultado.

   TRANSICIONES
     Pública → Coro / Bodas   sello de ingreso (la animación marca el cambio)
     Coro ↔ Bodas             sin sello (no venimos de Pública)
     Coro / Bodas → Pública   diálogo de confirmación existente
     Edición ON / OFF         sin sello, sin confirmación; vuelve a su padre

     Bodas y Edición exigen sesión iniciada Y cuenta administradora. La
     comprobación se hace ANTES de aplicar el modo: así el director nunca ve
     controles de escritura cuyo guardado iba a fallar en las reglas.

   FUENTE DE VERDAD
     El chip nunca guarda estado propio: lee las clases del body y se
     resincroniza con un MutationObserver. Da igual quién cambie el modo —
     este menú, la restauración de arranque, el módulo 28 o la consola — el
     chip siempre muestra lo que realmente está aplicado.

   ORDEN DE CARGA
     Posición 34: después de 05 (RehearsalMode), 11 (DevMode), 29
     (WeddingMode), 30 (SLB) y 35 (AuthGate), y ANTES del 28, que en Modo
     Novios limpia las clases de modo al final.

     Este módulo NO carga el SDK de Firebase por su cuenta: se suscribe a
     AuthGate.onAuthChange y espera. La sesión aparece cuando el módulo 11 o
     el 29 la consultan al restaurar, o cuando el usuario pulsa Iniciar
     sesión. Un feligrés nunca descarga el SDK por abrir este menú.

   MARKUP
     Todo el markup vive en dominical.html. Aquí solo se cambian clases,
     atributos y textContent: nada de innerHTML.
   ============================================================================ */

(function() {
  'use strict';

  // ── CONSTANTES ────────────────────────────────────────────────────────
  var MODE_LABEL = {
    publico: 'Pública',
    coro:    'Coro',
    bodas:   'Bodas'
  };

  var MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  var MSG_BODAS = 'El Modo Bodas es privado. Inicia sesión con la cuenta del director.';
  var MSG_LOGIN = 'Solo el director necesita iniciar sesión.';
  var TXT_BUSY  = 'Conectando…';

  // ── REFERENCIAS AL DOM ────────────────────────────────────────────────
  var root, btn, menu, labelEl, subEl;
  var itemsEl, bodasDescEl, accountEl, emailEl, editInput, loginTxt;
  var bodasDescDefault = '';
  var currentEmail = '';
  var lastMode = null;
  var busy = false;
  /* Transición de Edición en curso: mientras dure, syncFromBody no toca el
     interruptor. Si no, el cambio de clase del modo padre (que llega antes
     que 'dev-mode') lo devolvería visualmente a OFF en mitad del proceso. */
  var editPending = false;

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

  function cacheDom() {
    root    = document.getElementById('pd-mode');
    if (!root) return false;
    btn     = document.getElementById('pd-mode-btn');
    menu    = document.getElementById('pd-mode-menu');
    if (!btn || !menu) return false;

    labelEl = qs('.pd-mode-label', btn);
    subEl   = qs('.pd-mode-sub', btn);

    itemsEl     = menu.querySelectorAll('.pd-mode-item');
    bodasDescEl = document.getElementById('pd-mode-bodas-desc');
    accountEl   = qs('.pd-mode-account', menu);
    emailEl     = qs('.pd-mode-user-email', menu);
    editInput   = document.getElementById('pd-mode-edit');
    loginTxt    = qs('.pd-mode-login span', menu);

    if (bodasDescEl) bodasDescDefault = bodasDescEl.textContent;
    return true;
  }

  // ── ESTADO ACTUAL SEGÚN EL BODY ───────────────────────────────────────
  function currentMode() {
    var c = document.body.classList;
    if (c.contains('wedding-mode'))   return 'bodas';
    if (c.contains('rehearsal-mode')) return 'coro';
    return 'publico';
  }

  function isEditing() {
    return document.body.classList.contains('dev-mode');
  }

  /* ──────────────────────────────────────────────────────────────────────
     SINCRONIZACIÓN CHIP ← BODY
     ──────────────────────────────────────────────────────────────────────
     Único punto donde se escribe el aspecto del chip. Lo llaman el
     MutationObserver, el arranque y la API pública.
     ────────────────────────────────────────────────────────────────────── */
  function syncFromBody() {
    if (!root) return;
    var mode = currentMode();
    var edit = isEditing();

    root.classList.remove('is-publico', 'is-coro', 'is-bodas');
    root.classList.add('is-' + mode);
    if (edit) { root.classList.add('is-edit'); }
    else      { root.classList.remove('is-edit'); }

    // Texto del chip. En móvil el CSS oculta el bloque de texto, así que
    // siempre componemos la versión larga.
    if (labelEl) {
      labelEl.textContent = edit && mode !== 'publico'
        ? MODE_LABEL[mode] + ' · Edición'
        : MODE_LABEL[mode];
    }
    /* Nombre accesible del chip. En escritorio el texto visible ya dice el
       modo, pero en móvil está oculto: sin aria-label el lector anunciaría
       solo el título fijo. "Vista activa" concuerda en género con los nombres
       de las filas (Pública, Coro, Bodas), que describen vistas. */
    if (btn) {
      btn.setAttribute('aria-label', 'Modo del cancionero. Vista activa: ' +
        (labelEl ? labelEl.textContent : MODE_LABEL[mode]));
    }

    // Filas del menú
    if (itemsEl) {
      Array.prototype.forEach.call(itemsEl, function(item) {
        var checked = item.getAttribute('data-mode') === mode;
        item.setAttribute('aria-checked', checked ? 'true' : 'false');
      });
    }

    // Interruptor de Edición. Durante una transición en curso lo dejamos como
    // lo puso el usuario: la clase del modo padre llega antes que 'dev-mode' y
    // apagaría el interruptor recién encendido.
    if (editInput && !editPending) {
      editInput.checked = edit;
      editInput.setAttribute('aria-checked', edit ? 'true' : 'false');
    }

    // Animación breve del chip cuando el modo realmente cambió
    if (lastMode !== null && lastMode !== mode) flashChip();
    lastMode = mode;

    refreshEventInfo();
  }

  function flashChip() {
    if (!btn) return;
    btn.classList.remove('changed');
    // Forzar reflujo para poder reiniciar la animación si se encadenan
    // dos cambios seguidos.
    void btn.offsetWidth;
    btn.classList.add('changed');
    btn.addEventListener('animationend', function onEnd() {
      btn.classList.remove('changed');
      btn.removeEventListener('animationend', onEnd);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     INFORMACIÓN DEL EVENTO DE BODAS
     ──────────────────────────────────────────────────────────────────────
     El chip (solo en escritorio y en Modo Bodas) y la fila Bodas del menú
     muestran "fecha · novios" cuando hay un evento activo en el panel SLB.
     ────────────────────────────────────────────────────────────────────── */
  function formatShortDate(key) {
    if (!key) return '';
    var parts = String(key).split('-');
    if (parts.length !== 3) return String(key);
    var month = MONTHS_SHORT[parseInt(parts[1], 10) - 1] || '';
    return parseInt(parts[2], 10) + ' ' + month + ' ' + parts[0];
  }

  function eventText() {
    if (!window.SLB || typeof window.SLB.getEventInfo !== 'function') return '';
    var info;
    try { info = window.SLB.getEventInfo(); } catch (e) { return ''; }
    if (!info || !info.date) return '';
    var txt = formatShortDate(info.date);
    if (info.novios) txt += ' · ' + info.novios;
    return txt;
  }

  function refreshEventInfo() {
    var txt = eventText();
    if (subEl) subEl.textContent = txt;
    if (!bodasDescEl) return;
    var value = txt || bodasDescDefault;
    // Si la fila está ocupada mostrando "Conectando…", guardamos el texto
    // nuevo para restaurarlo al terminar en vez de pisarlo ahora.
    if (bodasDescEl.hasAttribute('data-desc')) {
      bodasDescEl.setAttribute('data-desc', value);
    } else {
      bodasDescEl.textContent = value;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────
     MENÚ: ABRIR, CERRAR, TECLADO
     ────────────────────────────────────────────────────────────────────── */
  function isOpen() { return menu && menu.classList.contains('open'); }

  function openMenu() {
    if (!menu || isOpen()) return;
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    refreshEventInfo();
    // Foco en la fila marcada
    var checked = qs('.pd-mode-item[aria-checked="true"]', menu);
    if (checked) checked.focus();
  }

  function closeMenu() {
    if (!menu || !isOpen()) return;
    /* Si el foco está dentro del menú hay que devolverlo al chip ANTES de que
       el CSS oculte el elemento enfocado: al ocultarse con display:none el
       navegador manda el foco al <body> y el recorrido de teclado se pierde
       al principio del documento. */
    var hadFocus = menu.contains(document.activeElement);
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (accountEl) accountEl.classList.remove('asking');
    if (hadFocus) btn.focus();
  }

  function toggleMenu() {
    if (isOpen()) closeMenu(); else openMenu();
  }

  function moveFocus(delta) {
    if (!itemsEl || !itemsEl.length) return;
    var list = Array.prototype.slice.call(itemsEl);
    var idx  = list.indexOf(document.activeElement);
    if (idx === -1) idx = 0;
    else idx = (idx + delta + list.length) % list.length;
    list[idx].focus();
  }

  /* ──────────────────────────────────────────────────────────────────────
     ESTADO OCUPADO
     ──────────────────────────────────────────────────────────────────────
     Mientras una acción asíncrona está en curso (login, comprobación de
     permisos, sello de ingreso) el menú no se cierra, ni se abre desde el
     chip, y sus controles quedan inertes; el control pulsado anuncia
     "Conectando…".
     ────────────────────────────────────────────────────────────────────── */
  function setBusy(on, item) {
    busy = !!on;
    if (menu) {
      if (on) menu.classList.add('busy');
      else    menu.classList.remove('busy');
    }
    if (!item) return;
    var desc = qs('.pd-mode-item-desc', item);
    if (!desc) return;
    if (on) {
      item.classList.add('is-busy');
      if (!desc.hasAttribute('data-desc')) {
        desc.setAttribute('data-desc', desc.textContent);
      }
      desc.textContent = TXT_BUSY;
    } else {
      item.classList.remove('is-busy');
      if (desc.hasAttribute('data-desc')) {
        desc.textContent = desc.getAttribute('data-desc');
        desc.removeAttribute('data-desc');
      }
    }
  }

  /* El botón "Iniciar sesión" está fuera de las filas de modo: necesita su
     propia señal mientras se descarga el SDK y se abre el popup de Google. */
  function setLoginBusy(on) {
    if (!loginTxt) return;
    if (on) {
      if (!loginTxt.hasAttribute('data-desc')) {
        loginTxt.setAttribute('data-desc', loginTxt.textContent);
      }
      loginTxt.textContent = TXT_BUSY;
    } else if (loginTxt.hasAttribute('data-desc')) {
      loginTxt.textContent = loginTxt.getAttribute('data-desc');
      loginTxt.removeAttribute('data-desc');
    }
  }

  /* Los sellos de ingreso duran ~2,5 s y su overlay no bloquea el ratón. Sin
     esto el usuario podía reabrir el menú y pedir otro modo mientras el sello
     corría: la orden nueva se perdía y el modo viejo se aplicaba igual. */
  function holdWhile(promise) {
    if (!promise || typeof promise.then !== 'function') return;
    setBusy(true, null);
    promise.then(function() {
      setBusy(false, null);
    }, function() {
      setBusy(false, null);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     BLOQUE DE CUENTA
     ──────────────────────────────────────────────────────────────────────
     data-session del menú gobierna qué se ve (CSS):
       none  → botón Iniciar sesión + nota
       user  → correo + "Esta cuenta no tiene permisos" + Cerrar sesión
       admin → correo + interruptor Edición + Cerrar sesión
     ────────────────────────────────────────────────────────────────────── */
  function setSession(state, email) {
    if (!menu) return;
    menu.setAttribute('data-session', state);
    currentEmail = email || '';
    if (emailEl) emailEl.textContent = currentEmail;
    if (accountEl) accountEl.classList.remove('asking');
  }

  function bindAuth() {
    if (!window.AuthGate || typeof window.AuthGate.onAuthChange !== 'function') return;
    // onAuthChange notifica de inmediato con el estado actual (null al
    // cargar). No dispara la carga del SDK: eso solo pasa si alguien pide
    // sesión de verdad.
    window.AuthGate.onAuthChange(function(user) {
      if (!user) { setSession('none', ''); return; }
      if (typeof window.AuthGate.isAdmin !== 'function') {
        setSession('user', user.email);
        return;
      }
      window.AuthGate.isAdmin().then(function(ok) {
        setSession(ok ? 'admin' : 'user', user.email);
      }).catch(function() {
        setSession('user', user.email);
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     TRANSICIONES DE MODO
     ────────────────────────────────────────────────────────────────────── */
  function goPublico() {
    var mode = currentMode();
    if (mode === 'coro' && window.RehearsalMode) {
      window.RehearsalMode.requestExit();
    } else if (mode === 'bodas' && window.WeddingMode) {
      window.WeddingMode.requestExit();
    }
    closeMenu();
  }

  function goCoro() {
    var mode = currentMode();
    if (mode === 'coro') { closeMenu(); return; }
    if (!window.RehearsalMode) return;
    closeMenu();
    if (mode === 'bodas') {
      if (window.WeddingMode) window.WeddingMode.deactivate();
      holdWhile(window.RehearsalMode.activate({ seal: false }));
    } else {
      holdWhile(window.RehearsalMode.activate({ seal: true }));
    }
  }

  function goBodas(item) {
    var mode = currentMode();
    if (mode === 'bodas') { closeMenu(); return; }
    if (!window.WeddingMode) return;

    if (!window.AuthGate || typeof window.AuthGate.requireAuth !== 'function') {
      setBusy(false, item);
      return;
    }

    setBusy(true, item);
    window.AuthGate.requireAuth(null, { message: MSG_BODAS })
      .then(function() {
        return window.AuthGate.isAdmin();
      })
      .then(function(ok) {
        setBusy(false, item);
        if (!ok) {
          // Sesión iniciada pero sin permisos de escritura: el menú se queda
          // abierto explicando por qué no se activó nada.
          setSession('user', currentEmail ||
            (window.AuthGate.getCurrentUser() ? window.AuthGate.getCurrentUser().email : ''));
          return;
        }
        closeMenu();
        if (mode === 'coro') {
          if (window.RehearsalMode) window.RehearsalMode.deactivate();
          holdWhile(window.WeddingMode.activate({ seal: false }));
        } else {
          holdWhile(window.WeddingMode.activate({ seal: true }));
        }
      })
      .catch(function(err) {
        // Login cancelado o error de red: no cambiamos nada.
        setBusy(false, item);
        console.log('[Modo] Bodas no activado:', err && err.message);
      });
  }

  function selectMode(mode, item) {
    if (busy) return;
    if (mode === 'publico')    goPublico();
    else if (mode === 'coro')  goCoro();
    else if (mode === 'bodas') goBodas(item);
  }

  /* ──────────────────────────────────────────────────────────────────────
     INTERRUPTOR DE EDICIÓN
     ────────────────────────────────────────────────────────────────────── */
  function handleEditToggle() {
    if (!editInput) return;
    /* Con una acción en curso el interruptor no acepta órdenes nuevas: un
       segundo clic entraría por la rama de apagado mientras la cadena
       anterior sigue viva y acabaría encendiendo Edición igualmente. */
    if (busy) {
      // El teclado llega igual aunque el CSS quite pointer-events: devolvemos
      // el interruptor a lo que la acción en curso está intentando aplicar.
      var pinned = editPending ? true : isEditing();
      editInput.checked = pinned;
      editInput.setAttribute('aria-checked', pinned ? 'true' : 'false');
      return;
    }

    var wantOn = editInput.checked;
    // El estado accesible acompaña al visual desde el primer instante: con
    // role="switch" el aria-checked explícito manda sobre la propiedad nativa.
    editInput.setAttribute('aria-checked', wantOn ? 'true' : 'false');

    if (!wantOn) {
      if (window.DevMode) window.DevMode.deactivate();
      closeMenu();
      return;
    }

    if (!window.DevMode) {
      editInput.checked = false;
      editInput.setAttribute('aria-checked', 'false');
      return;
    }

    editPending = true;
    setBusy(true, null);

    var chain;
    if (currentMode() === 'publico') {
      // Edición necesita un modo padre. Desde Pública entramos primero a
      // Coro (con sello, porque venimos de Pública) y encima la capa.
      chain = window.RehearsalMode
        ? window.RehearsalMode.activate({ seal: true }).then(function() {
            return window.DevMode.activate();
          })
        : Promise.reject(new Error('sin-modo-padre'));
    } else {
      chain = window.DevMode.activate();
    }

    chain.then(function() {
      editPending = false;
      setBusy(false, null);
      syncFromBody();
      closeMenu();
    }).catch(function(err) {
      editPending = false;
      setBusy(false, null);
      editInput.checked = false;
      editInput.setAttribute('aria-checked', 'false');
      var msg = err && err.message;
      if (msg === 'sin-permisos') {
        setSession('user', currentEmail ||
          (window.AuthGate && window.AuthGate.getCurrentUser()
            ? window.AuthGate.getCurrentUser().email : ''));
      }
      console.log('[Modo] Edición no activada:', msg);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     SESIÓN: INICIAR Y CERRAR
     ────────────────────────────────────────────────────────────────────── */
  function doLogin() {
    if (!window.AuthGate || typeof window.AuthGate.promptLogin !== 'function') return;
    setBusy(true, null);
    setLoginBusy(true);
    window.AuthGate.promptLogin(MSG_LOGIN).then(function(user) {
      setBusy(false, null);
      setLoginBusy(false);
      if (!user) return;
      if (typeof window.AuthGate.isAdmin !== 'function') {
        setSession('user', user.email);
        return;
      }
      return window.AuthGate.isAdmin().then(function(ok) {
        setSession(ok ? 'admin' : 'user', user.email);
      });
    }).catch(function(err) {
      // Cancelar no hace nada.
      setBusy(false, null);
      setLoginBusy(false);
      console.log('[Modo] Sesión no iniciada:', err && err.message);
    });
  }

  function doLogout() {
    if (!window.AuthGate || typeof window.AuthGate.signOut !== 'function') return;
    window.AuthGate.signOut().then(function() {
      // Sin sesión no puede haber Edición, y Bodas exige sesión del
      // director. Coro es público y se mantiene.
      if (document.body.classList.contains('dev-mode') && window.DevMode) {
        window.DevMode.deactivate();
      }
      if (document.body.classList.contains('wedding-mode') && window.WeddingMode) {
        window.WeddingMode.deactivate();
      }
      setSession('none', '');
    }).catch(function(err) {
      console.log('[Modo] No se pudo cerrar la sesión:', err && err.message);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     ENLACES DIRECTOS  ?vista=coro | ?vista=publico
     ──────────────────────────────────────────────────────────────────────
     Sirven para compartir el cancionero ya en Modo Coro con los coristas.
     El parámetro se limpia de la URL conservando el ancla del canto
     (#cpd-XXX) para que al compartir el enlace no arrastre el modo.
     ────────────────────────────────────────────────────────────────────── */
  function applyDeepLink() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }

    // El Modo Novios manda: llega por URL y el módulo 28 (que carga después)
    // limpia cualquier otro modo. Aquí ni lo intentamos.
    if (params.get('modo') === 'novios') return;
    if (document.body.classList.contains('novios-mode')) return;

    var vista = params.get('vista');
    if (vista !== 'coro' && vista !== 'publico') return;

    var mode = currentMode();
    if (vista === 'coro') {
      if (mode !== 'coro' && window.RehearsalMode) {
        window.RehearsalMode.activate({ seal: true });
      }
    } else {
      // Salida directa, sin diálogo: el enlace ya expresa la intención.
      if (mode === 'coro' && window.RehearsalMode) window.RehearsalMode.deactivate();
      else if (mode === 'bodas' && window.WeddingMode) window.WeddingMode.deactivate();
    }

    params['delete']('vista');
    var query = params.toString();
    var clean = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
    try { history.replaceState(null, '', clean); } catch (e) {}
  }

  /* ──────────────────────────────────────────────────────────────────────
     ENLACES DE EVENTOS
     ────────────────────────────────────────────────────────────────────── */
  function bindEvents() {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Con una acción en curso el menú ni se abre ni se cierra.
      if (busy) return;
      toggleMenu();
    });

    menu.addEventListener('click', function(e) {
      e.stopPropagation();

      var item = e.target.closest('.pd-mode-item');
      if (item) {
        selectMode(item.getAttribute('data-mode'), item);
        return;
      }

      var act = e.target.closest('[data-act]');
      if (!act) return;
      var action = act.getAttribute('data-act');

      if (action === 'login')       doLogin();
      else if (action === 'logout') { if (accountEl) accountEl.classList.add('asking'); }
      else if (action === 'logout-yes') { if (accountEl) accountEl.classList.remove('asking'); doLogout(); }
      else if (action === 'logout-no')  { if (accountEl) accountEl.classList.remove('asking'); }
    });

    if (editInput) {
      editInput.addEventListener('change', handleEditToggle);
      // El clic sobre la etiqueta ya alterna el input; evitamos que además
      // burbujee al manejador del menú.
      editInput.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // Teclado dentro del menú
    menu.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown')                { e.preventDefault(); moveFocus(1); }
      else if (e.key === 'ArrowUp')             { e.preventDefault(); moveFocus(-1); }
      else if (e.key === 'Escape' && !busy)     { closeMenu(); }
    });

    // Escape global y clic fuera. closeMenu() ya devuelve el foco al chip.
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen() && !busy) closeMenu();
    });
    document.addEventListener('click', function() {
      if (isOpen() && !busy) closeMenu();
    });

    // El chip refleja SIEMPRE el body, venga el cambio de donde venga.
    new MutationObserver(syncFromBody).observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Encabezado del panel de bodas: cuando cambia la fecha o los nombres,
    // el chip y la fila Bodas se actualizan.
    var panel = document.getElementById('slb-panel');
    if (panel) {
      var pending = null;
      new MutationObserver(function() {
        if (pending) return;
        pending = setTimeout(function() {
          pending = null;
          refreshEventInfo();
        }, 120);
      }).observe(panel, { childList: true, subtree: true });
    }
  }

  /* ──────────────────────────────────────────────────────────────────────
     ARRANQUE
     ────────────────────────────────────────────────────────────────────── */
  function init() {
    if (!cacheDom()) {
      console.warn('[Modo] Selector de modos ausente en el HTML.');
      return;
    }
    bindEvents();
    bindAuth();
    syncFromBody();
    applyDeepLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────
  window.ModeSwitcher = {
    refresh: function() { syncFromBody(); },
    open:    function() { openMenu(); },
    close:   function() { closeMenu(); }
  };
})();
