/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/acceso.js
 *   @brief      Portada: «Acceder» con Google y, para Renzo, la sección Sistema
 *   @project    Cancionero Dominical
 *   @version    v3.6.10r2
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Pedido de Renzo (1-nov-2026): en la página principal, un inicio de sesión;
 * si entra él, una sección para monitorear el sistema.
 *
 * Mismo criterio que el módulo 35 (lección 4): el SDK de Firebase Auth pesa
 * ~50 KB y un visitante no debe descargarlo. Se carga solo al pulsar
 * «Acceder», o al abrir la portada en un equipo donde Renzo ya entró antes
 * (marca pdAccesoSistema en localStorage; la ponen esta portada y
 * sistema.html). La marca solo decide si vale la pena mirar la sesión: el
 * panel lo protegen las reglas de /monitor, que solo dejan leer a su UID.
 *
 * La sección muestra sistema.html en un iframe (mismo origen, misma sesión
 * de Google): así el panel conserva su hoja oscura sin chocar con la de la
 * portada, y hay un solo panel que mantener.
 */

(function () {
  'use strict';

  var RENZO = 'ihLzgmElwcRUvJrHRZOUOuMJoMF2';
  var MARCA = 'pdAccesoSistema';
  var SDK = 'https://www.gstatic.com/firebasejs/10.13.2/';
  var CONFIG = {
    apiKey: 'AIzaSyAOIgTOcdn_JZB3sWVZqDDXSsF6xCH6lx4',
    authDomain: 'coropacemdeusdominical.firebaseapp.com',
    databaseURL: 'https://coropacemdeusdominical-default-rtdb.firebaseio.com',
    projectId: 'coropacemdeusdominical',
    appId: '1:1044224786783:web:4dff30bc2917cfb3e7b6ea'
  };

  var seccion = document.getElementById('sistema');
  var marco = document.getElementById('sistema-marco');
  var aviso = document.getElementById('sistema-aviso');
  var panel = document.getElementById('sistema-panel');
  var enlaces = document.querySelectorAll('[data-acceso]');
  if (!seccion || !enlaces.length) return;

  function leerMarca() { try { return localStorage.getItem(MARCA) === '1'; } catch (e) { return false; } }
  function ponerMarca(si) {
    try { if (si) localStorage.setItem(MARCA, '1'); else localStorage.removeItem(MARCA); } catch (e) { /* privado */ }
  }

  function cargarScript(src) {
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { mal(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  var promesaAuth = null;
  var usuario = null;

  function auth() {
    if (!promesaAuth) {
      promesaAuth = cargarScript(SDK + 'firebase-app-compat.js')
        .then(function () { return cargarScript(SDK + 'firebase-auth-compat.js'); })
        .then(function () {
          if (!window.firebase.apps.length) window.firebase.initializeApp(CONFIG);
          var a = window.firebase.auth();
          a.onAuthStateChanged(pintar);
          return a;
        });
      promesaAuth.catch(function () { promesaAuth = null; });
    }
    return promesaAuth;
  }

  function mostrarAviso(texto) {
    aviso.textContent = texto;
    aviso.hidden = !texto;
  }

  function rotular(texto) {
    Array.prototype.forEach.call(enlaces, function (a) {
      a.querySelector('[data-acceso-texto]').textContent = texto;
    });
  }

  function pintar(u) {
    usuario = u || null;
    var esRenzo = !!(u && u.uid === RENZO);
    ponerMarca(esRenzo);
    rotular(esRenzo ? 'Sistema' : 'Acceder');
    seccion.hidden = !u;
    panel.hidden = !esRenzo;
    Array.prototype.forEach.call(seccion.querySelectorAll('[data-otra-cuenta]'), function (b) { b.hidden = esRenzo; });
    if (esRenzo) {
      mostrarAviso('');
      if (!marco.getAttribute('src')) marco.setAttribute('src', 'sistema.html');
    } else if (u) {
      mostrarAviso('La cuenta ' + (u.email || '') + ' no tiene acceso al panel del sistema.');
      marco.removeAttribute('src');
    } else {
      marco.removeAttribute('src');
    }
  }

  function irASeccion() {
    seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function entrar() {
    return auth().then(function (a) {
      if (a.currentUser) { pintar(a.currentUser); return a.currentUser; }
      var p = new window.firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      return a.signInWithPopup(p).then(function (r) { return r.user; });
    }).then(function (u) {
      if (u) setTimeout(irASeccion, 60);
    }).catch(function (e) {
      if (e && /popup-closed|cancelled-popup/.test(e.code || '')) return;
      seccion.hidden = false;
      panel.hidden = true;
      mostrarAviso('No se pudo iniciar sesión: ' + ((e && e.message) || e));
      irASeccion();
    });
  }

  Array.prototype.forEach.call(enlaces, function (a) {
    a.addEventListener('click', function (ev) {
      if (usuario && usuario.uid === RENZO) return;   // ya visible: el ancla lleva a la sección
      ev.preventDefault();
      entrar();
    });
  });

  Array.prototype.forEach.call(seccion.querySelectorAll('[data-salir]'), function (b) {
    b.addEventListener('click', function () {
      auth().then(function (a) { return a.signOut(); }).then(function () {
        ponerMarca(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  });

  Array.prototype.forEach.call(seccion.querySelectorAll('[data-otra-cuenta]'), function (b) {
    b.addEventListener('click', function () {
      auth().then(function (a) { return a.signOut(); }).then(entrar);
    });
  });

  // Equipo donde Renzo ya entró: se mira la sesión sin esperar el clic.
  if (leerMarca()) auth().catch(function () { /* sin red: queda «Acceder» */ });
})();
