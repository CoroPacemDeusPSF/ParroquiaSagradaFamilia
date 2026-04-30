/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/27-setlist-pdf.js
 *   @brief      Orquestación: genera PDF vectorial del SetList y lo abre en el visor
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.44r6
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   27-setlist-pdf.js
   ============================================================================
   Reemplazo del módulo basado en window.print() — genera un PDF vectorial real
   con jsPDF + Cinzel + Pinyon Script y lo abre en el visor PDF nativo del
   navegador, permitiendo compartirlo por WhatsApp en pocos taps.

   FLUJO COMPLETO:
     1. Usuario tap "Imprimir PDF" en SetList toolbar
     2. Diálogo "Sin Acordes / Con Acordes"
     3. Usuario selecciona modo
     4. Recolectamos cantos del SetList (CPDs) en orden litúrgico
     5. Buscamos cada canto en window.PACEM_SONGS_DATA (poblado por módulo 00)
     6. Llamamos a window.PDFBuilder.buildPdf(songs, opts) → Blob
     7. URL.createObjectURL + window.open → visor PDF nativo
     8. Desde el visor, share del SO → WhatsApp en 1 tap

   ARQUITECTURA:
     Este módulo es solo ORQUESTACIÓN. Toda la lógica de parseo y construcción
     PDF está delegada a los módulos 26d (parser) y 26e (builder), que son
     reutilizables y testeables.

   ORDEN DE CARGA: 27 (último — depende de 23 SetList, 26b/c fuentes,
                       26d parser, 26e builder).
   ============================================================================ */

