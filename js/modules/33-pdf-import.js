/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/33-pdf-import.js
 *   @brief      Importador de PDF SetList Bodas — lee metadata embebida y
 *               crea/sobrescribe el evento en Firebase. Solo Modo Dev.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.6
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   33-pdf-import.js — Importador PDF SetList Bodas
   ============================================================================

   FLUJO COMPLETO
     1. Usuario en Modo Dev (Bodas) hace click en "Importar PDF"
     2. Se abre un input file que acepta solo .pdf
     3. Leemos el PDF como ArrayBuffer
     4. Buscamos en los bytes del PDF el patrón "/Subject (PD-SETLIST-V1:..."
     5. Extraemos el JSON, lo parseamos
     6. Verificamos si la fecha ya tiene un SetList en Firebase
        - Si NO existe → escribimos directo
        - Si SÍ existe → dialog "¿Sobrescribir o crear evento adicional?"
          - Sobrescribir → write a la misma fecha
          - Adicional → write a fecha + sufijo "-2", "-3", etc. hasta
                         encontrar uno libre
     7. Cargamos la fecha resultante en el panel SLB

   EXTRACCIÓN DE METADATA
     jsPDF escribe el subject del PDF en uno de dos formatos comunes:
       a) Hex string:  /Subject<FEFF...>     (UTF-16 BE)
       b) Literal:     /Subject(PD-SETLIST-V1:...)  (texto plano con escape)
     Cubrimos ambos formatos en findMetadataInPdfBytes().

     En PDFs comprimidos (jsPDF usa compress:true por default), los
     metadata XMP/Info Dict viven FUERA de los streams comprimidos
     (en el trailer/Info Dict del PDF), así que se pueden buscar
     directamente en los bytes sin descomprimir.

   ACTIVACIÓN
     El botón "Importar PDF" se inyecta en el footer del panel SLB
     SOLO si body.dev-mode está activo. El módulo 30 ya tiene un
     listener para wedding-mode/novios-mode toggle; aquí escuchamos
     el toggle de dev-mode también.

   ORDEN DE CARGA: 33 (después de 32).
   ============================================================================ */

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────
  // EXTRACCIÓN DE METADATA DEL PDF
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Busca y extrae el subject del PDF que contiene la metadata
   * de un SetList exportado. Soporta dos formatos:
   *   - Hex (UTF-16 BE): /Subject<FEFF...XXXX>
   *   - Literal:        /Subject(...)
   *
   * @param {Uint8Array} bytes — bytes del PDF
   * @returns {string|null}    — el subject crudo, o null si no se encontró
   */
  function findMetadataInPdfBytes(bytes) {
    // Convertir bytes a string ASCII-safe para búsquedas (los bytes >127
    // no nos importan en este punto, solo buscamos los marcadores)
    var str = '';
    for (var i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }

    // ── Formato HEX ──────────────────────────────────────────────────
    // /Subject<FEFF00500044002D...>
    // FEFF es el BOM de UTF-16 BE
    var hexMatch = str.match(/\/Subject\s*<([0-9A-Fa-f\s]+)>/);
    if (hexMatch) {
      var hex = hexMatch[1].replace(/\s/g, '');
      // Eliminar BOM si está presente (FEFF al inicio)
      if (hex.toUpperCase().indexOf('FEFF') === 0) {
        hex = hex.slice(4);
      }
      // Convertir hex pares (UTF-16 BE) a string
      var decoded = '';
      for (var j = 0; j < hex.length - 3; j += 4) {
        var charCode = parseInt(hex.substr(j, 4), 16);
        if (charCode === 0) break; // null terminator
        decoded += String.fromCharCode(charCode);
      }
      return decoded;
    }

    // ── Formato LITERAL ──────────────────────────────────────────────
    // /Subject(PD-SETLIST-V1:{...JSON...})
    // Los caracteres especiales pueden venir escapados: \( \) \\
    // Buscamos hasta el ) que cierra, manejando paréntesis escapados.
    var litStart = str.search(/\/Subject\s*\(/);
    if (litStart !== -1) {
      var openParen = str.indexOf('(', litStart);
      // Encontrar el ) que cierra balanceando paréntesis
      var depth = 1;
      var k = openParen + 1;
      while (k < str.length && depth > 0) {
        var ch = str[k];
        if (ch === '\\') {
          k += 2; // saltar escape
          continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth === 0) break;
        k++;
      }
      if (depth === 0) {
        var raw = str.substring(openParen + 1, k);
        // Procesar escapes básicos del PDF
        return raw
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
      }
    }

    return null;
  }


  /**
   * Parsea el subject del PDF. Si tiene el prefijo "PD-SETLIST-V1:",
   * extrae el JSON y lo devuelve como objeto. Si no, devuelve null.
   */
  function parsePdSetlistMetadata(subject) {
    if (!subject) return null;
    var prefix = 'PD-SETLIST-V1:';
    if (subject.indexOf(prefix) !== 0) return null;
    var jsonStr = subject.substring(prefix.length);
    try {
      var parsed = JSON.parse(jsonStr);
      if (typeof parsed !== 'object' || parsed === null) return null;
      if (!parsed.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha)) {
        console.warn('[PDF Import] Metadata sin fecha válida');
        return null;
      }
      return parsed;
    } catch (e) {
      console.warn('[PDF Import] No se pudo parsear JSON de metadata:', e.message);
      return null;
    }
  }


  /**
   * Convierte el formato de metadata del PDF (con keys "slots" y
   * "optionals") al formato que SLB.saveSetlistData espera (con _meta
   * como sub-objeto).
   */
  function metadataToSlbPayload(metadata) {
    var payload = {};
    Object.keys(metadata.slots || {}).forEach(function (slotId) {
      payload[slotId] = metadata.slots[slotId];
    });
    payload._meta = {
      novios:    metadata.novios || '',
      optionals: metadata.optionals || []
    };
    return payload;
  }


  // ──────────────────────────────────────────────────────────────────────
  // DIALOG: SOBRESCRIBIR vs CREAR ADICIONAL
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Muestra un dialog modal preguntando qué hacer cuando ya existe un
   * SetList en la fecha. Retorna una Promise<'overwrite' | 'additional' | 'cancel'>.
   */
  function promptOverwriteOrAdditional(fecha, novios) {
    return new Promise(function (resolve) {
      // Construir el dialog en el DOM (clase dedicada para que el CSS
      // de novios-mode/wedding-mode no interfiera)
      var overlay = document.createElement('div');
      overlay.className = 'pdfi-dialog-overlay';
      overlay.innerHTML =
        '<div class="pdfi-dialog">' +
          '<h3 class="pdfi-dialog-title">Ya existe una boda en esta fecha</h3>' +
          '<p class="pdfi-dialog-body">' +
            'Hay un SetList guardado para <strong>' + escapeHtml(fecha) + '</strong>' +
            (novios ? ' (' + escapeHtml(novios) + ')' : '') + '.<br><br>' +
            '¿Qué deseas hacer con el PDF que estás importando?' +
          '</p>' +
          '<div class="pdfi-dialog-actions">' +
            '<button type="button" class="pdfi-dialog-btn pdfi-btn-cancel" data-act="cancel">Cancelar</button>' +
            '<button type="button" class="pdfi-dialog-btn pdfi-btn-overwrite" data-act="overwrite">Sobrescribir</button>' +
            '<button type="button" class="pdfi-dialog-btn pdfi-btn-additional" data-act="additional">Crear evento adicional</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      // Listener de clicks en los botones
      overlay.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn && e.target !== overlay) return;
        var action = btn ? btn.getAttribute('data-act') : 'cancel';
        cleanup();
        resolve(action);
      });

      // Esc para cancelar
      function escHandler(e) {
        if (e.key === 'Escape') {
          cleanup();
          resolve('cancel');
        }
      }
      document.addEventListener('keydown', escHandler);

      function cleanup() {
        document.removeEventListener('keydown', escHandler);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
    });
  }


  /**
   * Helper para escapar HTML en strings (evita inyección desde el
   * subject del PDF, que viene de archivo externo). Ya validamos que
   * fecha sea YYYY-MM-DD por regex, pero novios es texto libre.
   */
  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  // ──────────────────────────────────────────────────────────────────────
  // FECHA "ADICIONAL" — encontrar sufijo libre
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Encuentra la primera fecha disponible con sufijo numérico para
   * cuando hay conflicto y el usuario eligió "crear adicional".
   * Prueba "{fecha}-2", "{fecha}-3", ... hasta encontrar una libre.
   *
   * Retorna Promise<dateKey>.
   */
  function findAvailableSuffix(fecha) {
    function tryN(n) {
      var candidate = fecha + '-' + n;
      return window.SLB.hasDateInStorage(candidate).then(function (exists) {
        if (!exists) return candidate;
        // Salvaguarda de loop infinito: no más de 9 eventos en un día
        if (n >= 9) {
          throw new Error('Ya hay 8 eventos adicionales en esta fecha. Eso es demasiado.');
        }
        return tryN(n + 1);
      });
    }
    return tryN(2);
  }


  // ──────────────────────────────────────────────────────────────────────
  // FLUJO PRINCIPAL DEL IMPORTER
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Abre el input file picker, lee el PDF, extrae metadata y delega
   * al flujo de escritura a Firebase.
   */
  function importPdfFromFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      processPdfFile(file);
    });
    input.click();
  }


  function processPdfFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var bytes = new Uint8Array(e.target.result);

      var subject = findMetadataInPdfBytes(bytes);
      if (!subject) {
        window.alert('Este PDF no contiene metadata del Cancionero. ' +
                     'Solo se pueden importar PDFs generados por nuestro propio sistema.');
        return;
      }

      var metadata = parsePdSetlistMetadata(subject);
      if (!metadata) {
        window.alert('El PDF tiene metadata pero no es de un SetList Bodas válido.');
        return;
      }

      // Verificar si ya existe SetList en la fecha
      window.SLB.hasDateInStorage(metadata.fecha)
        .then(function (exists) {
          if (!exists) {
            // No conflicto: escribir directo
            return writeAndLoad(metadata.fecha, metadata);
          }

          // Conflicto: preguntar al usuario qué hacer
          return promptOverwriteOrAdditional(metadata.fecha, metadata.novios)
            .then(function (action) {
              if (action === 'cancel') {
                console.log('[PDF Import] Cancelado por el usuario');
                return;
              }
              if (action === 'overwrite') {
                return writeAndLoad(metadata.fecha, metadata);
              }
              // 'additional' → buscar sufijo libre
              return findAvailableSuffix(metadata.fecha)
                .then(function (newDateKey) {
                  return writeAndLoad(newDateKey, metadata);
                });
            });
        })
        .catch(function (err) {
          console.error('[PDF Import] Error:', err);
          window.alert('Error importando PDF: ' + (err.message || err));
        });
    };
    reader.onerror = function () {
      window.alert('No se pudo leer el archivo PDF.');
    };
    reader.readAsArrayBuffer(file);
  }


  /**
   * Escribe la metadata convertida a Firebase y luego carga la fecha
   * en el panel SLB para mostrarla.
   */
  function writeAndLoad(dateKey, metadata) {
    var payload = metadataToSlbPayload(metadata);

    return window.SLB.saveSetlistData(dateKey, payload)
      .then(function () {
        console.log('[PDF Import] SetList guardado en Firebase:', dateKey);

        // Cargar la fecha en el panel
        if (typeof window.SLB.loadDate === 'function') {
          window.SLB.loadDate(dateKey);
        }

        var msg = 'PDF importado correctamente.\n\n' +
                  'Fecha: ' + dateKey + '\n' +
                  (metadata.novios ? 'Novios: ' + metadata.novios + '\n' : '') +
                  'Cantos: ' + Object.keys(metadata.slots || {}).length;
        window.alert(msg);
      });
  }


  // ──────────────────────────────────────────────────────────────────────
  // INYECCIÓN DEL BOTÓN "IMPORTAR PDF" EN MODO DEV
  // ──────────────────────────────────────────────────────────────────────

  /**
   * El botón se agrega/elimina cuando body.dev-mode toggleea. Como el
   * Modo Dev solo aplica DENTRO de Modo Bodas (no hay Dev sin Bodas),
   * solo necesitamos preocuparnos del dev-mode.
   *
   * Inyectamos el botón en el footer del panel SLB junto al botón
   * "Grabar". Si no existe el footer todavía, esperamos un poco.
   */
  function injectImportButton() {
    if (document.getElementById('pdfi-import-btn')) return; // idempotente

    if (!document.body.classList.contains('dev-mode')) return;
    if (!document.body.classList.contains('wedding-mode')) return;

    // Buscar el footer del SLB (donde está "Grabar"). El módulo 30 usa
    // id="slb-footer" para este contenedor; los selectores con clase son
    // fallbacks para versiones más viejas.
    var footer = document.getElementById('slb-footer') ||
                 document.querySelector('.slb-footer') ||
                 document.querySelector('.slb-actions');
    if (!footer) return;

    // El módulo 30 reescribe footerEl.innerHTML cada vez que llama a
    // renderFooter() (por ej. al cambiar de fecha o al agregar un slot
    // opcional). Si insertamos como child directo del footer, nuestro
    // botón sobrevivirá solo si la siguiente render no nos pisa. Para
    // garantizar persistencia, guardamos referencia al actions container
    // (.slb-footer-actions) y, si existe, agregamos ahí. Si no existe
    // todavía, el observer reintenta cuando aparezca.
    var actionsContainer = footer.querySelector('.slb-footer-actions');
    var target = actionsContainer || footer;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pdfi-import-btn';
    btn.className = 'pdfi-import-btn';
    btn.title = 'Importar SetList desde PDF (Modo Dev)';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
        '<polyline points="17 8 12 3 7 8"></polyline>' +
        '<line x1="12" y1="3" x2="12" y2="15"></line>' +
      '</svg>' +
      '<span>Importar PDF</span>';
    btn.addEventListener('click', importPdfFromFile);
    target.appendChild(btn);
  }


  function removeImportButton() {
    var btn = document.getElementById('pdfi-import-btn');
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }


  /**
   * Observador del body para detectar cambios en las clases dev-mode/
   * wedding-mode y agregar/quitar el botón en consecuencia. Usamos
   * MutationObserver porque las clases pueden cambiarse desde varios
   * módulos (5-rehearsal-mode, 11-dev-mode, 29-wedding-mode).
   */
  function setupClassObserver() {
    var observer = new MutationObserver(function () {
      if (document.body.classList.contains('dev-mode') &&
          document.body.classList.contains('wedding-mode')) {
        injectImportButton();
      } else {
        removeImportButton();
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // También observar el panel SLB porque puede no estar en el DOM
    // todavía cuando esto se ejecuta. Reintentamos cuando el panel
    // aparezca.
    var bodyObserver = new MutationObserver(function () {
      if (document.body.classList.contains('dev-mode') &&
          document.body.classList.contains('wedding-mode')) {
        injectImportButton();
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }


  // ──────────────────────────────────────────────────────────────────────
  // API PÚBLICA
  // ──────────────────────────────────────────────────────────────────────

  window.PDFImport = {
    importPdfFromFile:           importPdfFromFile,
    findMetadataInPdfBytes:      findMetadataInPdfBytes,
    parsePdSetlistMetadata:      parsePdSetlistMetadata
  };


  // ──────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ──────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupClassObserver);
  } else {
    setupClassObserver();
  }

  console.log('[PDF Import] Módulo cargado');
})();
