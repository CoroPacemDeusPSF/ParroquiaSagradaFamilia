/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/32-setlist-bodas-pdf.js
 *   @brief      Orquestador PDF del SetList Bodas — genera PDF imprimible
 *               con metadata JSON embebida para reimportación en Modo Dev.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.6r6
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   32-setlist-bodas-pdf.js — Generador PDF de SetList de Boda
   ============================================================================

   ROL EN LA ARQUITECTURA
     Reusa el builder existente (26e-pdf-builder.js, window.PDFBuilder)
     adaptándolo para el formato de SetList de Boda. El builder es
     genérico — recibe un array de cantos con metadata; este módulo se
     encarga de:
       1. Recolectar los cantos del SetList según los slots fijos+opcionales
       2. Decorarlos con _slotLabel para que el builder muestre el slot
          de boda (ej. "Entrada de la Novia") en lugar del moment del
          cancionero (ej. "Bodas").
       3. Construir el objeto metadata que se embebe en el PDF para
          permitir reimportación en Modo Dev (módulo 33).
       4. Generar el blob PDF y abrirlo en una nueva pestaña.

   FUENTES DE DATOS
     Este orquestador puede ser invocado desde dos contextos:
       a) Modo Novios → datos vienen de localStorage (window.SLN llama
          con slotsData ya parseado).
       b) Modo Dev (Bodas) → datos vienen de Firebase (window.SLB tiene
          la fecha activa cargada en memoria; aquí leemos directamente
          de la API pública de SLB).

   API PÚBLICA
     window.SLBPdf.generateAndOpen({
       fecha:     'YYYY-MM-DD',     // requerida
       novios:    'Pedro & María',  // opcional, string descriptivo
       slotsData: { slot-id: {...}, _meta: {...} },  // opcional si SLB activo
       optionals: ['foto-4', ...]   // opcional, lista de slots opc activos
     })
       → Genera PDF, lo abre en nueva pestaña.

     window.SLBPdf.buildMetadataObject(fecha, novios, slotsData, optionals)
       → Devuelve el objeto que se embebe en el PDF como JSON. Útil para
         testing y para que el módulo 33 sepa el schema esperado.

   FORMATO DE METADATA EMBEBIDA (PD-SETLIST-V1)
     El subject del PDF contiene "PD-SETLIST-V1:" seguido de un JSON
     serializado con esta estructura:

       {
         "version": "1",
         "fecha":   "2026-06-13",
         "novios":  "Pedro & María",
         "slots": {
           "ingreso-novio":    { "cpd": "cpd-149", "title": "Canon en Re Mayor" },
           "entrada-novia":    { "instrumental": true, "title": "Marcha Nupcial" },
           "piedad":           { "cpd": "cpd-100", "title": "Kyrie Eléison" },
           ...
         },
         "optionals": ["foto-4"],
         "exportedAt": "2026-05-06T12:34:56.789Z",
         "exportedBy": "novios"  // "novios" | "dev"
       }

   ORDEN DE CARGA: 32 (después de 26d, 26e, 30, 31; antes de 33).
   ============================================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────
     SLOTS DE BODA — copiados del módulo 30 para mantener este orquestador
     independiente. Si el módulo 30 cambia los slots, hay que actualizar
     aquí también. (Aceptamos esa duplicación porque el módulo 30 expone
     SLOTS_FIJOS solo a través de su API interna y queremos evitar
     acoplamientos rígidos.)

     v3.6.6r1: foto-4 promovido a slot fijo. SLOTS_OPCIONALES vacío.
     ────────────────────────────────────────────────────────────────────── */
  var SLOTS_FIJOS = [
    { id: 'ingreso-novio',    label: 'Ingreso del Novio'   },
    { id: 'entrada-novia',    label: 'Entrada de la Novia' },
    { id: 'piedad',           label: 'Piedad'              },
    { id: 'gloria',           label: 'Gloria'              },
    { id: 'evangelio',        label: 'Evangelio'           },
    { id: 'ofertorio',        label: 'Ofertorio'           },
    { id: 'santo',            label: 'Santo'               },
    { id: 'cordero',          label: 'Cordero de Dios'     },
    { id: 'comunion',         label: 'Comunión'            },
    { id: 'firma-pliego',     label: 'Firma del Pliego'    },
    { id: 'foto-1',           label: 'Fotografía 1'        },
    { id: 'foto-2',           label: 'Fotografía 2'        },
    { id: 'foto-3',           label: 'Fotografía 3'        },
    { id: 'foto-4',           label: 'Fotografía 4'        },
    { id: 'salida',           label: 'Salida de Novios'    }
  ];
  var SLOTS_OPCIONALES = [];


  /**
   * Resuelve los slots a renderizar en el orden visual correcto:
   * fijos en orden, con opcionales habilitados intercalados después
   * de su anchor (insertAfter).
   */
  function resolveSlots(enabledOptionals) {
    var result = SLOTS_FIJOS.slice();
    SLOTS_OPCIONALES.forEach(function (opt) {
      if (enabledOptionals.indexOf(opt.id) === -1) return;
      var anchorIdx = result.findIndex(function (s) { return s.id === opt.insertAfter; });
      if (anchorIdx === -1) {
        result.push(opt);
      } else {
        result.splice(anchorIdx + 1, 0, opt);
      }
    });
    return result;
  }


  /**
   * Toma slotsData (objeto plano con slot-id → { cpd, title }) y devuelve
   * un array de cantos con la metadata necesaria para el builder PDF.
   *
   * Cada item tiene:
   *   - title:       título del canto (string)
   *   - moment:      moment del cancionero (string, ej. "Bodas")
   *   - body_html:   HTML del cuerpo (puede estar vacío en instrumentales)
   *   - chords_html: HTML de los acordes (puede estar vacío)
   *   - context_html: HTML del contexto (no se renderiza en PDF, pero lo
   *                  pasamos por completitud)
   *   - _slotLabel:  label del slot de boda (override del builder)
   *
   * Para slots vacíos: NO se incluyen en el PDF (no se imprime una página
   * "Comunión: vacío"). Solo se incluyen los slots que tienen cpd o
   * marca instrumental.
   *
   * Para slots con instrumental={ instrumental: true, title: '...' }:
   * generamos un canto sintético con body_html/chords_html vacío y
   * context_html mínimo. El builder lo manejará igual que un canto
   * cualquiera (su parser es robusto a body_html vacíos).
   */
  function collectSongsForPdf(slotsData, enabledOptionals) {
    if (!window.PACEM_SONGS_DATA || !Array.isArray(window.PACEM_SONGS_DATA)) {
      throw new Error('window.PACEM_SONGS_DATA no está disponible — el cancionero todavía no terminó de cargar.');
    }

    var songsByCpd = {};
    window.PACEM_SONGS_DATA.forEach(function (s) {
      songsByCpd[s.cpd] = s;
    });

    var slots = resolveSlots(enabledOptionals || []);
    var result = [];

    slots.forEach(function (slot) {
      var entry = slotsData[slot.id];
      if (!entry) return; // slot vacío: skip

      if (entry.cpd) {
        var song = songsByCpd[entry.cpd];
        if (!song) {
          console.warn('[SLBPdf] cpd no encontrado:', entry.cpd, 'en slot', slot.id);
          return;
        }
        /* v3.6.6r6: marcamos _isInstrumental cuando:
           a) el canto pertenece al moment "Instrumentales" (cpd-149..153,
              que son las piezas clásicas: Pachelbel, Mendelssohn, etc.)
           b) o el slot es instrumentable (ingreso-novio, entrada-novia,
              salida) — esos slots típicamente reciben piezas instrumentales
              aunque ocasionalmente reciben canciones con letra.
           El builder usa este flag para layout compacto (2 instrumentales
           contiguos comparten una página). */
        var isInstrumental = (song.moment === 'Instrumentales');
        result.push(Object.assign({}, song, {
          _slotLabel: slot.label,
          _isInstrumental: isInstrumental
        }));
      } else if (entry.instrumental === true) {
        // Canto sintético para piezas instrumentales agregadas inline
        // (no del catálogo Instrumentales — eso usaría cpd).
        result.push({
          cpd:          'instrumental-' + slot.id,
          did:          'instrumental-' + slot.id,
          title:        entry.title || 'Pieza instrumental',
          moment:       'Instrumentales',
          body_html:    '',
          chords_html: '',
          context_html: '<p class="ctx-title">Pieza instrumental</p><p>Acompañamiento musical sin letra.</p>',
          _slotLabel:   slot.label,
          _isInstrumental: true
        });
      }
    });

    return result;
  }


  /**
   * Construye el objeto que se embebe como metadata JSON en el subject
   * del PDF. Será leído por el módulo 33 al importar.
   *
   * IMPORTANTE: el contenido debe ser pequeño porque el subject del PDF
   * tiene un límite práctico de unos 64KB (depende del visor). Para un
   * SetList típico de 14 slots, esto da ~1KB — cómodo.
   */
  function buildMetadataObject(fecha, novios, slotsData, optionals) {
    // Filtrar a solo los slots que tienen contenido (no _meta, no vacíos)
    var slotsClean = {};
    Object.keys(slotsData).forEach(function (key) {
      if (key === '_meta' || key === 'fecha') return;
      var entry = slotsData[key];
      if (!entry) return;
      if (entry.cpd) {
        slotsClean[key] = { cpd: entry.cpd, title: entry.title || '' };
      } else if (entry.instrumental === true) {
        slotsClean[key] = { instrumental: true, title: entry.title || '' };
      }
    });

    return {
      version:    '1',
      fecha:      fecha,
      novios:     novios || '',
      slots:      slotsClean,
      optionals:  optionals || [],
      exportedAt: new Date().toISOString(),
      exportedBy: window.PD_NOVIOS_MODE ? 'novios' : 'dev'
    };
  }


  /**
   * v3.6.6r1: Carga diferida de jsPDF (self-hosted en js/lib/).
   * Es la misma estrategia que usa el módulo 27 (PDF dominical) — la lib
   * pesa ~411 KB así que solo se carga cuando el usuario realmente pide
   * exportar PDF. Una vez cargada, queda en memoria para invocaciones
   * subsiguientes.
   *
   * El path es relativo al HTML del cancionero (cancioneros/dominical.html).
   * Cache-bust por versión global del proyecto.
   *
   * @returns {Promise<void>}
   */
  function ensureJsPDFLoaded() {
    if (window.jspdf && window.jspdf.jsPDF) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '../js/lib/jspdf.umd.min.js?v=3.6.6';
      script.async = true;
      script.onload  = function () { resolve(); };
      script.onerror = function () {
        reject(new Error('No se pudo cargar el motor PDF. Verifica tu conexión y recarga la página.'));
      };
      document.head.appendChild(script);
    });
  }


  /**
   * Función principal: arma todo, llama al builder, abre el PDF en una
   * nueva pestaña.
   *
   * Si el caller no pasa slotsData, intentamos obtenerlo del módulo SLB
   * directamente (Modo Dev/Bodas — Firebase backend). En Modo Novios el
   * caller siempre pasa slotsData explícito (vienen de localStorage).
   */
  function generateAndOpen(opts) {
    opts = opts || {};

    var fecha     = opts.fecha;
    var novios    = opts.novios || '';
    var slotsData = opts.slotsData;
    var optionals = opts.optionals;

    if (!fecha) {
      window.alert('No hay fecha de boda definida. No se puede generar el PDF.');
      return;
    }

    // Si no nos pasaron slotsData explícito, intentar obtenerlo de SLB
    if (!slotsData) {
      if (!window.SLB || typeof window.SLB.getCurrentSetlist !== 'function') {
        window.alert('No se puede leer el SetList actual. Verifica que tengas la fecha cargada.');
        return;
      }
      var snapshot = window.SLB.getCurrentSetlist();
      slotsData = snapshot.slots || {};
      novios    = novios || snapshot.novios || '';
      optionals = optionals || snapshot.optionals || [];
    }

    // v3.6.6r1: Cargar jsPDF antes de generar el PDF.
    // Antes el builder fallaba con "jsPDF no está cargado" porque la
    // lib es self-hosted y se carga bajo demanda. El módulo 27 (PDF
    // dominical) la carga al hacer click; aquí replicamos esa estrategia.
    ensureJsPDFLoaded()
      .then(function () { actuallyGeneratePdf(fecha, novios, slotsData, optionals); })
      .catch(function (err) {
        console.error('[SLBPdf] Error cargando jsPDF:', err);
        window.alert('Error generando el PDF: ' + err.message);
      });
  }


  /**
   * Generación del PDF propiamente dicha. Se llama después de que jsPDF
   * está disponible. Separada de generateAndOpen para que el flujo
   * asíncrono (carga + generación) se vea claro.
   */
  function actuallyGeneratePdf(fecha, novios, slotsData, optionals) {
    // Verificar dependencias
    if (!window.PDFBuilder || typeof window.PDFBuilder.buildPdf !== 'function') {
      window.alert('El generador PDF no está disponible. Verifica que el cancionero terminó de cargar.');
      return;
    }

    // Recolectar cantos a renderizar
    var songs;
    try {
      songs = collectSongsForPdf(slotsData, optionals);
    } catch (e) {
      window.alert(e.message);
      return;
    }

    if (songs.length === 0) {
      window.alert('No hay cantos en el SetList para exportar. Selecciona algunos cantos primero.');
      return;
    }

    // Construir metadata para embebido
    var metadata = buildMetadataObject(fecha, novios, slotsData, optionals);

    // Formatear fecha para portada del PDF
    var dateLabel = window.PDFBuilder.formatBodaDate(fecha);

    // Construir título descriptivo
    var pdfTitle = novios
      ? ('Boda de ' + novios + ' — Coro Pacem Deus')
      : ('Boda — Coro Pacem Deus');

    // Generar el PDF
    var blob;
    try {
      blob = window.PDFBuilder.buildPdf(songs, {
        withChords: false,    // las bodas no incluyen acordes en el PDF público
        dateLabel:  dateLabel,
        title:      pdfTitle,
        author:     'Coro Pacem Deus — Parroquia Sagrada Familia',
        keywords:   'boda, setlist, cancionero, coro pacem deus',
        metadata:   metadata
      });
    } catch (e) {
      console.error('[SLBPdf] Error generando PDF:', e);
      window.alert('Error generando el PDF: ' + e.message);
      return;
    }

    /* v3.6.6r2: Nombre descriptivo del archivo PDF.
       Formato pedido por Renzo: "Coro_Pacem_Deus_SetList_Año_Mes_Día.pdf"
       Ejemplo: "Coro_Pacem_Deus_SetList_2026_06_13.pdf"

       Implementación:
       - El nombre real del archivo en disco solo se controla cuando el
         usuario descarga (atributo `download` de un <a>). En `window.open`
         el navegador asigna el blob UUID como nombre tentativo.
       - Estrategia: descargamos directo con nombre descriptivo Y abrimos
         en nueva pestaña para previsualización. Así el PDF se ve en el
         visor del navegador (con su título embebido) Y queda guardado
         con nombre descriptivo en /Descargas. */
    var datePart = (fecha || '').replace(/-/g, '_'); // 2026-06-13 → 2026_06_13
    var filename = 'Coro_Pacem_Deus_SetList_' + datePart + '.pdf';

    // Abrir en nueva pestaña para previsualización
    var url = URL.createObjectURL(blob);
    var newWindow = window.open(url, '_blank');
    if (!newWindow) {
      // Si el navegador bloqueó el window.open (popup blocker), forzamos
      // descarga directa como fallback con el nombre descriptivo.
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 100);
    } else {
      // Adicionalmente, disparar descarga al disco con el nombre
      // descriptivo (sin esto, el archivo descargado por el visor PDF
      // tendría el blob UUID como nombre tentativo).
      // Usamos un <a> oculto con el mismo blob URL — el navegador
      // genera UNA descarga aunque haya 2 referencias al blob.
      var aDl = document.createElement('a');
      aDl.href = url;
      aDl.download = filename;
      aDl.style.display = 'none';
      document.body.appendChild(aDl);
      aDl.click();
      setTimeout(function () {
        if (aDl.parentNode) aDl.parentNode.removeChild(aDl);
      }, 100);
    }

    // Liberar URL después de un tiempo (el navegador ya cargó el blob)
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);

    console.log('[SLBPdf] PDF generado:', fecha, '|', songs.length, 'cantos |',
                JSON.stringify(metadata).length, 'bytes metadata');
  }


  // ── API PÚBLICA ─────────────────────────────────────────────────────────
  window.SLBPdf = {
    generateAndOpen:      generateAndOpen,
    buildMetadataObject:  buildMetadataObject,
    collectSongsForPdf:   collectSongsForPdf
  };

  console.log('[SLBPdf] Módulo cargado');
})();
