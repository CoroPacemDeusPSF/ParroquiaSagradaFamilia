/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/39-monitor.js
 *   @brief      Registro anónimo de visitas y rastro de los administradores,
 *               para la página Sistema (sistema.html)
 *   @project    Cancionero Dominical
 *   @version    v3.6.10
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   QUÉ ES Y POR QUÉ ASÍ
   ============================================================================
   Renzo pidió el 1-nov-2026 un módulo como el «Sistema» de Binnacorp: ver
   quién entra, desde dónde, con qué equipo, adónde va y qué hace. Decidió:
   ubicación solo por zona horaria, visitantes anónimos, que lo vea solo él,
   que sea solo de lectura y plan gratuito de Firebase.

   El cancionero no tiene servidor (GitHub Pages sirve archivos y cada
   navegador habla directo con Firebase), así que el registro lo hace el
   propio navegador del visitante y lo escribe por REST en /monitor. Lo que en
   Binnacorp pone el servidor (la hora, los topes), aquí lo garantizan las
   reglas de Firebase (firebase/database.rules.v3.6.10.json):

     - solo crear, nunca editar ni borrar;
     - forma y largo de cada campo validados;
     - la hora la pone el servidor ({".sv":"timestamp"}), no el reloj del
       equipo, que puede estar mal o ser falsificado;
     - como mucho 200 eventos por sesión;
     - el rastro de un administrador solo puede escribirlo esa cuenta,
       autenticada (auth.uid === $uid): no se puede falsificar desde afuera.

   QUÉ SE GUARDA, dicho como es
     Por sesión (cabecera, una sola vez): un identificador ALEATORIO del
     navegador (no dice quién es), la zona horaria y el idioma del equipo,
     el tipo de dispositivo, el sistema operativo, el navegador, el modelo si
     el navegador lo informa, el tamaño de pantalla, por dónde entró y desde
     qué sitio llegó (solo el dominio), la página y la versión del sitio.
     Por evento: qué hizo (abrió un canto, vio acordes o contexto, buscó,
     compartió, cambió de modo, usó el asistente, un error de la página) con
     el canto o el texto de búsqueda como detalle. NO se guarda: IP, ubicación
     precisa, nombre, correo, cookies, el texto de las preguntas al asistente
     ni el contenido de lo que un administrador guarda (solo la ruta).

   QUIÉN NO SE REGISTRA
     - Navegadores con «No rastrear» o Global Privacy Control activados.
     - Robots y vistas previas de enlaces.
     - El equipo que Renzo marque desde sistema.html con «No contar este
       equipo» (las visitas anónimas; su rastro de administrador sí queda).
     - localhost, salvo con ?monitor=prueba (escribe) o ?monitor=ver (solo
       muestra en la consola lo que enviaría).

   COSTO PARA EL VISITANTE
     Ninguna librería: un archivo pequeño, un envío cada 20 segundos como
     mucho y solo si pasó algo, y uno al salir (keepalive). Si Firebase
     rechaza los envíos (por ejemplo, reglas aún sin publicar), se calla y
     deja de intentarlo durante 30 minutos.
   ============================================================================ */

