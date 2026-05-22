/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/35-firebase-auth.js
 *   @brief      Autenticación con Google Sign-In. Solo Renzo escribe a
 *               Firebase; las reglas validan auth.uid === Renzo's UID.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r6
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   35-firebase-auth.js — Firebase Authentication con Google Sign-In
   ============================================================================

   ARQUITECTURA
     1. Carga el SDK Firebase Auth desde CDN bajo demanda (no en cold start)
     2. Login con Google popup
     3. Guarda idToken en memoria (Firebase SDK refresca automáticamente)
     4. Interceptor: cualquier fetch() a /firebaseio.com/ incluye ?auth=TOKEN
     5. Login persistente automático (Firebase usa indexedDB del browser)

   ROL
     Antes (r7): el PIN era la única "barrera" para Modo Dev. Pero las
     reglas Firebase permitían escritura a cualquier persona con la URL
     porque sin auth no había manera de distinguir Renzo de un atacante.
     Ahora (v3.6.7): solo Renzo (auth.uid === 'RENZO_UID') puede escribir.
     El PIN se elimina porque queda redundante.

   FLUJO DE USO
     - Feligreses: leen el cancionero sin login (lectura pública)
     - Renzo intenta editar acordes / setlist:
         1. Si NO hay sesión → muestra prompt "Iniciar sesión con Google"
         2. Click → popup Google → autoriza → idToken obtenido
         3. La acción se reintenta con auth incluido
         4. Próximas escrituras: idToken automático en background
     - El idToken se refresca automáticamente cada hora (SDK lo maneja)

   API PÚBLICA
     window.AuthGate = {
       requireAuth(cb)      → Si autenticado, ejecuta cb. Si no, prompt login → ejecuta cb.
       isAuthenticated()    → boolean, lectura síncrona del estado
       getCurrentUser()     → { uid, email, displayName, photoURL } | null
       signOut()            → Cierra sesión
       onAuthChange(cb)     → Suscribe a cambios; cb recibe el user (o null)
     }

   DEPENDENCIAS
     - SDK Firebase v10+ desde CDN (cargado lazily al primer requireAuth)
     - Firebase Auth con Google provider habilitado en Console
   ============================================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────
     CONFIGURACIÓN FIREBASE
     ──────────────────────────────────────────────────────────────────────
     Estos valores son SEGUROS de exponer en código público — son
     identificadores del proyecto, no credenciales secretas. La seguridad
     real viene de las reglas Firebase + Auth providers configurados.
     Ver: https://firebase.google.com/docs/projects/api-keys
  */
  var FIREBASE_CONFIG = {
    apiKey:      'AIzaSyAOIgTOcdn_JZB3sWVZqDDXSsF6xCH6lx4',
    authDomain: 'coropacemdeusdominical.firebaseapp.com',
    databaseURL: 'https://coropacemdeusdominical-default-rtdb.firebaseio.com',
    projectId:   'coropacemdeusdominical',
    appId:       '1:1044224786783:web:4dff30bc2917cfb3e7b6ea'
  };

  /* Indicadores de URL para el interceptor de fetch.
     Cualquier request a estos hosts recibirá el idToken automáticamente. */
  var FIREBASE_HOST = 'firebaseio.com';

  /* ──────────────────────────────────────────────────────────────────────
     ESTADO
     ────────────────────────────────────────────────────────────────────── */
  var _firebaseSDK   = null;     // referencia al SDK cargado
  var _auth          = null;     // instancia auth de Firebase
  var _currentUser   = null;     // usuario actual (objeto Firebase) o null
  var _idToken       = null;     // idToken vigente (string JWT)
  var _sdkLoadPromise = null;    // promesa de carga del SDK (singleton)
  var _authChangeListeners = []; // listeners de cambios de auth
  var _modalEl       = null;     // referencia al modal de login (si abierto)

  /* ──────────────────────────────────────────────────────────────────────
     CARGA LAZY DEL SDK FIREBASE AUTH
     ──────────────────────────────────────────────────────────────────────
     Solo se carga la primera vez que se necesita auth. Una vez cargado,
     queda en memoria y las próximas llamadas son instantáneas.

     Usamos los módulos compat de Firebase v10 porque son más simples de
     consumir en HTML estático sin bundler:
       firebase-app-compat.js     (~120 KB)
       firebase-auth-compat.js    (~180 KB)
     Total: ~300 KB pero solo se cargan al primer requireAuth().
     ────────────────────────────────────────────────────────────────────── */
  function loadFirebaseSDK() {
    if (_sdkLoadPromise) return _sdkLoadPromise;

    _sdkLoadPromise = new Promise(function (resolve, reject) {
      // Si ya estaba cargado de antes (otra parte del proyecto lo trajo)
      if (window.firebase && window.firebase.auth) {
        _firebaseSDK = window.firebase;
        return initAuth().then(resolve).catch(reject);
      }

      // Cargar primero firebase-app
      var appScript = document.createElement('script');
      appScript.src = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js';
      appScript.onload = function () {
        // Luego firebase-auth
        var authScript = document.createElement('script');
        authScript.src = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js';
        authScript.onload = function () {
          _firebaseSDK = window.firebase;
          initAuth().then(resolve).catch(reject);
        };
        authScript.onerror = function () {
          reject(new Error('No se pudo cargar Firebase Auth SDK.'));
        };
        document.head.appendChild(authScript);
      };
      appScript.onerror = function () {
        reject(new Error('No se pudo cargar Firebase App SDK.'));
      };
      document.head.appendChild(appScript);
    });

    return _sdkLoadPromise;
  }

  /* Inicialización de Firebase Auth tras carga del SDK */
  function initAuth() {
    return new Promise(function (resolve, reject) {
      try {
        // Inicializar app si no estaba (defensa contra doble init)
        if (!_firebaseSDK.apps || _firebaseSDK.apps.length === 0) {
          _firebaseSDK.initializeApp(FIREBASE_CONFIG);
        }
        _auth = _firebaseSDK.auth();

        // onAuthStateChanged se dispara INMEDIATAMENTE con el usuario
        // actual (si la sesión persistía en indexedDB) o con null.
        _auth.onAuthStateChanged(function (user) {
          _currentUser = user;
          if (user) {
            // Obtener idToken fresco
            user.getIdToken().then(function (token) {
              _idToken = token;
              notifyAuthChange(user);
            });
          } else {
            _idToken = null;
            notifyAuthChange(null);
          }
        });

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     INTERCEPTOR DE FETCH
     ──────────────────────────────────────────────────────────────────────
     Antes de cada fetch a *.firebaseio.com, agregamos ?auth=TOKEN al URL.
     Esto evita modificar los ~25 fetches existentes en módulos 10-34.

     Solo se aplica a fetch que apuntan a Firebase. Otros fetch (Gemini API,
     gstatic, etc.) pasan sin tocar.
     ────────────────────────────────────────────────────────────────────── */
  var _originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    // Solo interceptar si hay token Y la URL es de Firebase
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var isFirebase = url.indexOf(FIREBASE_HOST) !== -1;

    if (isFirebase && _idToken) {
      var separator = url.indexOf('?') === -1 ? '?' : '&';
      var newUrl = url + separator + 'auth=' + encodeURIComponent(_idToken);
      if (typeof input === 'string') {
        input = newUrl;
      } else {
        input = new Request(newUrl, input);
      }
    }
    return _originalFetch(input, init);
  };

  /* ──────────────────────────────────────────────────────────────────────
     MODAL DE LOGIN
     ──────────────────────────────────────────────────────────────────────
     Se muestra cuando una acción protegida requiere auth y no hay sesión.
     Tiene un solo botón: "Continuar con Google" → popup OAuth.
     ────────────────────────────────────────────────────────────────────── */
  function showLoginModal(message) {
    return new Promise(function (resolve, reject) {
      // Evitar duplicados
      if (_modalEl) {
        reject(new Error('login-already-in-progress'));
        return;
      }

      var overlay = document.createElement('div');
      overlay.className = 'auth-modal-overlay';
      overlay.innerHTML =
        '<div class="auth-modal" role="dialog" aria-label="Iniciar sesión">' +
          '<div class="auth-modal-icon">' +
            '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" ' +
                 'stroke="currentColor" stroke-width="1.5" ' +
                 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M12 2a5 5 0 0 0-5 5v3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5z"></path>' +
              '<circle cx="12" cy="15" r="1.5"></circle>' +
            '</svg>' +
          '</div>' +
          '<div class="auth-modal-title">Iniciar sesión</div>' +
          '<div class="auth-modal-body">' +
            (message || 'Esta acción requiere autenticación.') +
          '</div>' +
          '<button type="button" class="auth-modal-google-btn" data-act="login">' +
            '<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">' +
              '<path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>' +
              '<path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>' +
              '<path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>' +
              '<path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>' +
            '</svg>' +
            '<span>Continuar con Google</span>' +
          '</button>' +
          '<button type="button" class="auth-modal-cancel" data-act="cancel">Cancelar</button>' +
        '</div>';
      document.body.appendChild(overlay);
      _modalEl = overlay;

      function cleanup() {
        if (_modalEl && _modalEl.parentNode) _modalEl.parentNode.removeChild(_modalEl);
        _modalEl = null;
      }

      overlay.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn && e.target !== overlay) return;
        var action = btn ? btn.getAttribute('data-act') : 'cancel';

        if (action === 'cancel' || !btn) {
          cleanup();
          reject(new Error('cancelled'));
          return;
        }

        if (action === 'login') {
          // Mostrar loading state
          var btnEl = overlay.querySelector('[data-act="login"]');
          btnEl.disabled = true;
          btnEl.querySelector('span').textContent = 'Conectando...';

          loginWithGoogle()
            .then(function (user) {
              cleanup();
              resolve(user);
            })
            .catch(function (err) {
              btnEl.disabled = false;
              btnEl.querySelector('span').textContent = 'Continuar con Google';
              var errMsg = overlay.querySelector('.auth-modal-error');
              if (!errMsg) {
                errMsg = document.createElement('div');
                errMsg.className = 'auth-modal-error';
                btnEl.parentNode.insertBefore(errMsg, btnEl);
              }
              errMsg.textContent = 'Error: ' + (err.message || 'no se pudo iniciar sesión');
            });
        }
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     LOGIN
     ────────────────────────────────────────────────────────────────────── */
  function loginWithGoogle() {
    return loadFirebaseSDK().then(function () {
      var provider = new _firebaseSDK.auth.GoogleAuthProvider();
      // Solicitar email y profile (defaults pero los hacemos explícitos)
      provider.addScope('email');
      provider.addScope('profile');
      return _auth.signInWithPopup(provider).then(function (result) {
        return result.user;
      });
    });
  }

  function logout() {
    if (!_auth) return Promise.resolve();
    return _auth.signOut();
  }

  /* ──────────────────────────────────────────────────────────────────────
     API: requireAuth
     ──────────────────────────────────────────────────────────────────────
     Punto de entrada principal. Cualquier acción protegida envuelve su
     callback con esto. Si hay sesión activa, ejecuta cb directamente.
     Si no, muestra el modal de login y ejecuta cb tras autenticar.

     IMPORTANTE: requireAuth carga el SDK la primera vez. Por eso el cb
     se invoca DENTRO de un then() para que sea async-safe.
     ────────────────────────────────────────────────────────────────────── */
  function requireAuth(cb, opts) {
    opts = opts || {};
    var message = opts.message;

    // Cargar SDK si no estaba (idempotente)
    return loadFirebaseSDK().then(function () {
      // Si ya hay sesión, ejecutar cb directamente
      if (_currentUser) {
        return Promise.resolve(typeof cb === 'function' ? cb(_currentUser) : null);
      }

      // No hay sesión: pedir login
      return showLoginModal(message).then(function (user) {
        // Pequeña pausa para que onAuthStateChanged actualice _idToken
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(user); }, 100);
        });
      }).then(function (user) {
        return typeof cb === 'function' ? cb(user) : null;
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     LISTENERS DE CAMBIOS
     ────────────────────────────────────────────────────────────────────── */
  function onAuthChange(cb) {
    if (typeof cb !== 'function') return;
    _authChangeListeners.push(cb);
    // Notificar inmediatamente con estado actual
    cb(_currentUser);
  }

  function notifyAuthChange(user) {
    _authChangeListeners.forEach(function (cb) {
      try { cb(user); } catch (e) { console.warn('[Auth] listener error:', e); }
    });
  }

  /* ──────────────────────────────────────────────────────────────────────
     HELPERS DE CONSOLA (para Renzo)
     ────────────────────────────────────────────────────────────────────── */
  window.__authStatus = function () {
    if (!_currentUser) {
      console.log('No hay sesión activa.');
      return;
    }
    console.log('Usuario autenticado:');
    console.log('  email:', _currentUser.email);
    console.log('  uid:  ', _currentUser.uid);
    console.log('  displayName:', _currentUser.displayName);
    console.log('');
    console.log('Para configurar las reglas Firebase, copia este UID:');
    console.log('   ' + _currentUser.uid);
  };

  window.__signOut = function () {
    return logout().then(function () {
      console.log('Sesión cerrada.');
    });
  };

  /* ──────────────────────────────────────────────────────────────────────
     API PÚBLICA
     ────────────────────────────────────────────────────────────────────── */
  window.AuthGate = {
    requireAuth:       requireAuth,
    isAuthenticated:   function () { return _currentUser !== null; },
    getCurrentUser:    function () {
      if (!_currentUser) return null;
      return {
        uid:         _currentUser.uid,
        email:       _currentUser.email,
        displayName: _currentUser.displayName,
        photoURL:    _currentUser.photoURL
      };
    },
    signOut:           logout,
    onAuthChange:      onAuthChange,

    /* Login directo sin requerir cb (útil para botones explícitos) */
    promptLogin: function (message) {
      return loadFirebaseSDK().then(function () {
        if (_currentUser) return _currentUser;
        return showLoginModal(message);
      });
    }
  };

  console.log('[AuthGate] Módulo cargado. Helpers consola: __authStatus, __signOut');
})();