(function () {
  'use strict';

  /* ── Referencias DOM ──────────────────────────────────────────────────── */
  var dialogOverlay = document.getElementById('sl-print-dialog-overlay');
  if (!dialogOverlay) {
    console.warn('[SetListPDF] Diálogo no encontrado, módulo deshabilitado');
    return;
  }

  function openDialog()  { dialogOverlay.classList.add('open'); }
  function closeDialog() { dialogOverlay.classList.remove('open'); }

  /* Cerrar al hacer click fuera del diálogo (sobre el overlay). */
  dialogOverlay.addEventListener('click', function (ev) {
    if (ev.target === dialogOverlay) closeDialog();
  });

  /* ── Orden litúrgico canónico — lo usamos para ordenar el SetList ────── */
  var MOMENT_ORDER = [
    'Entrada', 'Piedad', 'Gloria',
    'Aclamación del Evangelio', 'Aleluya', 'Evangelio',
    'Ofertorio', 'Santo', 'Cordero de Dios', 'Cordero',
    'Comunión', 'Acción de Gracias', 'Adoración/Reflexión',
    'Salida', 'Exposición del Santísimo', 'Animación',
    '✦ Momentos Especiales ✦', 'Especial'
  ];

  function momentRank(m) {
    var i = MOMENT_ORDER.indexOf(m);
    return i === -1 ? 999 : i;
  }

  /* ── Recolectar cantos del SetList ────────────────────────────────────── */
  /**
   * Lee los slots del SetList (módulo 23) y devuelve los cantos en orden
   * litúrgico, enriquecidos con body_html / chords_html desde
   * window.PACEM_SONGS_DATA (poblado por el módulo 00 renderer).
   *
   * @returns {Array<{cpd, title, moment, body_html, chords_html}>}
   */
  function collectSetlistSongs() {
    var slots = document.querySelectorAll('#sl-slots .sl-slot');
    var collected = [];

    slots.forEach(function (slot) {
      if (slot.classList.contains('sl-slot-empty')) return;
      if (!slot.dataset.cpd) return;
      collected.push({
        cpd:    slot.dataset.cpd,
        title:  slot.dataset.title || '',
        moment: slot.dataset.moment || 'Especial'
      });
    });

    /* Ordenar por momento litúrgico (estable) */
    collected.sort(function (a, b) {
      return momentRank(a.moment) - momentRank(b.moment);
    });

    /* Enriquecer con body_html y chords_html desde el JSON global */
    var songsData = window.PACEM_SONGS_DATA;
    if (!songsData || !Array.isArray(songsData)) {
      console.error('[SetListPDF] window.PACEM_SONGS_DATA no disponible');
      return [];
    }
    var byCpd = {};
    songsData.forEach(function (s) { byCpd[s.cpd] = s; });

    var enriched = collected.map(function (item) {
      var data = byCpd[item.cpd];
      if (!data) {
        console.warn('[SetListPDF] No hay datos para ' + item.cpd);
        return null;
      }
      return {
        cpd:         item.cpd,
        title:       data.title || item.title,
        moment:      data.moment || item.moment,
        body_html:   data.body_html || '',
        chords_html: data.chords_html || ''
      };
    }).filter(function (x) { return x !== null; });

    return enriched;
  }

  /* ── Carga diferida de jsPDF (self-hosted) ────────────────────────────── */
  /**
   * jsPDF pesa ~411 KB. Lo cargamos solo cuando el usuario realmente solicita
   * un PDF (tap en una de las opciones del diálogo), no en la carga inicial
   * del cancionero.
   *
   * Self-hosted en `js/lib/jspdf.umd.min.js` para garantizar disponibilidad
   * incluso con CDNs bloqueados en redes móviles restrictivas. Una vez
   * cargado en una sesión, queda en memoria — invocaciones subsiguientes
   * resuelven inmediatamente sin nueva descarga.
   *
   * @returns {Promise<void>}
   */
  function ensureJsPDFLoaded() {
    if (window.jspdf && window.jspdf.jsPDF) {
      return Promise.resolve();
    }

    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      /* Path relativo al HTML del cancionero (cancioneros/dominical.html).
         Como el HTML está en /cancioneros/ y la lib en /js/lib/, salimos
         un nivel con `../`. Cache-bust por versión para invalidación
         coordinada con el resto del proyecto. */
      script.src = '../js/lib/jspdf.umd.min.js?v=3.2.44';
      script.async = true;
      script.onload  = function () { resolve(); };
      script.onerror = function () {
        reject(new Error('No se pudo cargar el motor PDF. Verifica tu conexión y recarga la página.'));
      };
      document.head.appendChild(script);
    });
  }

  /* ── UI feedback durante la generación ────────────────────────────────── */

  var loadingOverlay = null;

  function showLoading(message) {
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'pdf-loading-overlay';
      loadingOverlay.innerHTML =
        '<div class="pdf-loading-card">' +
          '<div class="pdf-loading-spinner"></div>' +
          '<div class="pdf-loading-msg">' + message + '</div>' +
        '</div>';
      document.body.appendChild(loadingOverlay);
    } else {
      loadingOverlay.querySelector('.pdf-loading-msg').textContent = message;
      loadingOverlay.style.display = 'flex';
    }
  }

  function hideLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }

  function showError(message) {
    hideLoading();
    var errEl = document.createElement('div');
    errEl.className = 'pdf-error-overlay';
    errEl.innerHTML =
      '<div class="pdf-error-card">' +
        '<div class="pdf-error-title">No se pudo generar el PDF</div>' +
        '<div class="pdf-error-msg">' + message + '</div>' +
        '<button class="pdf-error-close">Cerrar</button>' +
      '</div>';
    errEl.addEventListener('click', function (ev) {
      if (ev.target === errEl || ev.target.classList.contains('pdf-error-close')) {
        document.body.removeChild(errEl);
      }
    });
    document.body.appendChild(errEl);
  }

  /* ── Apertura del PDF: share directo en móvil, visor en desktop ──────── */
  /**
   * Estrategia:
   *
   *   • MÓVIL (iOS Safari 15+, Chrome Android): usamos la Web Share API
   *     (navigator.share) con un File del PDF. Esto invoca el share sheet
   *     NATIVO del sistema operativo, donde WhatsApp aparece como una
   *     opción más junto a Telegram, Mail, etc. → 1 tap a WhatsApp para
   *     enviar. Al guardar desde el share sheet, el archivo conserva el
   *     nombre descriptivo que le dimos al File.
   *
   *   • DESKTOP / navegador sin Web Share: caemos al window.open() que
   *     muestra el PDF en una pestaña nueva. Esto es lo natural en
   *     desktop donde no hay "compartir a app" — el usuario descarga
   *     o imprime físicamente.
   *
   * Web Share API requiere un user activation (gesto reciente del usuario).
   * Como esta función se invoca en cadena directa desde el click del
   * usuario en el diálogo, el gesto está activo. La generación de jsPDF
   * tarda 1-2s lo que está dentro del timeout estándar (5s).
   */
  function shareOrOpenPdf(blob, filename) {
    /* Crear File con nombre y mime explícitos — esto es lo que hace que
       al guardar mantenga el nombre, en vez del UUID del blob URL. */
    var file;
    try {
      file = new File([blob], filename, { type: 'application/pdf' });
    } catch (e) {
      /* Algunos navegadores antiguos no soportan el constructor File.
         Caemos directo a window.open. */
      return openInViewer(blob, filename);
    }

    var shareData = { files: [file] };

    /* Verificar soporte para Web Share API con archivos. canShare devuelve
       false en desktop y en móviles muy antiguos. */
    if (navigator.canShare && navigator.canShare(shareData) && navigator.share) {
      navigator.share(shareData).then(function () {
        /* Compartido OK — nada más que hacer. */
      }).catch(function (err) {
        /* AbortError = usuario canceló el share sheet. Silencioso. */
        if (err && err.name === 'AbortError') return;
        /* Otros errores (NotAllowedError por gesto perdido, etc.):
           fallback al visor para que al menos pueda ver el PDF. */
        console.warn('[PDF] navigator.share falló, fallback a visor:', err);
        openInViewer(blob, filename);
      });
      return;
    }

    /* Sin Web Share API → comportamiento desktop: abrir en visor */
    openInViewer(blob, filename);
  }

  /**
   * Abre el blob PDF en el visor del navegador. Estrategia de respaldo
   * para desktop y para casos donde Web Share falla.
   */
  function openInViewer(blob, filename) {
    var blobUrl = URL.createObjectURL(blob);

    var popup = window.open(blobUrl, '_blank');

    if (popup) {
      setTimeout(function () {
        try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ }
      }, 60000);
      return;
    }

    /* window.open bloqueado → mostrar link visible */
    showFallbackLink(blobUrl, filename);
  }

  function showFallbackLink(blobUrl, filename) {
    var overlay = document.createElement('div');
    overlay.className = 'pdf-fallback-overlay';
    overlay.innerHTML =
      '<div class="pdf-fallback-card">' +
        '<div class="pdf-fallback-title">PDF generado</div>' +
        '<div class="pdf-fallback-msg">' +
          'Toca el botón para abrirlo en el visor PDF y compartirlo:' +
        '</div>' +
        '<a class="pdf-fallback-link" href="' + blobUrl + '" target="_blank" ' +
        'rel="noopener" download="' + filename + '">' +
          'Abrir PDF' +
        '</a>' +
        '<button class="pdf-fallback-close">Cerrar</button>' +
      '</div>';

    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay || ev.target.classList.contains('pdf-fallback-close')) {
        document.body.removeChild(overlay);
        try { URL.revokeObjectURL(blobUrl); } catch (e) { /* ignore */ }
      }
    });

    document.body.appendChild(overlay);
  }

  /* ── Construir nombre de archivo descriptivo ─────────────────────────── */
  /**
   * Genera un nombre de archivo informativo basado en la fecha del próximo
   * domingo. Evitamos caracteres especiales, tildes y diéresis para
   * compatibilidad con todos los sistemas operativos y apps de mensajería.
   *
   * Ejemplo: "Cancionero Pacem Deus - Domingo 3 mayo 2026.pdf"
   *          "Cancionero Pacem Deus - Domingo 3 mayo 2026 (con acordes).pdf"
   */
  function buildFileName(withChords) {
    var today = new Date();
    var day = today.getDay();                /* 0 = domingo */
    var daysToSunday = (7 - day) % 7 || 7;
    var sunday = new Date(today);
    sunday.setDate(today.getDate() + daysToSunday);

    /* Meses sin tildes para máxima compatibilidad de filename */
    var meses = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    var dateLabel = 'Domingo ' + sunday.getDate() + ' ' +
                    meses[sunday.getMonth()] + ' ' + sunday.getFullYear();

    var base = 'Cancionero Pacem Deus - ' + dateLabel;
    var suffix = withChords ? ' (con acordes)' : '';

    return base + suffix + '.pdf';
  }

  /* ── Generador principal ──────────────────────────────────────────────── */
  /**
   * Orquesta: recolecta cantos → genera PDF → lo comparte/abre.
   *
   * @param {boolean} withChords
   */
  function generatePdf(withChords) {
    closeDialog();
    showLoading('Generando PDF...');

    /* Pequeño delay para dar tiempo al spinner a pintarse antes del trabajo
       síncrono de jsPDF. Importante: este delay NO rompe la "user activation"
       de Web Share API porque seguimos dentro de la cadena del click. */
    setTimeout(function () {
      runGeneration(withChords).catch(function (err) {
        console.error('[SetListPDF]', err);
        showError(err.message || 'Error desconocido.');
      });
    }, 50);
  }

  function runGeneration(withChords) {
    return ensureJsPDFLoaded().then(function () {
      var songs = collectSetlistSongs();
      if (songs.length === 0) {
        throw new Error('El SetList esta vacio. Agrega cantos antes de imprimir.');
      }

      if (!window.PDFBuilder || typeof window.PDFBuilder.buildPdf !== 'function') {
        throw new Error('Generador PDF no disponible. Recarga la pagina.');
      }

      var blob = window.PDFBuilder.buildPdf(songs, {
        withChords: withChords,
        dateLabel:  window.PDFBuilder.formatNextSunday()
      });

      hideLoading();

      var filename = buildFileName(withChords);

      shareOrOpenPdf(blob, filename);
    });
  }

  /* ── Conexión a los botones (delegación global) ──────────────────────── */
  document.addEventListener('click', function (ev) {
    var target = ev.target.closest('[data-action]');
    if (!target) return;

    var action = target.dataset.action;

    if (action === 'sl-print') {
      ev.preventDefault();
      openDialog();
    } else if (action === 'sl-print-no-chords') {
      ev.preventDefault();
      generatePdf(false);
    } else if (action === 'sl-print-with-chords') {
      ev.preventDefault();
      generatePdf(true);
    } else if (action === 'sl-print-cancel') {
      ev.preventDefault();
      closeDialog();
    }
  });

  console.log('[SetListPDF] Módulo PDF vectorial v3.2.44 inicializado');

})();