(function () {
  'use strict';

  var DB = 'https://coropacemdeusdominical-default-rtdb.firebaseio.com';
  var MAX_EVENTOS = 200;            // por sesión; las reglas exigen lo mismo
  var INACTIVIDAD_MS = 30 * 60000;  // tras 30 min sin actividad, sesión nueva
  var LATIDO_MS = 2 * 60000;        // «sigue aquí», para medir permanencia
  var ENVIO_MS = 20000;
  var PAUSA_MS = 30 * 60000;

  /* ── ¿Se registra? ─────────────────────────────────────────────────── */

  var params = (function () {
    try { return new URLSearchParams(location.search); } catch (e) { return null; }
  })();
  var modoParam = params ? params.get('monitor') : null;
  var soloVer = modoParam === 'ver';
  var esLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  function leer(almacen, clave) {
    try { return window[almacen].getItem(clave); } catch (e) { return null; }
  }
  function guardar(almacen, clave, valor) {
    try { window[almacen].setItem(clave, valor); } catch (e) { /* modo privado */ }
  }

  var ua = navigator.userAgent || '';
  var esRobot = navigator.webdriver ||
    /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|telegrambot|discordbot/i.test(ua);
  var noRastrear = navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' || window.doNotTrack === '1';

  if (esRobot || noRastrear) return;
  if (esLocal && !modoParam) return;

  var pausaHasta = Number(leer('sessionStorage', 'pdMonitorPausa') || 0);
  if (pausaHasta > Date.now()) return;

  var excluirVisitas = leer('localStorage', 'pdMonitorExcluir') === '1';

  /* ── Utilidades ─────────────────────────────────────────────────────── */

  function aleatorio(n) {
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var bytes = null;
    try { bytes = crypto.getRandomValues(new Uint8Array(n)); } catch (e) { /* viejo */ }
    for (var i = 0; i < n; i++) {
      var r = bytes ? bytes[i] : Math.floor(Math.random() * 256);
      out += abc.charAt(r % abc.length);
    }
    return out;
  }

  function corta(texto, n) {
    // Sin caracteres de control, sin espacios sobrantes, y a lo sumo n.
    return String(texto == null ? '' : texto)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  }

  /* El día de Lima, no el del equipo (lección 18 del CLAUDE.md). Copia
     autónoma de window.PDLima: este archivo también carga en index.html,
     donde el módulo 21 no existe. */
  function diaLima() {
    try {
      var s = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
      var m = s.match(/(\d{4})\D(\d{2})\D(\d{2})/);
      if (m) return m[1] + '-' + m[2] + '-' + m[3];
    } catch (e) { /* sin Intl */ }
    var u = new Date(Date.now() - 5 * 3600000);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return u.getUTCFullYear() + '-' + p(u.getUTCMonth() + 1) + '-' + p(u.getUTCDate());
  }

  /* ── El equipo ──────────────────────────────────────────────────────── */

  function sistemaOperativo() {
    var m;
    if ((m = ua.match(/Android\s([\d.]+)/))) return 'Android ' + m[1].split('.')[0];
    if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      m = ua.match(/OS (\d+)[_.](\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
      return 'iPadOS' + (m ? ' ' + m[1] + '.' + m[2] : '');
    }
    if ((m = ua.match(/iPhone OS (\d+)[_.](\d+)/))) return 'iOS ' + m[1] + '.' + m[2];
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
    if ((m = ua.match(/Windows NT ([\d.]+)/))) return 'Windows NT ' + m[1];
    if ((m = ua.match(/Mac OS X (\d+)[_.](\d+)/))) return 'macOS ' + m[1] + '.' + m[2];
    if (/Linux/.test(ua)) return 'Linux';
    return 'Otro';
  }

  function navegador() {
    var m;
    // Navegadores internos de apps: importan porque algunos bloquean el zoom.
    if (/Instagram/.test(ua)) return 'Instagram (interno)';
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook (interno)';
    if (/TikTok|BytedanceWebview/.test(ua)) return 'TikTok (interno)';
    if (/Line\//.test(ua)) return 'LINE (interno)';
    if ((m = ua.match(/EdgA?\/(\d+)/))) return 'Edge ' + m[1];
    if ((m = ua.match(/OPR\/(\d+)/))) return 'Opera ' + m[1];
    if ((m = ua.match(/SamsungBrowser\/(\d+)/))) return 'Samsung ' + m[1];
    if ((m = ua.match(/CriOS\/(\d+)/))) return 'Chrome ' + m[1];
    if ((m = ua.match(/FxiOS\/(\d+)/))) return 'Firefox ' + m[1];
    if ((m = ua.match(/Firefox\/(\d+)/))) return 'Firefox ' + m[1];
    if ((m = ua.match(/Chrome\/(\d+)/))) return 'Chrome ' + m[1];
    if ((m = ua.match(/Version\/(\d+)[\d.]*.*Safari/))) return 'Safari ' + m[1];
    return 'Otro';
  }

  function tipoDispositivo() {
    var tactil = navigator.maxTouchPoints > 0;
    var esIpad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && tactil);
    if (esIpad) return 'tablet';
    if (/Android/.test(ua) && !/Mobile/.test(ua)) return 'tablet';
    if (/Mobi|iPhone|iPod|Android/.test(ua)) return 'movil';
    var lado = Math.min(screen.width || 0, screen.height || 0);
    if (tactil && lado >= 600) return 'tablet';
    return 'escritorio';
  }

  function pagina() {
    var p = location.pathname;
    if (/\/cancioneros\/dominical\.html$/.test(p)) return 'dominical';
    if (/\/cancioneros\/salmos\.html$/.test(p)) return 'salmos';
    if (/\/cancioneros\/([a-z0-9_-]+)\.html$/.test(p)) {
      return corta(p.match(/\/cancioneros\/([a-z0-9_-]+)\.html$/)[1].replace(/_/g, '-'), 20);
    }
    return 'portada';
  }

  function cpdDeDid(did) {
    var a = did && document.getElementById(did);
    var card = a && a.nextElementSibling;
    var cpd = card && card.getAttribute('data-chord-id');
    return cpd && /^cpd-\d{3}$/.test(cpd) ? cpd : '';
  }

  function entrada() {
    var ref = document.referrer || '';
    var m = ref.match(/\/c\/(cpd-\d{3})\.html/);
    if (m) return 'compartido:' + m[1];
    var h = (location.hash || '').replace('#', '');
    if (/^d\d{2,3}$/.test(h)) {
      // Los cantos aún pueden no estar en el DOM si este módulo cargara antes;
      // aquí ya están (carga al final), pero el did basta como respaldo.
      return 'canto:' + (cpdDeDid(h) || h);
    }
    return pagina();
  }

  function sitioDeOrigen() {
    try {
      if (!document.referrer) return '';
      var u = new URL(document.referrer);
      if (u.host === location.host) return '';
      return corta(u.host, 60);
    } catch (e) { return ''; }
  }

  function version() {
    var el = document.querySelector('.cancionero-version') ||
             document.querySelector('.nav-logo span');
    return el ? corta(el.textContent, 12) : '';
  }

  function cabecera() {
    var h = {
      t: { '.sv': 'timestamp' },
      v: visitante,
      tz: corta((function () {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; }
      })() || 'desconocida', 40),
      id: corta(navigator.language || '', 12),
      dp: tipoDispositivo(),
      so: corta(sistemaOperativo(), 24),
      nav: corta(navegador(), 24),
      px: corta((screen.width || 0) + 'x' + (screen.height || 0) + '@' +
                (Math.round((window.devicePixelRatio || 1) * 10) / 10), 16),
      ent: corta(entrada(), 40),
      ref: sitioDeOrigen(),
      pg: pagina(),
      ver: version(),
      pwa: !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    };
    if (modelo) h.mod = modelo;
    return h;
  }

  // Modelo del equipo: solo lo informan los navegadores Chromium, y llega
  // asíncrono. Si no llega antes del primer envío, la cabecera va sin él.
  var modelo = '';
  try {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues(['model']).then(function (v) {
        modelo = corta(v && v.model, 30);
      }).catch(function () {});
    }
  } catch (e) { /* sin UA-CH */ }

  /* ── La sesión ──────────────────────────────────────────────────────── */

  var visitante = leer('localStorage', 'pdVisitante');
  if (!visitante || !/^[A-Za-z0-9]{12}$/.test(visitante)) {
    visitante = aleatorio(12);
    guardar('localStorage', 'pdVisitante', visitante);
  }

  /* Una sesión se comparte entre páginas (portada → cancionero) mientras no
     pasen 30 minutos sin actividad. Vive en sessionStorage: una pestaña nueva
     es una sesión nueva. */
  function cargarSesion(clave) {
    try {
      var s = JSON.parse(leer('sessionStorage', clave) || 'null');
      if (s && s.sid && Date.now() - s.ultimo < INACTIVIDAD_MS) return s;
    } catch (e) { /* corrupta */ }
    return null;
  }
  function persistir(s, clave) {
    guardar('sessionStorage', clave, JSON.stringify(s));
  }

  function nuevaSesion(ruta) {
    return { sid: aleatorio(16), dia: diaLima(), inicio: Date.now(), ultimo: Date.now(),
             n: 0, cabecera: false, ruta: ruta };
  }

  var visita = excluirVisitas ? null : (cargarSesion('pdSesion') || nuevaSesion('v'));
  /* El rastro de administrador de la página anterior queda en espera: solo se
     retoma cuando AuthGate confirme, en esta página, que la cuenta sigue
     siendo administradora. Hasta entonces lo que pase va como visita. */
  var adminGuardado = cargarSesion('pdSesionAdmin');
  var admin = null;

  function sesionActiva() { return admin || visita; }

  function rutaDe(s) {
    if (s.ruta === 'v') return '/monitor/v/' + s.dia + '/' + s.sid;
    return '/monitor/a/' + s.dia + '/' + s.uid + '/' + s.sid;
  }

  /* ── Cola y envío ───────────────────────────────────────────────────── */

  var cola = [];          // { s: sesión, ev: {o,k,d}, n }
  var fallos = 0;
  var apagado = false;

  /* La portada abre el cancionero en un iframe (mismo origen): las dos
     páginas comparten sessionStorage y, por tanto, la sesión. Antes de
     numerar un evento o de decidir si va la cabecera, se relee lo guardado,
     para que las dos no usen el mismo número (las reglas rechazarían el
     segundo). Corren en el mismo hilo, así que leer y escribir seguido no
     se cruza. */
  function sincroniza(s) {
    var g = cargarSesion(s.ruta === 'v' ? 'pdSesion' : 'pdSesionAdmin');
    if (g && g.sid === s.sid) {
      s.n = Math.max(s.n, g.n);
      s.cabecera = s.cabecera || g.cabecera;
    }
  }

  function registra(k, d) {
    if (apagado) return;
    var s = sesionActiva();
    if (!s) return;
    sincroniza(s);
    if (s.n >= MAX_EVENTOS) return;
    var ev = { o: Math.max(0, Math.min(86400000, Date.now() - s.inicio)), k: k };
    var det = corta(d, 100);
    if (det) ev.d = det;
    cola.push({ s: s, ev: ev, n: s.n });
    s.n += 1;
    s.ultimo = Date.now();
    persistir(s, s.ruta === 'v' ? 'pdSesion' : 'pdSesionAdmin');
  }

  function enviar(alSalir) {
    if (apagado || !cola.length) return;
    // Agrupar por sesión: un PATCH multi-ruta por sesión con lo pendiente.
    var porSesion = {};
    cola.forEach(function (item) {
      var r = rutaDe(item.s);
      (porSesion[r] = porSesion[r] || { s: item.s, items: [] }).items.push(item);
    });
    cola = [];

    Object.keys(porSesion).forEach(function (ruta) {
      var grupo = porSesion[ruta];
      var s = grupo.s;
      var cuerpo = {};
      sincroniza(s);
      var conCabecera = !s.cabecera;
      if (conCabecera) {
        cuerpo.h = cabecera();
        // Se marca ya: la otra página no debe mandarla también mientras
        // esta respuesta viaja. Si falla por red, se desmarca abajo.
        s.cabecera = true;
        persistir(s, s.ruta === 'v' ? 'pdSesion' : 'pdSesionAdmin');
      }
      grupo.items.forEach(function (it) { cuerpo['e/' + it.n] = it.ev; });

      if (soloVer) {
        try { console.info('[monitor] enviaría a ' + ruta + ' ' + JSON.stringify(cuerpo)); } catch (e) {}
        s.cabecera = true;
        return;
      }

      window.fetch(DB + ruta + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        keepalive: !!alSalir
      }).then(function (r) {
        if (r.ok) {
          fallos = 0;
          s.cabecera = true;
          persistir(s, s.ruta === 'v' ? 'pdSesion' : 'pdSesionAdmin');
          return;
        }
        // 401/403 tiene tres causas: las reglas aún sin publicar; la cabecera
        // ya existía (una respuesta anterior se perdió); o la otra página
        // (portada/iframe) mandó la cabecera y aún no llegó. Cada evento se
        // reintenta una vez, ya sin cabecera; tras tres rechazos seguidos,
        // el monitor se calla 30 minutos.
        if (r.status === 401 || r.status === 403) {
          grupo.items.forEach(function (it) {
            if (!it.reintento) { it.reintento = true; cola.push(it); }
          });
        }
        fallos += 1;
        if (fallos >= 3) pausar();
      }).catch(function () {
        // Sin red: la cabecera no llegó y los eventos se reencolan.
        if (conCabecera) {
          s.cabecera = false;
          persistir(s, s.ruta === 'v' ? 'pdSesion' : 'pdSesionAdmin');
        }
        if (!alSalir) grupo.items.forEach(function (it) { cola.push(it); });
      });
    });
  }

  function pausar() {
    apagado = true;
    cola = [];
    guardar('sessionStorage', 'pdMonitorPausa', String(Date.now() + PAUSA_MS));
  }

  setInterval(function () { enviar(false); }, ENVIO_MS);

  /* ── Lo que se observa ──────────────────────────────────────────────── */

  registra('vista', pagina());
  if (/^canto:|^compartido:/.test(entrada())) {
    registra('canto', entrada().split(':')[1]);
  }

  // 1. El despachador central (módulo 25) usa data-action: un solo escucha
  //    en captura ve todos los clics sin tocar ningún módulo.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-action], a[href^="#d"], #lit-psalm-btn, #sl-print') : null;
    if (!t) return;

    if (t.id === 'lit-psalm-btn') { registra('salmo'); return; }
    if (t.id === 'sl-print') { registra('pdf', 'setlist'); return; }

    var accion = t.getAttribute('data-action');
    var did = t.getAttribute('data-target');

    if (!accion) {
      var h = (t.getAttribute('href') || '').replace('#', '');
      if (/^d\d{2,3}$/.test(h)) registra('canto', cpdDeDid(h) || h);
      return;
    }

    switch (accion) {
      case 'toggle-chords':
      case 'open-chords':
        // Se mira después del clic si quedó abierto: cerrar no cuenta.
        setTimeout(function () {
          var b = document.getElementById('chords-block-' + did);
          if (!b || b.classList.contains('open')) registra('acordes', cpdDeDid(did) || did);
        }, 0);
        break;
      case 'toggle-context':
        setTimeout(function () {
          var bloque = document.getElementById('context-block-' + did);
          if (!bloque || bloque.classList.contains('open')) registra('contexto', cpdDeDid(did) || did);
        }, 0);
        break;
      case 'share-song': registra('comparte', cpdDeDid(did) || did); break;
      case 'add-to-setlist': registra('agrega', did); break;
      case 'pd-share':
      case 'pd-copy-url': registra('comparte', 'sitio'); break;
      case 'sl-toggle': registra('setlist', 'abre'); break;
      case 'ai-panel-toggle': registra('ia', 'abre'); break;
      case 'ai-send':
      case 'ai-input-submit':
      case 'ai-suggest': registra('ia', 'pregunta'); break;
      case 'expand-all-chords': registra('accion', 'expandir acordes'); break;
      default: break;
    }
  }, true);

  // 2. Búsquedas: el texto, cuando el visitante deja de escribir.
  var ultimaBusqueda = '';
  var tBusqueda = null;
  document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'pd-search-input') return;
    clearTimeout(tBusqueda);
    var q = corta(e.target.value, 60).toLowerCase();
    tBusqueda = setTimeout(function () {
      if (q.length >= 3 && q !== ultimaBusqueda) {
        ultimaBusqueda = q;
        registra('busca', q);
      }
    }, 1500);
  }, true);

  // 3. Cambios de modo (Coro, Bodas, Edición, Novios), por las clases del body.
  function modoActual() {
    var c = document.body ? document.body.classList : null;
    if (!c) return 'publica';
    if (c.contains('novios-mode')) return 'novios';
    var base = c.contains('wedding-mode') ? 'bodas' : c.contains('rehearsal-mode') ? 'coro' : 'publica';
    return c.contains('dev-mode') ? base + '+edicion' : base;
  }
  var modoPrevio = modoActual();
  if (modoPrevio !== 'publica') registra('modo', modoPrevio);
  var tModo = null;
  try {
    new MutationObserver(function () {
      clearTimeout(tModo);
      tModo = setTimeout(function () {
        var m = modoActual();
        if (m !== modoPrevio) { modoPrevio = m; registra('modo', m); }
      }, 400);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch (e) { /* sin MutationObserver */ }

  // 4. Errores de la página que vería el visitante. Como mucho 5 por sesión.
  var errores = {};
  var nErrores = 0;
  function anotaError(msg) {
    msg = corta(msg, 100);
    if (!msg || msg === 'Script error.' || errores[msg] || nErrores >= 5) return;
    errores[msg] = true;
    nErrores += 1;
    registra('error', msg);
  }
  window.addEventListener('error', function (e) {
    if (!e || !e.message) return;   // errores de carga de recursos: sin mensaje
    var donde = e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + (e.lineno || 0) : '';
    anotaError(e.message + donde);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    anotaError('promesa: ' + (r && r.message ? r.message : String(r)));
  });

  // 5. Escrituras a Firebase y consultas al asistente, vistas en fetch. De las
  //    escrituras se guarda solo el método y la ruta, nunca el contenido.
  var fetchPrevio = window.fetch;
  window.fetch = function (input, init) {
    var p = fetchPrevio.apply(this, arguments);
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var metodo = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (url.indexOf('firebaseio.com') !== -1 && metodo !== 'GET' && url.indexOf('/monitor/') === -1) {
        var ruta = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\.json.*$/, '');
        p.then(function (r) {
          registra('escribe', metodo + ' ' + ruta + (r.ok ? '' : ' ✗' + r.status));
        }).catch(function () { registra('escribe', metodo + ' ' + ruta + ' ✗red'); });
      } else if (url.indexOf('generativelanguage.googleapis.com') !== -1) {
        registra('ia', 'consulta');
      }
    } catch (e) { /* nunca romper un fetch ajeno */ }
    return p;
  };

  // 6. Permanencia: un latido cada 2 minutos mientras la pestaña está a la
  //    vista, y aviso al ocultarla o volver.
  setInterval(function () {
    if (document.visibilityState === 'visible') registra('sigue');
  }, LATIDO_MS);

  var seOculto = false;   // «vuelve» solo tiene sentido tras un «oculta»
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      seOculto = true;
      registra('oculta');
      enviar(true);
    } else if (seOculto) {
      // Tras 30 minutos fuera, lo que sigue es otra sesión.
      var s = sesionActiva();
      if (s && Date.now() - s.ultimo > INACTIVIDAD_MS) {
        if (s === visita) { visita = nuevaSesion('v'); persistir(visita, 'pdSesion'); registra('vista', pagina()); }
      } else {
        registra('vuelve');
      }
    }
  });
  window.addEventListener('pagehide', function () { enviar(true); });

  // 7. Administradores: al confirmarse una sesión de administración, lo que
  //    sigue se escribe en su rastro autenticado (/monitor/a/{día}/{uid}).
  function iniciarAdmin(uid) {
    if (admin && admin.uid === uid) return;
    enviar(false);                       // lo anónimo pendiente, a su sitio
    if (adminGuardado && adminGuardado.uid === uid) {
      admin = adminGuardado;             // misma sesión, otra página
      registra('vista', pagina());
    } else {
      admin = nuevaSesion('a');
      admin.uid = uid;
      registra('entra', modoActual());
    }
    adminGuardado = null;
    persistir(admin, 'pdSesionAdmin');
  }
  function terminarAdmin() {
    if (!admin) return;
    registra('cierra');
    enviar(false);
    admin = null;
    try { sessionStorage.removeItem('pdSesionAdmin'); } catch (e) {}
  }

  if (window.AuthGate && typeof window.AuthGate.onAuthChange === 'function') {
    window.AuthGate.onAuthChange(function (user) {
      if (!user) {
        // Al cargar, AuthGate avisa «sin usuario» antes de restaurar la
        // sesión guardada: solo se cierra un rastro que ya estaba confirmado.
        if (admin && admin.confirmado) terminarAdmin();
        return;
      }
      window.AuthGate.isAdmin().then(function (ok) {
        if (!ok) { registra('noadmin'); return; }
        iniciarAdmin(user.uid);
        admin.confirmado = true;
      }).catch(function () {});
    });
  }
  // Página sin AuthGate (la portada): no hay forma de confirmar la cuenta,
  // así que lo de esta página va como visita anónima.
})();
