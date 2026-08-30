/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/34-dev-pin.js
 *   @brief      PIN numérico de 6 dígitos para activar Modo Dev. Hash SHA-256
 *               almacenado en Firebase. Modal con keypad + teclado físico.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.6r7
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   34-dev-pin.js — Seguridad de Modo Dev por PIN numérico
   ============================================================================

   ROL EN LA ARQUITECTURA
     Antes (r6): 5 clicks en la cruz del footer ceremonial → Modo Dev se
     activaba sin más. Cualquier usuario que descubriera el truco entraba.
     Ahora (r7): después de los 5 clicks se exige PIN de 6 dígitos. El PIN
     se compara contra un hash SHA-256 almacenado en Firebase. Si el PIN
     ya fue ingresado correctamente en esta misma pestaña (sessionStorage),
     se omite la verificación.

   FLUJO
     1. Usuario hace 5 clicks en la cruz → módulo 11 dispara playIntro
     2. ANTES de la animación, llamamos a verifyDevPinFlow()
     3. Si sessionStorage tiene "pd-dev-unlocked"=true → continuar
     4. Si Firebase NO tiene PIN guardado → mostrar mensaje "Configura tu PIN
        primero con __setDevPin('XXXXXX') en la consola"
     5. Si Firebase tiene PIN → mostrar modal keypad
     6. Usuario teclea 6 dígitos → al completar SE compara hash
     7. Si match → marcar sessionStorage + ejecutar callback de activación
     8. Si no match → shake del modal + reset

   ALMACENAMIENTO
     Firebase: /dev-pin/hash → string SHA-256 hex (64 chars)
     sessionStorage: pd-dev-unlocked → "true" si el PIN ya fue verificado
       en esta sesión (la pestaña sigue abierta).

   SEGURIDAD HONESTA
     Esto NO es seguridad criptográfica. El JS es público y un atacante
     puede leer la lógica. PERO:
       - El PIN nunca aparece en el código (el hash sí, pero no se puede
         revertir a PIN razonable en práctica para 6 dígitos en un ataque
         online con 1M combinaciones — basta un rate limiter sencillo).
       - Quien sepa el PIN, lo sabe; quien no, no entrará por accidente.
       - El propósito es UX-friction, no defensa contra atacantes.

   HELPERS DE CONSOLA
     window.__setDevPin('123456') → escribe el hash del PIN a Firebase
     window.__clearDevPin()        → borra el PIN de Firebase
     window.__lockDev()             → cierra la sesión (borra sessionStorage)
     window.__devPinStatus()        → diagnóstico de estado
   ============================================================================ */

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────
  // CONSTANTES
  // ──────────────────────────────────────────────────────────────────────
  var FIREBASE_URL = 'https://coropacemdeusdominical-default-rtdb.firebaseio.com';
  var FB_PIN_PATH  = '/dev-pin';   // dentro: { hash: "..." }
  var SESSION_KEY  = 'pd-dev-unlocked';
  var PIN_LENGTH   = 6;

  // ──────────────────────────────────────────────────────────────────────
  // HASHING (Web Crypto API — nativo, sin libs)
  // ──────────────────────────────────────────────────────────────────────
  /**
   * Calcula SHA-256 del PIN (string) y devuelve el hex.
   * Web Crypto API solo está disponible en HTTPS o localhost. Como
   * GitHub Pages siempre es HTTPS, esto funciona.
   */
  function sha256Hex(str) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('Web Crypto API no disponible. Usa HTTPS.'));
    }
    var encoder = new TextEncoder();
    var data = encoder.encode(str);
    return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var hex = '';
      for (var i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    });
  }


  // ──────────────────────────────────────────────────────────────────────
  // FIREBASE (REST API)
  // ──────────────────────────────────────────────────────────────────────
  function fetchPinHash() {
    return fetch(FIREBASE_URL + FB_PIN_PATH + '/hash.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { return typeof data === 'string' ? data : null; });
  }

  function savePinHash(hashHex) {
    return fetch(FIREBASE_URL + FB_PIN_PATH + '/hash.json', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(hashHex)
    });
  }

  function deletePinHash() {
    return fetch(FIREBASE_URL + FB_PIN_PATH + '.json', { method: 'DELETE' });
  }


  // ──────────────────────────────────────────────────────────────────────
  // SESIÓN
  // ──────────────────────────────────────────────────────────────────────
  function isUnlockedInSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function markUnlocked() {
    try {
      sessionStorage.setItem(SESSION_KEY, 'true');
    } catch (e) {}
  }

  function lockSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }


  // ──────────────────────────────────────────────────────────────────────
  // MODAL DEL KEYPAD
  // ──────────────────────────────────────────────────────────────────────
  /**
   * Muestra el modal del keypad y resuelve la promesa con el PIN tecleado
   * (string de 6 dígitos) cuando se completa, o rechaza si el usuario
   * cancela. NO valida el PIN — esa lógica está en verifyDevPinFlow.
   */
  function showKeypadModal() {
    return new Promise(function (resolve, reject) {
      // Construir el modal
      var overlay = document.createElement('div');
      overlay.className = 'dev-pin-overlay';
      overlay.innerHTML =
        '<div class="dev-pin-modal" role="dialog" aria-label="Ingresar PIN de Modo Dev">' +
          '<div class="dev-pin-title">Modo Desarrollador</div>' +
          '<div class="dev-pin-subtitle">Ingresa tu PIN de 6 dígitos</div>' +
          '<div class="dev-pin-dots" id="dev-pin-dots">' +
            '<span class="dev-pin-dot"></span>' +
            '<span class="dev-pin-dot"></span>' +
            '<span class="dev-pin-dot"></span>' +
            '<span class="dev-pin-dot"></span>' +
            '<span class="dev-pin-dot"></span>' +
            '<span class="dev-pin-dot"></span>' +
          '</div>' +
          '<div class="dev-pin-keypad">' +
            buildKeyButton('1') + buildKeyButton('2') + buildKeyButton('3') +
            buildKeyButton('4') + buildKeyButton('5') + buildKeyButton('6') +
            buildKeyButton('7') + buildKeyButton('8') + buildKeyButton('9') +
            '<button type="button" class="dev-pin-key dev-pin-key-clear" data-key="clear" aria-label="Borrar todo">C</button>' +
            buildKeyButton('0') +
            '<button type="button" class="dev-pin-key dev-pin-key-back" data-key="back" aria-label="Borrar último">⌫</button>' +
          '</div>' +
          '<div class="dev-pin-actions">' +
            '<button type="button" class="dev-pin-btn dev-pin-btn-cancel" data-act="cancel">Cancelar</button>' +
            '<button type="button" class="dev-pin-btn dev-pin-btn-ok" data-act="ok" disabled>Confirmar</button>' +
          '</div>' +
          /* Input invisible para móviles: forza el teclado numérico cuando
             se enfoca. inputmode="numeric" garantiza el keyboard correcto.
             readonly para que el usuario no escriba ahí directamente — la
             entrada real sucede al tocar las teclas o presionar el teclado
             físico. autofocus para abrir el teclado al mostrar el modal. */
          '<input type="text" inputmode="numeric" pattern="[0-9]*" ' +
                 'class="dev-pin-mobile-input" id="dev-pin-mobile-input" ' +
                 'maxlength="6" autocomplete="off" autocorrect="off" ' +
                 'autocapitalize="off" spellcheck="false" aria-hidden="true">' +
        '</div>';
      document.body.appendChild(overlay);

      // Estado del PIN ingresado
      var pinDigits = [];
      var dotsEls = overlay.querySelectorAll('.dev-pin-dot');
      var okBtn   = overlay.querySelector('[data-act="ok"]');
      var modalEl = overlay.querySelector('.dev-pin-modal');
      var mobileInput = overlay.querySelector('#dev-pin-mobile-input');

      // ─── Render de los dots según pinDigits ─────────────────────────
      function renderDots() {
        for (var i = 0; i < dotsEls.length; i++) {
          if (i < pinDigits.length) {
            dotsEls[i].classList.add('filled');
          } else {
            dotsEls[i].classList.remove('filled');
          }
        }
        okBtn.disabled = pinDigits.length !== PIN_LENGTH;
      }

      // ─── Manejo de entrada de un dígito ─────────────────────────────
      function pushDigit(d) {
        if (pinDigits.length >= PIN_LENGTH) return;
        pinDigits.push(d);
        renderDots();
        // Auto-confirmar cuando se completa el PIN
        if (pinDigits.length === PIN_LENGTH) {
          // Pequeña pausa visual para que el usuario vea el último dot
          setTimeout(submitPin, 150);
        }
      }

      function popDigit() {
        pinDigits.pop();
        renderDots();
      }

      function clearAllDigits() {
        pinDigits = [];
        renderDots();
      }

      // ─── Handlers de finalización ───────────────────────────────────
      function submitPin() {
        if (pinDigits.length !== PIN_LENGTH) return;
        cleanup();
        resolve(pinDigits.join(''));
      }

      function cancel() {
        cleanup();
        reject(new Error('cancelled'));
      }

      function cleanup() {
        document.removeEventListener('keydown', keyHandler);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      // ─── Click en teclas del keypad ─────────────────────────────────
      overlay.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-key]');
        if (btn) {
          var k = btn.getAttribute('data-key');
          if (k === 'clear') clearAllDigits();
          else if (k === 'back') popDigit();
          else if (/^\d$/.test(k)) pushDigit(k);
          return;
        }
        var actBtn = e.target.closest('[data-act]');
        if (actBtn) {
          var a = actBtn.getAttribute('data-act');
          if (a === 'cancel') cancel();
          else if (a === 'ok') submitPin();
          return;
        }
        // Click en el overlay (fuera del modal) cierra
        if (e.target === overlay) cancel();
      });

      // ─── Teclado físico (PC) ────────────────────────────────────────
      function keyHandler(e) {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          pushDigit(e.key);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          popDigit();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          submitPin();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }
      document.addEventListener('keydown', keyHandler);

      // ─── Mobile: focus al input invisible para abrir teclado num. ──
      // En desktop el focus al input es invisible y no estorba.
      // En mobile, esto fuerza la apertura del keyboard numérico.
      // El input está escondido visualmente, así que el usuario no nota.
      // Como respuesta del input, escuchamos 'input' y empujamos dígitos.
      mobileInput.addEventListener('input', function (e) {
        var val = e.target.value.replace(/[^0-9]/g, '');
        // Sincronizar pinDigits con el value del input
        pinDigits = val.split('').slice(0, PIN_LENGTH);
        renderDots();
        if (pinDigits.length === PIN_LENGTH) {
          setTimeout(submitPin, 150);
        }
      });
      // Esperar 150ms antes de enfocar — algunos navegadores ignoran
      // focus inmediato cuando el elemento acaba de montarse.
      setTimeout(function () {
        try { mobileInput.focus(); } catch (e) {}
      }, 150);

      renderDots();
    });
  }

  function buildKeyButton(digit) {
    return '<button type="button" class="dev-pin-key" data-key="' + digit + '" ' +
           'aria-label="Dígito ' + digit + '">' + digit + '</button>';
  }


  /**
   * Anima el modal con shake horizontal cuando el PIN es incorrecto.
   */
  function shakeModal() {
    var modal = document.querySelector('.dev-pin-modal');
    if (!modal) return;
    modal.classList.remove('shake');
    // Forzar reflow para reiniciar la animación
    void modal.offsetWidth;
    modal.classList.add('shake');
  }


  // ──────────────────────────────────────────────────────────────────────
  // FLUJO PRINCIPAL DE VERIFICACIÓN
  // ──────────────────────────────────────────────────────────────────────
  /**
   * Punto de entrada principal. El módulo 11 (dev-mode) lo llama antes
   * de activar Modo Dev. Resuelve la promesa cuando el usuario es
   * autenticado correctamente.
   */
  function verifyDevPinFlow() {
    // 1) Si la sesión ya está desbloqueada, continuar inmediatamente
    if (isUnlockedInSession()) {
      console.log('[DevPin] Sesión ya desbloqueada — sin pedir PIN');
      return Promise.resolve();
    }

    // 2) Verificar si Firebase tiene PIN configurado
    return fetchPinHash().then(function (storedHash) {
      if (!storedHash) {
        // No hay PIN: explicar cómo configurarlo
        var msg = 'No hay PIN configurado para Modo Dev.\n\n' +
                  'Para configurarlo, abre la consola del navegador (F12) ' +
                  'y ejecuta:\n\n' +
                  '   __setDevPin(\'123456\')\n\n' +
                  '(reemplaza 123456 con tu PIN de 6 dígitos)';
        window.alert(msg);
        return Promise.reject(new Error('no-pin-configured'));
      }

      // 3) Hay PIN: pedirlo al usuario y validar
      return promptAndVerify(storedHash);
    });
  }

  /**
   * Pide PIN y valida. Si es incorrecto, hace shake y vuelve a pedir
   * (hasta que el usuario cancele o acierte).
   */
  function promptAndVerify(storedHash) {
    return showKeypadModal().then(function (pin) {
      return sha256Hex(pin).then(function (hash) {
        if (hash === storedHash) {
          markUnlocked();
          console.log('[DevPin] PIN correcto — sesión desbloqueada');
          return; // resolver sin valor
        }
        // Incorrecto: shake y reintentar
        shakeModal();
        // Pequeña pausa para que se vea el shake antes del nuevo modal
        return new Promise(function (resolve) {
          setTimeout(resolve, 600);
        }).then(function () {
          return promptAndVerify(storedHash);
        });
      });
    });
  }


  // ──────────────────────────────────────────────────────────────────────
  // HELPERS DE CONSOLA (PARA RENZO)
  // ──────────────────────────────────────────────────────────────────────
  window.__setDevPin = function (pin) {
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      console.error('PIN inválido. Debe ser un string de exactamente 6 dígitos. Ejemplo: __setDevPin("123456")');
      return;
    }
    return sha256Hex(pin)
      .then(function (hash) { return savePinHash(hash); })
      .then(function () {
        console.log('✓ PIN configurado correctamente. La próxima vez que actives Modo Dev se te pedirá el PIN.');
        // Forzar relock por si la sesión actual estaba unlocked
        lockSession();
      })
      .catch(function (err) {
        console.error('Error guardando PIN:', err);
      });
  };

  window.__clearDevPin = function () {
    if (!window.confirm('¿Borrar PIN de Firebase? Modo Dev quedará sin protección hasta que configures uno nuevo con __setDevPin.')) {
      return;
    }
    return deletePinHash()
      .then(function () {
        console.log('✓ PIN borrado de Firebase.');
        lockSession();
      })
      .catch(function (err) {
        console.error('Error borrando PIN:', err);
      });
  };

  window.__lockDev = function () {
    lockSession();
    document.body.classList.remove('dev-mode');
    console.log('✓ Sesión Dev cerrada. Para reactivar, sigue el flujo normal (5 clicks + PIN).');
  };

  window.__devPinStatus = function () {
    console.log('Sesión desbloqueada en pestaña actual:', isUnlockedInSession());
    return fetchPinHash().then(function (h) {
      console.log('PIN configurado en Firebase:', h ? 'SÍ (hash: ' + h.substring(0, 8) + '...)' : 'NO');
    });
  };


  // ──────────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ──────────────────────────────────────────────────────────────────────
  window.DevPin = {
    verify:        verifyDevPinFlow,
    isUnlocked:    isUnlockedInSession,
    lock:          lockSession
  };

  console.log('[DevPin] Módulo cargado. Helpers: __setDevPin, __clearDevPin, __lockDev, __devPinStatus');
})();
