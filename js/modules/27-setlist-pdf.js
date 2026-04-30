/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/27-setlist-pdf.js
 *   @brief      PDF del SetList — clonando fielmente la presentación del cancionero
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.43
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   27-setlist-pdf.js
   ============================================================================
   Imprime el SetList del próximo domingo como un PDF que SE VEA exactamente
   como el cancionero web. La premisa: el PDF debe parecer una traducción
   1:1 del diseño de las song-cards a papel, no una versión empobrecida.

   FILOSOFÍA DEL DISEÑO (leccionado de v3.2.43 v1):
     • Cero margen de hoja → el fondo cream cubre A4 completo
     • Sin Acordes  → SOLO el contenido del .song-body (letras, chorus,
                       strophe, lp-section, song-ornament). El chord-block
                       embebido en el body se EXCLUYE.
     • Con Acordes  → SOLO el <pre> del chord-block (donde la letra y los
                       acordes ya vienen intercalados en formato monospace).
                       NO se duplica con la letra del body.
     • Tipografías idénticas al cancionero: Proza Libre, Cinzel, EB Garamond,
       Courier New. Los valores numéricos (line-height, padding, color)
       están calibrados a partir del CSS computado del cancionero.
     • Header de cada canto con fondo verde profundo a sangre completa
       (margenes negativos), igual que el .song-header real.

   ORDEN DE CARGA: 27 (después del setlist-edge-panel y event-delegation).
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

  /* ── Orden litúrgico de momentos para agrupar el setlist ── */
  var MOMENT_ORDER = [
    'Entrada', 'Piedad', 'Gloria', 'Evangelio', 'Ofertorio',
    'Santo', 'Cordero', 'Comunión', 'Salida', 'Especial'
  ];

  /* ── Recolectar slots del SetList agrupados por momento ──────────────── */
  function collectSetlistByMoment() {
    var slots = document.querySelectorAll('#sl-slots .sl-slot');
    var byMoment = {};
    slots.forEach(function (slot) {
      if (slot.classList.contains('sl-slot-empty')) return;
      if (!slot.dataset.cpd) return;
      var cpd    = slot.dataset.cpd;
      var moment = slot.dataset.moment || 'Especial';
      var title  = slot.dataset.title || '';
      if (!title) {
        var songEl = slot.querySelector('.sl-song');
        title = songEl ? songEl.textContent.trim() : '';
      }
      if (!byMoment[moment]) byMoment[moment] = [];
      byMoment[moment].push({ cpd: cpd, title: title, moment: moment });
    });
    return byMoment;
  }

  /* ── Extraer el body sin acordes ──
     Devuelve el innerHTML del .song-body PERO removiendo cualquier
     .chords-block o .chords-toggle que esté embebido (esos pertenecen al
     modo coro de la versión web). El resto se preserva tal cual:
     .lp-section, .chorus, .strophe, .song-ornament. */
  function getSongBodyHtmlWithoutChords(cpd) {
    var card = document.querySelector('.song-card[data-chord-id="' + cpd + '"]');
    if (!card) return '';
    var body = card.querySelector('.song-body');
    if (!body) return '';
    var clone = body.cloneNode(true);
    /* Eliminar elementos que solo tienen sentido en la web (botón "Ver
       acordes", chord-block embebido, controles de transpose, etc.). */
    clone.querySelectorAll('.chords-toggle, .chords-block, .transpose-bar, .editor-open-btn, .yt-play-btn, .share-song-btn, .add-setlist-btn').forEach(function (el) {
      el.parentNode && el.parentNode.removeChild(el);
    });
    return clone.innerHTML;
  }

  /* ── Detectar si un <b> es un marcador de TÍTULO ──
     El título es el ♫ que aparece al INICIO del chord-block, identificando
     el canto. Apariciones subsecuentes de ♫ (ej. "♫ Versión Corta",
     "♫ Versión Completa") son ANOTACIONES, no separadores reales —
     se manejan en el ciclo de matching, no aquí. */
  function isChordTitleMarker(content) {
    return /^\s*♫/.test(content);
  }

  /* ── Detectar si un <b> es un marcador de SECCIÓN ──
     Una sección REAL del canto está marcada con caracteres de caja
     decorativos (═══, ───, ━━━) al inicio o al final. Esto distingue
     un separador estructural ("═══ ESTROFA 1 ═══") de una anotación
     musical ("CAPO +1", "INTRO:", "Pianno", "Forte", "Versión Corta")
     que NO debe causar page-break ni generar caja independiente.

     Las anotaciones se preservan visualmente en el contenido (mantienen
     su estilo dentro del bloque) pero no fragmentan el page-flow. */
  function isChordSectionMarker(content) {
    var trimmed = content.trim();
    /* Caracteres de caja Unicode al inicio del contenido */
    if (/^[═─━]{2,}/.test(trimmed)) return true;
    /* O al final del contenido */
    if (/[═─━]{2,}\s*$/.test(trimmed)) return true;
    /* Sin caja → es anotación, no separador */
    return false;
  }

  /* ── Extraer el chord-block dividido en SECCIONES ──
     El <pre> del cancionero contiene letra + acordes intercalados. Para que
     el PDF haga page-break "inteligente" (sin cortar a la mitad de una
     sección), DIVIDIMOS el <pre> por marcadores semánticos en bloques
     atómicos.

     Detección de marcadores (en orden de prioridad):
       1. <b class="chord-title">  → título dorado
       2. <b class="chord-section"> → banda verde
       3. <b> simple cuyo contenido empiece con ♫ → título dorado (heurística)
       4. <b> simple con caracteres de caja (═══) o keywords litúrgicas
          → sección verde (heurística)

     Para los <b> simples detectados como marcadores, INYECTAMOS la clase
     correspondiente (`chord-title` o `chord-section`) en el HTML emitido,
     así heredan los estilos del CSS sin necesidad de cambiar el JSON.

     Limpieza de espacio redundante:
       • Los chord-blocks suelen tener "<\/b>\n\n[contenido]" — los \n\n
         posteriores al cierre del marcador se ven como salto extra cuando
         se renderea con white-space: pre. Normalizamos a "<\/b>\n[contenido]".
       • También se elimina el \n al inicio si la primera sección comienza
         con un salto.
       • Y se elimina el \n redundante al final de cada sección.

     Devuelve un array de strings (cada string es el HTML de una sección
     limpia, lista para meterse en un <div class="pdf-chord-section">). */
  function getSongChordsPreSections(cpd) {
    var card = document.querySelector('.song-card[data-chord-id="' + cpd + '"]');
    if (!card) return [];
    var anchor = card.previousElementSibling;
    while (anchor && !anchor.id) anchor = anchor.previousElementSibling;
    if (!anchor || !anchor.id) return [];
    var block = document.getElementById('chords-block-' + anchor.id);
    if (!block) return [];
    var pre = block.querySelector('pre');
    if (!pre) return [];

    var html = pre.innerHTML;

    /* Regex que matchea CUALQUIER <b...>...</b>. No usamos lazy en el
       interior porque el contenido de los marcadores nunca contiene
       <b> anidado. */
    var allBoldsRe = /<b([^>]*)>([\s\S]*?)<\/b>/g;
    var matches = [];
    var titleAlreadyFound = false;  /* Solo el PRIMER ♫ cuenta como título */
    var m;
    while ((m = allBoldsRe.exec(html)) !== null) {
      var fullMatch = m[0];
      var attrs     = m[1];          /* atributos como ' class="chord-title"' */
      var content   = m[2];          /* texto interior */

      /* Determinar si este <b> es un marcador estructural REAL.

         La clase HTML (chord-title / chord-section) es solo una pista —
         lo que decide si es separador real es la ESTRUCTURA del contenido:
           • Título: empieza con ♫ Y es el PRIMERO del chord-block
           • Sección: contiene caracteres de caja decorativos (═══, ───, ━━━)

         Esto evita que anotaciones que Firebase marcó con class="chord-section"
         (ej. "CAPO +1", "Pianno") se traten como separadores en el PDF. Esas
         anotaciones se quedan inline preservando su estilo (banda verde
         tenue del CSS), pero no fragmentan el page-flow del PDF. */
      var hasClassTitle   = /class=["']chord-title["']/.test(attrs);
      var hasClassSection = /class=["']chord-section["']/.test(attrs);
      var structurallyTitle   = isChordTitleMarker(content);
      var structurallySection = isChordSectionMarker(content);
      var isTitle, isSection;

      if (structurallyTitle && !titleAlreadyFound) {
        isTitle = true;  isSection = false;
        titleAlreadyFound = true;
      } else if (structurallySection) {
        isTitle = false; isSection = true;
      } else {
        /* No es marcador estructural (puede tener clase pero sin caja/♫
           que cuenten). Es anotación inline, no fragmenta el page-flow. */
        continue;
      }

      /* Si el <b> es marcador estructural pero no tiene clase, INYECTARLA
         para que tome los estilos correspondientes en el CSS del PDF.
         Si ya tiene la clase correcta, preservar el tag tal cual. */
      var renderedTag;
      var expectedClass = isTitle ? 'chord-title' : 'chord-section';
      var hasCorrectClass = (isTitle && hasClassTitle) || (isSection && hasClassSection);
      if (hasCorrectClass) {
        renderedTag = fullMatch;
      } else {
        renderedTag = '<b class="' + expectedClass + '">' + content + '</b>';
      }

      matches.push({
        start: m.index,
        end: m.index + fullMatch.length,
        renderedTag: renderedTag
      });
    }

    /* Caso degenerado: chord-block sin marcadores reconocibles. Devolvemos
       el HTML completo como un solo bloque (puede partirse entre páginas
       si es muy largo, pero no hay manera de evitarlo sin marcadores). */
    if (matches.length === 0) return [html];

    var sections = [];

    /* Helper: limpiar espacio en blanco redundante alrededor de los
       marcadores para que la letra venga inmediatamente después de
       "═══ ESTROFA N ═══" sin línea en blanco extra. */
    function cleanSection(s) {
      /* Eliminar saltos de línea iniciales y finales sobrantes */
      s = s.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
      /* Reducir múltiples saltos seguidos a uno solo entre el marcador y
         la primera línea de letra: "<\/b>\n\n\nletra" → "<\/b>\nletra".
         También aplica entre líneas internas (saltos triples → simples).
         Esto deja el contenido compacto sin perder la separación lógica. */
      s = s.replace(/(<\/b>)\s*\n\s*\n+/g, '$1\n');
      return s;
    }

    /* Contenido ANTES del primer marcador (notas de modulación, comentarios) —
       lo emitimos solo si tiene contenido visible. */
    if (matches[0].start > 0) {
      var prelude = html.substring(0, matches[0].start);
      if (prelude.replace(/\s+/g, '').length > 0) {
        sections.push(cleanSection(prelude));
      }
    }

    /* Cada sección va desde el inicio de un marcador hasta justo antes del
       siguiente marcador (o hasta el final del HTML).
       IMPORTANTE: reemplazamos el match original por la versión con clase
       inyectada (renderedTag), para que tome los estilos del CSS aunque el
       chord-block original use <b> simples. */
    for (var i = 0; i < matches.length; i++) {
      var startIdx  = matches[i].start;
      var endIdx    = (i + 1 < matches.length) ? matches[i + 1].start : html.length;
      var rawChunk  = html.substring(startIdx, endIdx);
      /* Reemplazar SOLO el primer match (que es el marcador al inicio) */
      var origTag   = html.substring(matches[i].start, matches[i].end);
      var newChunk  = matches[i].renderedTag + rawChunk.substring(origTag.length);
      sections.push(cleanSection(newChunk));
    }

    /* ── POST-PROCESO: mergear secciones de muy poco contenido ──
       Si una sección solo contiene el título (♫) o un marcador con muy
       poca letra (menos de 30 caracteres de texto plano), no merece una
       caja independiente — visualmente queda fea (header verde grande
       seguido de una caja casi vacía). En vez de eso, mergeamos esa
       sección con la SIGUIENTE para que el contenido fluya natural.

       Ejemplo típico: "Tómame Señor – Jesed" tiene <b>♫ Título</b> seguido
       inmediatamente del primer marcador de sección — la "primera sección"
       solo contiene el ♫. Mergeada con la siguiente, el ♫ aparece como
       primera línea de la sección de contenido, sin caja propia. */
    var merged = [];
    for (var j = 0; j < sections.length; j++) {
      var current = sections[j];
      /* Texto plano (sin tags) para medir la sustancia real del contenido */
      var textOnly = current.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      var isShort = textOnly.length < 30;
      var hasNext = (j + 1 < sections.length);
      if (isShort && hasNext) {
        /* Prepend al siguiente con un salto de línea de separación */
        sections[j + 1] = current + '\n' + sections[j + 1];
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /* ── Splittear el body en (primer bloque atómico) + (resto) ──
     Para evitar que el header del canto quede solo al final de página en
     el modo "Sin Acordes", agrupamos el header con el PRIMER bloque
     atómico del body (etiqueta lp-section + chorus o strophe siguiente,
     o directamente la primera chorus/strophe si no hay etiqueta antes).
     Esto se hace usando DOM parsing para no destruir el HTML. */
  function splitBodyAtFirstAtomicBlock(bodyHtml) {
    var div = document.createElement('div');
    div.innerHTML = bodyHtml;

    var children = Array.from(div.children);
    var firstParts = [];

    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      firstParts.push(c.outerHTML);
      /* Cuando encontramos el primer .chorus o .strophe, esa es la unidad
         atómica que debe viajar con el header. Todo lo anterior (etiquetas
         lp-section) entra en el primer grupo, todo lo posterior queda como
         "rest". */
      if (c.classList && (c.classList.contains('chorus') || c.classList.contains('strophe'))) {
        var rest = children.slice(i + 1).map(function (x) { return x.outerHTML; }).join('\n');
        return { firstPart: firstParts.join('\n'), rest: rest };
      }
    }

    /* No hay chorus/strophe (caso degenerado) → todo va en el primer grupo */
    return { firstPart: bodyHtml, rest: '' };
  }

  /* ── Verificar si un canto tiene chord-block ─────────────────────────── */
  function songHasChords(cpd) {
    var card = document.querySelector('.song-card[data-chord-id="' + cpd + '"]');
    if (!card) return false;
    var anchor = card.previousElementSibling;
    while (anchor && !anchor.id) anchor = anchor.previousElementSibling;
    if (!anchor || !anchor.id) return false;
    var block = document.getElementById('chords-block-' + anchor.id);
    if (!block) return false;
    var pre = block.querySelector('pre');
    return !!(pre && pre.textContent.trim().length > 0);
  }

  /* ── Fecha del próximo domingo ────────────────────────────────────────── */
  function getNextSundayDate() {
    var today = new Date();
    var daysUntilSunday = (7 - today.getDay()) % 7 || 7;
    var sunday = new Date(today);
    sunday.setDate(today.getDate() + daysUntilSunday);
    var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return 'Domingo ' + sunday.getDate() + ' de ' + months[sunday.getMonth()] + ', ' + sunday.getFullYear();
  }

  /* ──────────────────────────────────────────────────────────────────────
     CSS DEL PDF — calibrado a partir del CSS computado real del cancionero
     ────────────────────────────────────────────────────────────────────── */
  var PRINT_CSS = (
    /* Fuentes idénticas al cancionero */
    '@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond:wght@400;500&family=Great+Vibes&family=Proza+Libre:wght@400;500;600;700&display=swap");' +

    /* @page sin margen → fondo cream cubre toda la hoja A4 */
    '@page {' +
    '  size: A4;' +
    '  margin: 0;' +
    '}' +

    '* { box-sizing: border-box; }' +
    'html, body {' +
    '  margin: 0;' +
    '  padding: 0;' +
    '  background: #F6F9F2;' +
    '  color: #2A2A2A;' +
    '  font-family: "Proza Libre", Georgia, serif;' +
    '  -webkit-print-color-adjust: exact;' +
    '  print-color-adjust: exact;' +
    '}' +
    /* Container con padding interior — los márgenes "visuales" se simulan
       con padding del body, así el fondo cream sale a sangre completa */
    'body {' +
    '  padding: 0 0 14mm;' +
    '}' +

    /* ── HEADER PRINCIPAL DEL DOCUMENTO ── */
    '.pdf-doc-header {' +
    '  background: linear-gradient(180deg, #0E1A0C 0%, #142318 100%);' +
    '  color: #ECF4DC;' +
    '  text-align: center;' +
    '  padding: 14mm 12mm 10mm;' +
    '  margin-bottom: 8mm;' +
    '  border-bottom: 1.5px solid #C8943C;' +
    '}' +
    '.pdf-doc-title {' +
    '  font-family: "Great Vibes", cursive;' +
    '  font-size: 42pt;' +
    '  color: #C8943C;' +
    '  line-height: 1;' +
    '  margin: 0;' +
    '}' +
    '.pdf-doc-subtitle {' +
    '  font-family: "Cinzel", serif;' +
    '  font-size: 9pt;' +
    '  letter-spacing: 0.3em;' +
    '  text-transform: uppercase;' +
    '  color: rgba(176,216,136,0.8);' +
    '  margin-top: 3mm;' +
    '}' +
    '.pdf-doc-date {' +
    '  font-family: "Cormorant Garamond", serif;' +
    '  font-style: italic;' +
    '  font-size: 12pt;' +
    '  color: rgba(236,244,220,0.85);' +
    '  margin-top: 2mm;' +
    '}' +

    /* ── BANDA DE MOMENTO LITÚRGICO ── */
    '.pdf-moment {' +
    '  display: flex;' +
    '  align-items: center;' +
    '  gap: 5mm;' +
    '  margin: 8mm 12mm 5mm;' +
    '  page-break-after: avoid;' +
    '  break-after: avoid;' +
    '}' +
    '.pdf-moment-line {' +
    '  flex: 1;' +
    '  height: 1px;' +
    '  background: linear-gradient(to right, transparent, rgba(200,148,60,0.4), transparent);' +
    '}' +
    '.pdf-moment-label {' +
    '  font-family: "Cinzel", serif;' +
    '  font-weight: 500;' +
    '  font-size: 11pt;' +
    '  letter-spacing: 0.35em;' +
    '  text-transform: uppercase;' +
    '  color: #6B7A4E;' +
    '}' +

    /* ── CARD DE CANTO ──
       NO usar page-break-inside: avoid aquí — eso empuja el canto entero
       a la siguiente página si no cabe completo, dejando páginas con solo
       el header del documento. La granularidad de "no romper" debe estar
       a nivel de PÁRRAFO (.chorus, .strophe, .pdf-chord-section), no del
       canto entero. */
    '.pdf-song {' +
    '  margin: 0 12mm 6mm;' +
    '  border-left: 1px solid rgba(107,158,74,0.18);' +
    '}' +

    /* Header del canto — fondo verde profundo como .song-header del cancionero.
       page-break-after: avoid evita que el header del canto quede solo al
       final de una página sin contenido debajo. */
    '.pdf-song-header {' +
    '  page-break-after: avoid;' +
    '  break-after: avoid;' +
    '  background: linear-gradient(180deg, #0E1A0C 0%, #142318 100%);' +
    '  color: #ECF4DC;' +
    '  padding: 4mm 7mm 3.5mm;' +
    '  display: flex;' +
    '  align-items: center;' +
    '  gap: 4mm;' +
    '}' +

    /* Wrapper indivisible: header + primer bloque de contenido.
       Esto garantiza que el título de un canto NUNCA quede solo al final
       de una página. Si el header + primer bloque no caben juntos, ambos
       pasan a la siguiente página. El resto del canto fluye libremente,
       con cada estrofa/coro/sección protegida individualmente. */
    '.pdf-song-first-group {' +
    '  page-break-inside: avoid;' +
    '  break-inside: avoid;' +
    '}' +

    /* El body del canto NO debe duplicar el padding superior cuando está
       dentro del first-group (ya viene pegado al header) ni en el "rest"
       que continúa después (debe quedarse con flow normal). */
    '.pdf-song-first-group .pdf-song-body {' +
    '  padding-top: 4mm;' +
    '}' +
    '.pdf-song-body-rest {' +
    '  padding-top: 0 !important;' +
    '}' +
    '.pdf-song-num {' +
    '  font-family: "Cinzel", serif;' +
    '  font-size: 14pt;' +
    '  font-weight: 600;' +
    '  color: #C8943C;' +
    '  min-width: 9mm;' +
    '  text-align: center;' +
    '  border-right: 1px solid rgba(200,148,60,0.3);' +
    '  padding-right: 3mm;' +
    '  align-self: stretch;' +
    '  display: flex;' +
    '  align-items: center;' +
    '  justify-content: center;' +
    '}' +
    '.pdf-song-header-text {' +
    '  flex: 1;' +
    '  display: flex;' +
    '  flex-direction: column;' +
    '  gap: 0.5mm;' +
    '}' +
    '.pdf-song-moment-tag {' +
    '  font-family: "EB Garamond", serif;' +
    '  font-size: 8pt;' +
    '  letter-spacing: 0.2em;' +
    '  text-transform: uppercase;' +
    '  color: rgba(176,216,136,0.85);' +
    '}' +
    '.pdf-song-title {' +
    '  font-family: "Cinzel", serif;' +
    '  font-size: 13pt;' +
    '  font-weight: 600;' +
    '  color: #ECF4DC;' +
    '  line-height: 1.1;' +
    '}' +

    /* ── BODY DEL CANTO (Sin Acordes) ── */
    '.pdf-song-body {' +
    '  padding: 5mm 7mm 6mm;' +
    '  font-family: "Proza Libre", Georgia, serif;' +
    '  font-size: 10.5pt;' +
    '  line-height: 1.55;' +
    '  color: #2A2A2A;' +
    '}' +
    /* Sección (Coro / Estrofa N / Puente / etc.) */
    '.pdf-song-body .lp-section,' +
    '.pdf-song-body .lp-coro,' +
    '.pdf-song-body .lp-estrofa {' +
    '  font-family: "Cinzel", serif;' +
    '  font-size: 8pt;' +
    '  letter-spacing: 0.28em;' +
    '  text-transform: uppercase;' +
    '  color: #7A5200;' +
    '  display: block;' +
    '  margin: 4mm 0 1.5mm;' +
    '  padding-bottom: 0.8mm;' +
    '  border-bottom: 1px dotted rgba(122,82,0,0.15);' +
    '  page-break-after: avoid;' +
    '  break-after: avoid;' +
    '}' +
    '.pdf-song-body .lp-coro { font-weight: 700; }' +
    '.pdf-song-body .lp-estrofa { font-weight: 400; }' +
    '.pdf-song-body .lp-section:first-child,' +
    '.pdf-song-body .lp-coro:first-child,' +
    '.pdf-song-body .lp-estrofa:first-child { margin-top: 0; }' +

    /* Coro — bloque destacado con borde verde.
       page-break-inside: avoid → si el coro no cabe al final de página,
       pasa entero a la siguiente. */
    '.pdf-song-body .chorus {' +
    '  page-break-inside: avoid;' +
    '  break-inside: avoid;' +
    '  background: rgba(107,158,74,0.06);' +
    '  border-left: 2.5px solid rgb(107,158,74);' +
    '  border-radius: 0 2px 2px 0;' +
    '  padding: 3mm 5mm;' +
    '  margin: 2mm 0 3mm;' +
    '}' +
    '.pdf-song-body .chorus p {' +
    '  margin: 0;' +
    '  padding: 0.3mm 0;' +
    '}' +

    /* Estrofa — sin fondo, solo separación vertical.
       page-break-inside: avoid → la estrofa no se parte a la mitad. */
    '.pdf-song-body .strophe {' +
    '  page-break-inside: avoid;' +
    '  break-inside: avoid;' +
    '  margin: 0 0 3mm;' +
    '  padding: 0 1mm;' +
    '}' +
    '.pdf-song-body .strophe p {' +
    '  margin: 0;' +
    '  padding: 0.3mm 0;' +
    '}' +

    /* Etiqueta de sección (Coro, Estrofa N) — no separar de su párrafo
       siguiente al final de página. */
    '.pdf-song-body .lp-section,' +
    '.pdf-song-body .lp-coro,' +
    '.pdf-song-body .lp-estrofa { page-break-after: avoid; break-after: avoid; }' +

    /* Cualquier <p> suelto */
    '.pdf-song-body p { margin: 0; padding: 0.3mm 0; }' +

    /* Ornamento ✦ ✦ ✦ */
    '.pdf-song-body .song-ornament {' +
    '  text-align: center;' +
    '  color: rgba(107,158,74,0.4);' +
    '  letter-spacing: 0.5em;' +
    '  font-size: 11pt;' +
    '  margin: 4mm 0 0;' +
    '}' +

    /* ── BLOQUE DE ACORDES (Con Acordes) ──
       Refactorizado: el wrapper .pdf-song-chords es solo un contenedor
       semántico (sin fondo ni borde). Cada SECCIÓN del canto se renderiza
       como un .pdf-chord-section independiente, lo cual permite que el
       navegador haga page-break SOLO entre secciones — nunca a la mitad
       de una estrofa o coro. Si una sección no cabe al final de página,
       pasa entera a la siguiente.

       Cada .pdf-chord-section lleva su propia "tarjeta" (fondo verde
       tenue + borde verde izquierdo), así el page-break entre secciones
       se ve limpio en lugar de cortar un fondo continuo. */
    '.pdf-song-chords {' +
    '  margin: 0;' +
    '}' +

    /* Cada sección lógica del chord-block (intro, estrofa N, coro, etc.) —
       unidad ATÓMICA de page-break. El font-family Courier y white-space
       pre son indispensables para mantener la alineación de acordes. */
    '.pdf-chord-section {' +
    '  page-break-inside: avoid;' +
    '  break-inside: avoid;' +
    '  font-family: "Courier New", monospace;' +
    '  font-size: 9.5pt;' +
    '  line-height: 1.5;' +
    '  color: #2A2A2A;' +
    '  background: rgba(67,160,71,0.05);' +
    '  border-left: 2.5px solid rgb(67,160,71);' +
    '  border-radius: 0 2px 2px 0;' +
    '  padding: 3mm 6mm;' +
    '  margin: 0 0 1.5mm;' +
    '  white-space: pre;' +
    '  overflow: hidden;' +
    '}' +
    '.pdf-chord-section:last-child { margin-bottom: 0; }' +

    /* Negritas dentro de cada sección = títulos de sección y nombre del
       canto. Aplicamos los estilos a TODOS los descendientes (tanto si
       están directamente bajo .pdf-chord-section como anidados). */
    '.pdf-chord-section b {' +
    '  font-family: "Courier New", monospace;' +
    '  font-weight: 700;' +
    '  color: #2A2A2A;' +
    '}' +
    /* Título del canto (♫ Nombre del Canto) — dorado, más grande. */
    '.pdf-chord-section b.chord-title {' +
    '  display: block;' +
    '  color: #C8943C;' +
    '  font-size: 11pt;' +
    '  font-weight: 700;' +
    '  letter-spacing: 0.08em;' +
    '  margin: 0 0 1.5mm;' +
    '}' +
    /* Sección del canto (═══ CORO ═══, ESTROFA N, INTRO, etc.) —
       banda verde tenue. Margen-left negativo para alinear con el padding
       de .pdf-chord-section. */
    '.pdf-chord-section b.chord-section {' +
    '  display: block;' +
    '  color: rgb(67,160,71);' +
    '  background: rgba(67,160,71,0.10);' +
    '  font-size: 8.5pt;' +
    '  font-weight: 600;' +
    '  letter-spacing: 0.15em;' +
    '  text-transform: uppercase;' +
    '  padding: 0.6mm 2.5mm;' +
    '  margin: 0 0 1.5mm -2.5mm;' +
    '  border-radius: 0 2px 2px 0;' +
    '}' +
    /* Acordes individuales — dorado bold. */
    '.pdf-chord-section .chord {' +
    '  color: #C8943C;' +
    '  font-weight: 700;' +
    '}' +
    /* Capo (cejilla) — marrón sobre fondo dorado tenue. */
    '.pdf-chord-section .chord-capo {' +
    '  color: #7C3F00;' +
    '  font-weight: 700;' +
    '  background: rgba(200,148,60,0.15);' +
    '  padding: 0 2px;' +
    '  border-radius: 2px;' +
    '}' +
    /* Dinámicas (forte, piano, mezzo, etc.) — itálicas violetas. */
    '.pdf-chord-section .chord-dynamic {' +
    '  color: #7E57C2;' +
    '  font-style: italic;' +
    '  font-weight: 700;' +
    '}' +

    /* ── FOOTER DEL DOCUMENTO ── */
    '.pdf-doc-footer {' +
    '  text-align: center;' +
    '  margin: 10mm 12mm 0;' +
    '  padding-top: 4mm;' +
    '  border-top: 1px solid rgba(200,148,60,0.3);' +
    '}' +
    '.pdf-doc-footer-coro {' +
    '  font-family: "Great Vibes", cursive;' +
    '  font-size: 22pt;' +
    '  color: #C8943C;' +
    '  line-height: 1;' +
    '}' +
    '.pdf-doc-footer-tagline {' +
    '  font-family: "Cormorant Garamond", serif;' +
    '  font-style: italic;' +
    '  font-size: 9.5pt;' +
    '  color: #6B7A4E;' +
    '  margin-top: 1mm;' +
    '}' +

    /* Mensaje cuando un canto se imprime "Con Acordes" pero no tiene chords */
    '.pdf-no-chords-notice {' +
    '  font-family: "Cormorant Garamond", serif;' +
    '  font-style: italic;' +
    '  font-size: 10pt;' +
    '  color: #888;' +
    '  text-align: center;' +
    '  padding: 4mm;' +
    '  background: rgba(200,148,60,0.04);' +
    '  border: 1px dashed rgba(200,148,60,0.3);' +
    '  margin: 0;' +
    '}'
  );

  /* ── Generar el HTML del documento PDF ────────────────────────────────── */
  function buildPdfHtml(byMoment, withChords) {
    var html = '<!DOCTYPE html><html lang="es"><head>';
    html += '<meta charset="UTF-8">';
    html += '<title>SetList — Coro Pacem Deus</title>';
    html += '<style>' + PRINT_CSS + '</style>';
    html += '</head><body>';

    /* Header del documento */
    html += '<div class="pdf-doc-header">';
    html += '  <div class="pdf-doc-title">Coro Pacem Deus</div>';
    html += '  <div class="pdf-doc-subtitle">Cantamos al Amor de los Amores</div>';
    html += '  <div class="pdf-doc-date">' + escapeHtml(getNextSundayDate()) + '</div>';
    html += '</div>';

    /* Numerador secuencial global a través de todos los momentos */
    var globalNum = 0;

    MOMENT_ORDER.forEach(function (moment) {
      var songs = byMoment[moment];
      if (!songs || songs.length === 0) return;

      /* Banda de momento (Entrada, Piedad, Gloria...) */
      html += '<div class="pdf-moment">';
      html += '  <div class="pdf-moment-line"></div>';
      html += '  <div class="pdf-moment-label">' + escapeHtml(moment) + '</div>';
      html += '  <div class="pdf-moment-line"></div>';
      html += '</div>';

      /* Cantos del momento */
      songs.forEach(function (song) {
        globalNum++;

        /* Pre-construir el header del canto: número + tag + título */
        var headerHtml =
          '<div class="pdf-song-header">' +
            '<div class="pdf-song-num">' + globalNum + '</div>' +
            '<div class="pdf-song-header-text">' +
              '<div class="pdf-song-moment-tag">' + escapeHtml(moment) + '</div>' +
              '<div class="pdf-song-title">' + escapeHtml(song.title) + '</div>' +
            '</div>' +
          '</div>';

        html += '<div class="pdf-song">';

        /* CONTENIDO según opción elegida ──
           "Con Acordes" → SOLO el <pre> del chord-block, dividido en
                            secciones (cada sección no se rompe entre páginas)
           "Sin Acordes" → SOLO el body sin chord-block embebido

           Política de page-break:
             • El header del canto + el PRIMER bloque de contenido se emiten
               dentro de un wrapper .pdf-song-first-group con
               page-break-inside: avoid. Esto evita que el título quede solo
               al final de una página sin contenido debajo: si el header +
               primer bloque no caben juntos, ambos pasan a la siguiente
               página.
             • Los bloques restantes se emiten directamente bajo .pdf-song,
               cada uno con su propio page-break-inside: avoid (heredado de
               .pdf-chord-section, .chorus, .strophe). */
        if (withChords) {
          var hasChords = songHasChords(song.cpd);
          if (hasChords) {
            var sections = getSongChordsPreSections(song.cpd);
            html += '<div class="pdf-song-chords">';
            sections.forEach(function (sec, idx) {
              if (idx === 0) {
                /* Primera sección: viaja agrupada con el header */
                html += '<div class="pdf-song-first-group">';
                html += headerHtml;
                html += '<div class="pdf-chord-section">' + sec + '</div>';
                html += '</div>';
              } else {
                html += '<div class="pdf-chord-section">' + sec + '</div>';
              }
            });
            html += '</div>';
          } else {
            /* Sin acordes registrados → fallback al body con aviso. */
            html += '<div class="pdf-song-first-group">';
            html += headerHtml;
            html += '<div class="pdf-no-chords-notice">Este canto no tiene acordes registrados — se muestra la letra.</div>';
            html += '</div>';
            html += '<div class="pdf-song-body">' + getSongBodyHtmlWithoutChords(song.cpd) + '</div>';
          }
        } else {
          /* Sin Acordes: emitimos el body completo después del header.
             Para evitar que el header quede solo al final de página, lo
             agrupamos con el primer bloque atómico (etiqueta + chorus/
             strophe siguiente). El resto del body fluye libremente y cada
             chorus/strophe siguiente conserva su page-break-inside: avoid. */
          var bodyParts = splitBodyAtFirstAtomicBlock(getSongBodyHtmlWithoutChords(song.cpd));
          html += '<div class="pdf-song-first-group">';
          html += headerHtml;
          html += '<div class="pdf-song-body">' + bodyParts.firstPart + '</div>';
          html += '</div>';
          if (bodyParts.rest && bodyParts.rest.trim().length > 0) {
            html += '<div class="pdf-song-body pdf-song-body-rest">' + bodyParts.rest + '</div>';
          }
        }

        html += '</div>'; /* /pdf-song */
      });
    });

    /* Footer del documento */
    html += '<div class="pdf-doc-footer">';
    html += '  <div class="pdf-doc-footer-coro">Coro Pacem Deus</div>';
    html += '  <div class="pdf-doc-footer-tagline">Parroquia Sagrada Familia</div>';
    html += '</div>';

    html += '</body></html>';
    return html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Lanzar la impresión ──────────────────────────────────────────────── */
  function launchPrint(withChords) {
    closeDialog();

    var byMoment = collectSetlistByMoment();
    var hasContent = MOMENT_ORDER.some(function (m) {
      return byMoment[m] && byMoment[m].length > 0;
    });
    if (!hasContent) {
      alert('El SetList está vacío. Agrega cantos antes de imprimir.');
      return;
    }

    var html = buildPdfHtml(byMoment, withChords);

    if (IS_MOBILE) {
      /* MÓVIL: usar iframe oculto. window.open() en móviles suele:
           • Ser bloqueado como popup
           • Abrirse como pestaña nueva sin foco (no permite triggear print)
           • Romper el flujo del Web Share posterior
         El iframe es invisible al usuario, se inyecta en la página actual,
         dispara print() desde el contentWindow del iframe (que el navegador
         interpreta como acción del usuario porque el iframe pertenece al
         mismo documento), y al terminar de imprimir se elimina. */
      printViaIframe(html);
    } else {
      /* DESKTOP: popup separado da mejor UX (ventana propia que el usuario
         puede cancelar/cerrar sin afectar al cancionero). */
      printViaPopup(html);
    }
  }

  /* ── Imprimir via iframe oculto (móvil) ────────────────────────────────
     Estrategia: crear un iframe srcless, escribir el HTML completo en su
     document, esperar a que las fuentes carguen, y disparar print() desde
     el contentWindow del iframe. */
  function printViaIframe(html) {
    /* Quitar iframe previo si existe (impresiones consecutivas) */
    var existing = document.getElementById('pdf-print-iframe');
    if (existing) existing.parentNode.removeChild(existing);

    var iframe = document.createElement('iframe');
    iframe.id = 'pdf-print-iframe';
    iframe.setAttribute('aria-hidden', 'true');
    /* Ocultar visualmente sin sacarlo del flujo (left:-9999 puede hacer que
       algunos engines no calculen layout, lo que rompe @page). */
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;' +
      'visibility:hidden;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    var iDoc = iframe.contentDocument || iframe.contentWindow.document;
    iDoc.open();
    iDoc.write(html);
    iDoc.close();

    var triggerPrint = function () {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.error('[SetListPDF] Error al imprimir desde iframe:', e);
        alert('No se pudo abrir el menú de impresión. Intenta nuevamente.');
      }
      /* Limpiar el iframe después de que el usuario cierre el diálogo de
         impresión. 60s es buffer suficiente; si el usuario no actuó en ese
         tiempo, el iframe ya cumplió su función y se puede borrar. */
      setTimeout(function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 60000);
    };

    /* Esperar a fonts.ready DENTRO del iframe (no del documento principal). */
    if (iDoc.fonts && iDoc.fonts.ready) {
      iDoc.fonts.ready.then(function () {
        setTimeout(triggerPrint, 500);
      }).catch(function () {
        setTimeout(triggerPrint, 1500);
      });
    } else {
      /* Sin Font Loading API → buffer más generoso para que carguen las
         Google Fonts via @import. */
      setTimeout(triggerPrint, 2200);
    }
  }

  /* ── Imprimir via popup window (desktop) ───────────────────────────────
     Comportamiento original que ya funciona perfecto en escritorio. */
  function printViaPopup(html) {
    var printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      alert('Permite popups en este sitio para poder imprimir el setlist.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    var triggerPrint = function () {
      printWindow.focus();
      printWindow.print();
    };
    if (printWindow.document.fonts && printWindow.document.fonts.ready) {
      printWindow.document.fonts.ready.then(function () {
        setTimeout(triggerPrint, 400);
      });
    } else {
      setTimeout(triggerPrint, 1800);
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     ESTRATEGIA UNIFICADA: window.print() en TODAS las plataformas
     ════════════════════════════════════════════════════════════════════
     Decisión arquitectural (v3.2.43):
       En v3.2.41-v3.2.42 intentamos usar html2pdf.js (basado en
       html2canvas) en móviles para generar un Blob PDF y compartirlo
       via Web Share API. La calidad fue inaceptable: html2canvas
       rasteriza el HTML como imagen, las fuentes salen blurry, los
       page-breaks no respetan el CSS, el layout colapsa en pantallas
       altas (iOS limita el canvas a ~16384px), y el resultado es "un
       enjambre de letras y acordes desperdigadas".

       La realidad técnica:
         • NO existe una API JavaScript que genere PDF vectorial desde
           HTML usando el motor del navegador.
         • html2canvas / jsPDF.html() / html2pdf.js TODOS rasterizan.
         • window.print() es la ÚNICA vía a calidad nativa: usa el
           motor de impresión del navegador, respeta @page, page-breaks,
           tipografías, y produce PDF vectorial con texto seleccionable.

       Por eso en v3.2.43 unificamos: TANTO desktop COMO móvil usan
       window.print(). El usuario móvil:
         1. Tap "Imprimir" → diálogo nativo del SO
         2. "Guardar como PDF" → archivo en Files/Descargas
         3. Compartir desde Files (gestor del SO) → WhatsApp/Mail/etc.

       Es un paso más que el flujo Web Share, pero la calidad del PDF
       es perfecta. Para una parroquia compartiendo el setlist semanal,
       la calidad importa más que el ahorro de un tap.

       Mostramos un hint visual breve antes de invocar window.print()
       en móvil, explicando los 3 pasos simples. ════════════════════ */

  /* ── Detección sencilla de móvil ────────────────────────────────────────
     Usado en dos lugares:
       1. launchPrint(): elegir entre iframe (móvil) y popup (desktop).
       2. launchAction(): mostrar el hint de 3 pasos antes de imprimir. */
  var IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
                  window.innerWidth < 900;

  /* ── Hint visual de 3 pasos para guiar al usuario en móvil ─────────── */
  function showMobilePrintHint(callback) {
    /* Quitar hint previo si existe */
    var existing = document.getElementById('pdf-mobile-hint');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'pdf-mobile-hint';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:200000;background:rgba(0,0,0,0.78);' +
      'display:flex;align-items:center;justify-content:center;padding:1rem;';

    overlay.innerHTML =
      '<div style="background:#1A1F18;border:1px solid rgba(200,148,60,0.35);' +
            'border-radius:10px;padding:1.5rem 1.3rem 1.2rem;max-width:380px;width:100%;">' +
        '<div style="text-align:center;margin-bottom:1.1rem;">' +
          '<div style="font-family:Cinzel,serif;font-size:0.78rem;letter-spacing:0.22em;' +
                'text-transform:uppercase;color:#C8943C;margin-bottom:0.4rem;">' +
            'Cómo compartir el PDF' +
          '</div>' +
          '<div style="font-family:\'Cormorant Garamond\',serif;font-size:1.05rem;' +
                'color:#E8E0C8;font-style:italic;line-height:1.35;">' +
            'En 3 pasos sencillos' +
          '</div>' +
        '</div>' +

        /* Lista de pasos */
        '<ol style="list-style:none;padding:0;margin:0 0 1.3rem 0;' +
              'font-family:\'Cormorant Garamond\',serif;color:#C0C5B5;font-size:0.98rem;' +
              'line-height:1.4;">' +
          '<li style="display:flex;gap:0.7rem;margin-bottom:0.7rem;">' +
            '<span style="flex-shrink:0;width:1.8rem;height:1.8rem;border-radius:50%;' +
                  'background:rgba(200,148,60,0.18);border:1px solid rgba(200,148,60,0.4);' +
                  'color:#C8943C;font-family:Cinzel,serif;font-size:0.75rem;font-weight:600;' +
                  'display:flex;align-items:center;justify-content:center;">1</span>' +
            '<span style="flex:1;padding-top:0.15rem;">Aparecerá el menú de impresión. Elige <strong style="color:#E8E0C8;">Guardar como PDF</strong>.</span>' +
          '</li>' +
          '<li style="display:flex;gap:0.7rem;margin-bottom:0.7rem;">' +
            '<span style="flex-shrink:0;width:1.8rem;height:1.8rem;border-radius:50%;' +
                  'background:rgba(200,148,60,0.18);border:1px solid rgba(200,148,60,0.4);' +
                  'color:#C8943C;font-family:Cinzel,serif;font-size:0.75rem;font-weight:600;' +
                  'display:flex;align-items:center;justify-content:center;">2</span>' +
            '<span style="flex:1;padding-top:0.15rem;">Guarda el archivo en tu dispositivo.</span>' +
          '</li>' +
          '<li style="display:flex;gap:0.7rem;">' +
            '<span style="flex-shrink:0;width:1.8rem;height:1.8rem;border-radius:50%;' +
                  'background:rgba(200,148,60,0.18);border:1px solid rgba(200,148,60,0.4);' +
                  'color:#C8943C;font-family:Cinzel,serif;font-size:0.75rem;font-weight:600;' +
                  'display:flex;align-items:center;justify-content:center;">3</span>' +
            '<span style="flex:1;padding-top:0.15rem;">Ábrelo desde <strong style="color:#E8E0C8;">Archivos</strong> y compártelo por WhatsApp.</span>' +
          '</li>' +
        '</ol>' +

        /* Botones */
        '<div style="display:flex;flex-direction:column;gap:0.55rem;">' +
          '<button id="pdf-hint-continue" style="background:#C8943C;border:none;color:#0E1A0C;' +
                'padding:0.85rem 1rem;border-radius:6px;font-family:Cinzel,serif;font-size:0.72rem;' +
                'font-weight:600;letter-spacing:0.18em;text-transform:uppercase;cursor:pointer;">' +
            'Entendido, continuar' +
          '</button>' +
          '<button id="pdf-hint-cancel" style="background:transparent;border:none;' +
                'color:rgba(220,220,220,0.55);padding:0.4rem;font-family:Cinzel,serif;' +
                'font-size:0.62rem;letter-spacing:0.18em;text-transform:uppercase;cursor:pointer;">' +
            'Cancelar' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    /* Cerrar al click fuera */
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) {
        overlay.remove();
      }
    });

    document.getElementById('pdf-hint-continue').addEventListener('click', function () {
      overlay.remove();
      callback();
    });
    document.getElementById('pdf-hint-cancel').addEventListener('click', function () {
      overlay.remove();
    });
  }

  /* ── Enrutador principal: en ambos casos termina en window.print() ──
     En móvil mostramos primero el hint de 3 pasos (solo la primera vez
     por sesión, para no saturar al usuario que ya lo conoce). En desktop
     vamos directo a launchPrint(). */
  var hintShownThisSession = false;

  function launchAction(withChords) {
    if (IS_MOBILE && !hintShownThisSession) {
      hintShownThisSession = true;
      showMobilePrintHint(function () {
        launchPrint(withChords);
      });
    } else {
      launchPrint(withChords);
    }
  }

    /* ── API pública para event-delegation (handlers en 25-event-delegation) */
  window.PdSetlistPrint = {
    open:             openDialog,
    close:            closeDialog,
    printWithChords:  function () { launchAction(true); },
    printNoChords:    function () { launchAction(false); }
  };
})();
