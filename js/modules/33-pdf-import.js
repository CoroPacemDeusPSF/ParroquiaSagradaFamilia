/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/33-pdf-import.js
 *   @brief      Importador de PDF SetList Bodas — lee metadata embebida y
 *               crea/sobrescribe el evento en Firebase. Solo Modo Dev.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.6r4
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
   * de un SetList exportado. Soporta tres formatos que jsPDF puede
   * usar para el Info Dict:
   *   1) Hex (UTF-16 BE):       /Subject<FEFF...XXXX>
   *   2) Literal ASCII:         /Subject(texto en ASCII puro)
   *   3) Literal UTF-16 BE:     /Subject(\xFE\xFF\x00P\x00D\x00-\x00S...)
   *      ← este es el que jsPDF 4.2.1 usa por defecto cuando hay
   *        cualquier carácter Unicode (acentos, etc.). El BOM 0xFE 0xFF
   *        marca el formato; cada carácter ocupa 2 bytes después del BOM.
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

    // ── Formato 1: HEX entre <> ──────────────────────────────────────
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

    // ── Formatos 2 y 3: LITERAL entre () ─────────────────────────────
    // Buscamos hasta el ) que cierra, manejando paréntesis escapados.
    // Después de extraer el contenido entre (), detectamos si tiene
    // BOM UTF-16 BE para decodificar como tal.
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

        // ── Formato 3: literal con BOM UTF-16 BE binario ─────────────
        // jsPDF 4.2.1 escribe el subject así cuando hay caracteres
        // Unicode (acentos, etc.). Bytes: \xFE \xFF \x00 P \x00 D ...
        // Como recorrimos `bytes` con String.fromCharCode, esos bytes
        // se preservan como caracteres en `raw`.
        if (raw.length >= 2 &&
            raw.charCodeAt(0) === 0xFE &&
            raw.charCodeAt(1) === 0xFF) {
          // Decodificar UTF-16 BE: cada par de bytes (high, low) es un
          // carácter. En ASCII range, high==0x00 y low==el carácter.
          // Para caracteres acentuados (LATIN-1), el codepoint puede
          // estar en high*256+low. Cubrimos el caso general.
          var decoded3 = '';
          // PDF puede usar escapes octales (ej. \237) DENTRO del literal
          // UTF-16 incluso. Los procesamos primero antes de leer pares.
          var unescaped = unescapePdfLiteral(raw);
          for (var u = 2; u < unescaped.length - 1; u += 2) {
            var hi = unescaped.charCodeAt(u);
            var lo = unescaped.charCodeAt(u + 1);
            var cc = (hi << 8) | lo;
            if (cc === 0) break;
            decoded3 += String.fromCharCode(cc);
          }
          return decoded3;
        }

        // ── Formato 2: literal ASCII puro ────────────────────────────
        return unescapePdfLiteral(raw);
      }
    }

    return null;
  }


  /**
   * Procesa los escapes básicos de un literal PDF: \( \) \\ \n \r \t
   * y escapes octales \DDD (3 dígitos máx).
   */
  function unescapePdfLiteral(raw) {
    return raw
      .replace(/\\([0-7]{1,3})/g, function (_, oct) {
        return String.fromCharCode(parseInt(oct, 8));
      })
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
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
  // API PÚBLICA
  // ──────────────────────────────────────────────────────────────────────
  //
  // v3.6.6r2: La inyección del botón "Importar PDF" en el footer del SLB
  // se hace ahora directamente en renderFooter() del módulo 30 (más
  // confiable que un MutationObserver con timing variable). El módulo 33
  // solo expone la lógica de import; el botón llama a
  // window.PDFImport.importPdfFromFile() vía onclick handler.

  window.PDFImport = {
    importPdfFromFile:           importPdfFromFile,
    findMetadataInPdfBytes:      findMetadataInPdfBytes,
    parsePdSetlistMetadata:      parsePdSetlistMetadata
  };

  console.log('[PDF Import] Módulo cargado');
})();
