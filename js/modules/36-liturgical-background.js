/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/36-liturgical-background.js
 *   @brief      Pinta la portada según el color litúrgico y la ilustración de la semana
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r20
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   36-liturgical-background.js
   ============================================================================
   Portada litúrgica dinámica.

   Hace dos cosas y nada más:

     1. Lee el color litúrgico del próximo domingo desde window.LITURGICAL_DATA
        (campo `c`, que ya venía en los 171 domingos) y lo escribe como
        atributo data-lit-color en <body>. El CSS de lit-background.css se
        encarga del resto redefiniendo los tokens de la portada.

     2. Busca la ilustración de esa semana en img/liturgico/AAAA-MM-DD.webp.
        Solo si CARGA de verdad define --lit-bg-image y marca la portada como
        lista. Si no existe, no pasa absolutamente nada: queda el degradado.

   POR QUÉ NO VIVE EN EL MÓDULO 21
   El 21 ya calcula el próximo domingo y tiene los datos, pero su trabajo es
   pintar la tarjeta del Evangelio. Mezclar aquí el fondo lo convertiría en
   dos módulos en uno. El coste de separarlo es recalcular el domingo — cuatro
   líneas — y a cambio cada archivo tiene una sola razón para cambiar.

   ORDEN DE CARGA: DESPUÉS del módulo 21, que es quien publica
   window.LITURGICAL_DATA al final de su IIFE.

   FORMATO DE LAS IMÁGENES
     • Ruta:   img/liturgico/AAAA-MM-DD.webp  (la fecha del domingo)
     • Formato: WebP. Una ilustración en PNG son varios MB; en WebP baja a
       200-300 KB. En un cancionero que se abre desde el móvil en misa eso
       pesa más que la nitidez.
     • Proporción: apaisada, ~16:9. Se recorta con background-size:cover
       centrada al 28% de altura, así que lo importante debe caer arriba.
   ============================================================================ */

(function () {
  'use strict';

  var IMG_DIR = '../img/liturgico/';
  var IMG_EXT = '.webp';

  /* Normaliza el color del JSON a la clave que usa el CSS: sin tildes, en
     minúscula y sin espacios. 'Verde' → 'verde', 'Morado' → 'morado'. */
  function normalizeColor(raw) {
    if (!raw) return null;
    var s = String(raw).toLowerCase().trim();
    s = s.replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
         .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
    /* Sinónimos que aparecen en la tradición litúrgica. */
    if (s === 'violeta' || s === 'purpura' || s === 'morada') return 'morado';
    if (s === 'blanca' || s === 'dorado' || s === 'oro')      return 'blanco';
    if (s === 'roja' || s === 'encarnado')                    return 'rojo';
    if (s === 'rosado' || s === 'rosaceo')                    return 'rosa';
    if (['verde', 'morado', 'blanco', 'rojo', 'rosa'].indexOf(s) !== -1) return s;
    return null;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Mismo criterio que el resto del proyecto: hoy si hoy es domingo, si no
     el próximo. Así el fondo cambia el mismo domingo por la mañana, no el
     lunes siguiente. */
  function upcomingSundayKey() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function apply() {
    var data = window.LITURGICAL_DATA;
    var cover = document.querySelector('.ceremony.dominical .ceremony-cover');
    if (!cover) return;

    var key = upcomingSundayKey();
    var entry = (data && data[key]) || null;

    /* ── 1. Color litúrgico ─────────────────────────────────────────────
       Si el domingo cae fuera del calendario local (después de 2028) o el
       color no se reconoce, se deja 'verde': es el color del Tiempo
       Ordinario, con diferencia el más frecuente del año, y además es el
       que la portada tenía siempre. Degradar a lo de antes, nunca a nada. */
    var color = entry ? normalizeColor(entry.c) : null;
    document.body.setAttribute('data-lit-color', color || 'verde');

    /* ── 2. Ilustración de la semana ────────────────────────────────────
       Se precarga con un Image() en vez de asignar la URL directamente al
       CSS: así, si el archivo no existe, no se llega a pintar un hueco ni
       se ve un salto. La portada solo cambia cuando la imagen ya está
       decodificada y lista. */
    /* Dos anchos: el de 900px pesa menos de la mitad que el de 1600. En un
       cancionero que se abre desde el móvil en misa, con datos y no wifi, eso
       importa más que la nitidez. Se elige por ancho de ventana teniendo en
       cuenta la densidad de pantalla, para que un móvil de gama alta no reciba
       la imagen pequeña estirada. */
    var dpr = window.devicePixelRatio || 1;
    var needsLarge = (window.innerWidth * Math.min(dpr, 2)) > 1000;
    var url = IMG_DIR + key + (needsLarge ? '' : '@900') + IMG_EXT;
    var probe = new Image();

    probe.onload = function () {
      /* Se usa la URL ABSOLUTA que resolvió el propio Image(), no la relativa.
         Un url() relativo dentro de una custom property se resuelve contra la
         hoja de estilos que la consume, no contra el documento: con
         '../img/...' el navegador pedía /css/img/... y la imagen no cargaba.
         probe.src ya viene absoluta. Verificado en navegador. */
      var resolved = probe.currentSrc || probe.src;
      cover.style.setProperty('--lit-bg-image', 'url("' + resolved + '")');
      cover.classList.add('lit-bg-ready');
      console.log('[LitBg] Ilustración de la semana aplicada: ' + key);
    };

    probe.onerror = function () {
      /* Silencioso a propósito: no tener ilustración esta semana es un
         estado normal, no un error. Queda el degradado del color. */
      console.log('[LitBg] Sin ilustración para ' + key + ' — se usa el degradado ' + (color || 'verde') + '.');
    };

    probe.src = url;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  /* API mínima, para poder previsualizar desde la consola sin esperar a que
     llegue el domingo:  PdLitBg.preview('morado')  */
  window.PdLitBg = {
    apply: apply,
    preview: function (color) {
      document.body.setAttribute('data-lit-color', normalizeColor(color) || 'verde');
    }
  };

})();
