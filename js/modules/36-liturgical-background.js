/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/36-liturgical-background.js
 *   @brief      Pinta la portada según el color litúrgico y la ilustración de la semana
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r22
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   36-liturgical-background.js
   ============================================================================
   Portada litúrgica dinámica.

     1. Lee el color litúrgico del próximo domingo desde window.LITURGICAL_DATA
        (campo `c`, ya presente en los 171 domingos) y lo escribe como atributo
        data-lit-color en <body>. El CSS hace el resto redefiniendo los tokens
        de la portada.

     2. Carga la ilustración de la semana, eligiendo entre dos composiciones
        distintas —no dos recortes de la misma— y solo la aplica si carga.

   ── POR QUÉ LA ELECCIÓN ES POR ORIENTACIÓN Y NO POR ANCHO ─────────────────

   La primera versión elegía por ancho de ventana, y eso dejaba fuera un caso
   real: un tablet en VERTICAL. Es ancho en píxeles —así que recibía la imagen
   apaisada— pero su marco es alto y estrecho, de modo que `cover` recortaba
   los lados y partía a la figura por la mitad.

   Lo que decide qué composición encaja no es el ancho, es la FORMA del marco:

     • marco apaisado  → ilustración 16:9, con el sujeto a la derecha y el
       centro despejado para la interfaz.
     • marco vertical  → ilustración 9:20, con un retrato pequeño arriba a la
       derecha que se disuelve antes de la mitad.

   Un tablet en vertical es un marco vertical, y le sirve la segunda: al
   anclarla arriba (background-position center top) el recorte se come solo la
   parte baja, que por diseño ya está vacía. Por eso no hace falta una tercera
   imagen.

   ── FORMATO ───────────────────────────────────────────────────────────────
     img/liturgico/AAAA-MM-DD-desktop.webp   apaisada 16:9
     img/liturgico/AAAA-MM-DD-mobile.webp    vertical 9:20

   Si el archivo de una semana no existe, la capa no se pinta y queda el
   degradado del color litúrgico. Faltar es un estado normal, no un error.

   ORDEN DE CARGA: DESPUÉS del módulo 21, que publica window.LITURGICAL_DATA.
   ============================================================================ */

(function () {
  'use strict';

  var IMG_DIR = '../img/liturgico/';
  var IMG_EXT = '.webp';

  var _key = null;
  var _applied = null;   // variante ya aplicada, para no repetir trabajo

  function normalizeColor(raw) {
    if (!raw) return null;
    var s = String(raw).toLowerCase().trim();
    s = s.replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
         .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
    if (s === 'violeta' || s === 'purpura' || s === 'morada') return 'morado';
    if (s === 'blanca' || s === 'dorado' || s === 'oro')      return 'blanco';
    if (s === 'roja' || s === 'encarnado')                    return 'rojo';
    if (s === 'rosado' || s === 'rosaceo')                    return 'rosa';
    if (['verde', 'morado', 'blanco', 'rojo', 'rosa'].indexOf(s) !== -1) return s;
    return null;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function upcomingSundayKey() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* Vertical = móvil y tablet en vertical. Apaisado = escritorio y cualquier
     dispositivo girado. matchMedia se usa en vez de comparar innerWidth
     porque es justamente la forma del marco lo que decide. */
  function currentVariant() {
    var portrait = window.matchMedia &&
                   window.matchMedia('(orientation: portrait)').matches;
    return portrait ? 'mobile' : 'desktop';
  }

  function loadVariant(cover, variant) {
    if (_applied === variant) return;

    var url = IMG_DIR + _key + '-' + variant + IMG_EXT;
    var probe = new Image();
    var t0 = (window.performance && performance.now) ? performance.now() : 0;

    probe.onload = function () {
      /* Si resolvió al instante venía de la caché del preload del <head>: en
         ese caso el fundido sobra y solo retrasa lo que ya está listo. Se
         reserva la disolvencia para cuando la imagen llega tarde de verdad. */
      var dt = ((window.performance && performance.now) ? performance.now() : 0) - t0;
      if (dt < 120) cover.classList.add('lit-bg-instant');
      /* URL absoluta: un url() relativo dentro de una custom property se
         resuelve contra la hoja de estilos que la consume, no contra el
         documento. probe.src ya viene resuelta. */
      cover.style.setProperty('--lit-bg-image', 'url("' + (probe.currentSrc || probe.src) + '")');
      cover.setAttribute('data-lit-variant', variant);
      cover.classList.add('lit-bg-ready');
      _applied = variant;
      console.log('[LitBg] Ilustración ' + variant + ' aplicada: ' + _key);
    };

    probe.onerror = function () {
      /* Si falta la variante vertical se intenta la apaisada antes de
         rendirse: peor encuadre, pero mejor que quedarse sin ilustración. */
      if (variant === 'mobile') {
        console.log('[LitBg] Sin variante vertical para ' + _key + ' — se prueba la apaisada.');
        loadVariant(cover, 'desktop');
        return;
      }
      console.log('[LitBg] Sin ilustración para ' + _key + ' — se usa el degradado.');
    };

    probe.src = url;
  }

  function apply() {
    var data = window.LITURGICAL_DATA;
    var cover = document.querySelector('.ceremony.dominical .ceremony-cover');
    if (!cover) return;

    _key = upcomingSundayKey();
    var entry = (data && data[_key]) || null;

    /* Fuera del calendario local o color desconocido: verde, que es el color
       del Tiempo Ordinario y el que la portada tuvo siempre. Degradar a lo de
       antes, nunca a nada. */
    var color = entry ? normalizeColor(entry.c) : null;
    document.body.setAttribute('data-lit-color', color || 'verde');

    loadVariant(cover, currentVariant());

    /* Al girar el dispositivo cambia la forma del marco y con ella la
       composición que encaja. Se reevalúa; si la variante no cambió, la
       guarda de _applied evita descargar nada. */
    if (window.matchMedia) {
      var mq = window.matchMedia('(orientation: portrait)');
      var onChange = function () { loadVariant(cover, currentVariant()); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* No se espera a DOMContentLoaded: este script va DESPUÉS de la portada en el
     HTML, así que .ceremony-cover ya existe aunque el documento siga
     parseándose. Esperar solo servía para retrasar la imagen. Si aun así no
     estuviera, se reintenta al terminar el parseo. */
  if (!document.querySelector('.ceremony.dominical .ceremony-cover')) {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  window.PdLitBg = {
    apply: apply,
    variant: currentVariant,
    preview: function (color) {
      document.body.setAttribute('data-lit-color', normalizeColor(color) || 'verde');
    }
  };

})();
