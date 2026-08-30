/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/38-pdf-cover-image.js
 *   @brief      Compone la ilustración del domingo para la portada del PDF
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r30
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   38-pdf-cover-image.js
   ============================================================================
   Lleva la ilustración litúrgica de la semana a la banda superior de la
   portada del PDF, la misma que ya se ve en la web.

   Devuelve un JPEG en dataURL listo para jsPDF. Se compone aquí y no en el
   constructor del PDF por dos razones: cargar una imagen es asíncrono y
   buildPdf es síncrono, y el velo necesita leer los píxeles, cosa que sólo
   puede hacerse en un canvas.

   ── POR QUÉ EL VELO SE CALCULA Y NO SE FIJA ───────────────────────────────

   Sobre la banda va texto dorado (#C8943C) que tiene que seguir leyéndose.
   El primer diseño buscaba una opacidad única para todas las ilustraciones y
   se midió que no existe: con las 17 del año, la opacidad que salva al
   domingo más claro apaga por completo a los catorce que ya son oscuros.

   Así que cada imagen recibe el velo MÍNIMO que necesita. Se mide el
   percentil 90 de luminancia bajo la caja del texto y se despeja la opacidad
   que lleva el contraste al objetivo. Medido sobre las 17 ilustraciones
   publicadas: catorce se quedan en el mínimo (0.30) y sólo dos suben de 0.50.

   Se usa el percentil 90 y no el máximo porque un brillo suelto detrás de una
   letra no impide leerla, pero sí desplazaría el máximo y forzaría un velo
   que no hace falta.

   ── FORMATO ───────────────────────────────────────────────────────────────
   La banda mide 210 × 100 mm. Se rasteriza a 200 ppp (1653 × 787 px), que en
   una cabecera impresa es de sobra y deja el PDF en torno a 250 KB en vez de
   los 700 KB que costaría a 300 ppp.

   Si la ilustración de la semana no existe, se devuelve null y la portada se
   dibuja como siempre. Faltar es un estado normal, no un error.

   ORDEN DE CARGA: antes del módulo 27, que la consume.
   ============================================================================ */

(function (global) {
  'use strict';

  var IMG_DIR = '../img/liturgico/';

  /* Banda de la portada, en mm y en píxeles a 200 ppp */
  var MM_W = 210, MM_H = 100;
  var PX_W = 1653, PX_H = 787;

  var VERDE = [14, 26, 12];         /* CFG.color.bgDeep  #0E1A0C */
  var ORO   = [200, 148, 60];       /* CFG.color.accent  #C8943C */

  var OBJETIVO  = 4.5;              /* contraste mínimo del dorado */
  var ALFA_MIN  = 0.30;
  var ALFA_MAX  = 0.85;
  var CALIDAD   = 0.86;             /* JPEG */
  var ESPERA_MS = 6000;

  /* Caja que ocupa realmente el texto centrado, en fracción de la banda.
     Va de la cruz (y=26mm) al lema (y=78mm), con el ancho del rótulo más
     largo. Medir fuera de aquí penalizaría zonas que ninguna letra pisa. */
  var CAJA = { x0: 0.26, y0: 0.20, x1: 0.74, y1: 0.82 };

  /* ── Colorimetría ──────────────────────────────────────────────────────── */

  function canal(v) {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function luminancia(r, g, b) {
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  }

  function contraste(l1, l2) {
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /* ── Medida y despeje del velo ─────────────────────────────────────────── */

  /**
   * Color representativo del percentil 90 de luminancia dentro de la caja de
   * texto. Se muestrea uno de cada cuatro píxeles en cada eje: con 1653×787
   * la diferencia con el barrido completo es despreciable y evita recorrer
   * 1,3 millones de píxeles en el móvil.
   */
  function colorP90(ctx) {
    var x0 = Math.round(PX_W * CAJA.x0), y0 = Math.round(PX_H * CAJA.y0);
    var w  = Math.round(PX_W * (CAJA.x1 - CAJA.x0));
    var h  = Math.round(PX_H * (CAJA.y1 - CAJA.y0));
    var d  = ctx.getImageData(x0, y0, w, h).data;

    var muestras = [];
    for (var y = 0; y < h; y += 4) {
      for (var x = 0; x < w; x += 4) {
        var i = (y * w + x) * 4;
        muestras.push([d[i], d[i + 1], d[i + 2],
                       luminancia(d[i], d[i + 1], d[i + 2])]);
      }
    }
    muestras.sort(function (a, b) { return a[3] - b[3]; });
    return muestras[Math.floor(muestras.length * 0.90)] || [0, 0, 0, 0];
  }

  /**
   * Opacidad mínima de verde que lleva ese color al contraste objetivo.
   * Por bisección: la luminancia no es lineal en el canal, así que no hay
   * despeje algebraico directo.
   */
  function alfaNecesario(p90) {
    var lOro  = luminancia(ORO[0], ORO[1], ORO[2]);
    var lTope = (lOro + 0.05) / OBJETIVO - 0.05;

    if (p90[3] <= lTope) return ALFA_MIN;

    var lo = ALFA_MIN, hi = ALFA_MAX;
    for (var k = 0; k < 24; k++) {
      var a = (lo + hi) / 2;
      var l = luminancia(p90[0] * (1 - a) + VERDE[0] * a,
                         p90[1] * (1 - a) + VERDE[1] * a,
                         p90[2] * (1 - a) + VERDE[2] * a);
      if (l > lTope) lo = a; else hi = a;
    }
    return Math.min(ALFA_MAX, Math.round(hi * 1000) / 1000);
  }

  /* ── Composición ───────────────────────────────────────────────────────── */

  function verde(a) {
    return 'rgba(' + VERDE[0] + ',' + VERDE[1] + ',' + VERDE[2] + ',' + a + ')';
  }

  /** Dibuja la imagen cubriendo la banda, recortada como object-fit: cover. */
  function pintaCubriendo(ctx, img) {
    var rDest = PX_W / PX_H;
    var rOrig = img.naturalWidth / img.naturalHeight;
    var sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

    if (rOrig > rDest) {              /* sobra ancho */
      sw = Math.round(img.naturalHeight * rDest);
      sx = Math.round((img.naturalWidth - sw) / 2);
    } else {                          /* sobra alto */
      sh = Math.round(img.naturalWidth / rDest);
      /* Anclado algo por encima del centro: en estas ilustraciones el motivo
         se apoya abajo y el aire está arriba. */
      sy = Math.round((img.naturalHeight - sh) * 0.35);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PX_W, PX_H);
  }

  /**
   * Reparto vertical del velo. Constante bajo el texto, algo más liviano en
   * el borde superior y cerrando al pie para que el corte contra el beige de
   * la página quede limpio y no se vea un canto de foto.
   */
  function pintaVelo(ctx, a) {
    var pie = Math.min(0.97, a + (1 - a) * 0.75);
    var g = ctx.createLinearGradient(0, 0, 0, PX_H);
    g.addColorStop(0.00, verde(a * 0.92));
    g.addColorStop(0.12, verde(a));
    g.addColorStop(0.85, verde(a));
    g.addColorStop(1.00, verde(pie));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PX_W, PX_H);
  }

  function cargaImagen(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var reloj = setTimeout(function () {
        img.src = '';
        reject(new Error('tiempo agotado'));
      }, ESPERA_MS);

      img.onload = function () { clearTimeout(reloj); resolve(img); };
      img.onerror = function () {
        clearTimeout(reloj);
        reject(new Error('no se pudo cargar ' + url));
      };
      img.src = url;
    });
  }

  /* ── API ───────────────────────────────────────────────────────────────── */

  /**
   * Compone la ilustración del domingo indicado.
   *
   * @param   {string}  clave  'AAAA-MM-DD'
   * @returns {Promise<{dataUrl:string, alfa:number, clave:string}|null>}
   *          null si la semana no tiene ilustración o el navegador no puede
   *          leer el canvas. Nunca rechaza: faltar no es un error.
   */
  function build(clave) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clave || '')) return Promise.resolve(null);

    return cargaImagen(IMG_DIR + clave + '-desktop.webp')
      .then(function (img) {
        var lienzo = document.createElement('canvas');
        lienzo.width = PX_W;
        lienzo.height = PX_H;
        var ctx = lienzo.getContext('2d', { willReadFrequently: true });

        /* Verde debajo: si la ilustración trae transparencia, el hueco queda
           del color de la portada y no en blanco. */
        ctx.fillStyle = verde(1);
        ctx.fillRect(0, 0, PX_W, PX_H);
        pintaCubriendo(ctx, img);

        var alfa = alfaNecesario(colorP90(ctx));
        pintaVelo(ctx, alfa);

        return {
          dataUrl: lienzo.toDataURL('image/jpeg', CALIDAD),
          alfa:    alfa,
          clave:   clave
        };
      })
      .catch(function (e) {
        if (global.console && console.info) {
          console.info('[PDFCover] sin ilustración para ' + clave + ': ' + e.message);
        }
        return null;
      });
  }

  global.PDFCoverImage = {
    build:  build,
    anchoMm: MM_W,
    altoMm:  MM_H
  };

})(window);
