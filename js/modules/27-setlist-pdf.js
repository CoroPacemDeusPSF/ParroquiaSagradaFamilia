/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/27-setlist-pdf.js
 *   @brief      PDF del SetList — clonando fielmente la presentación del cancionero
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r1
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   27-setlist-pdf.js
   ============================================================================
   Imprime el SetList del próximo domingo como un PDF que SE VEA exactamente
   como el cancionero web. La premisa: el PDF debe parecer una traducción
   1:1 del diseño de las song-cards a papel, no una versión empobrecida.

   FILOSOFÍA DEL DISEÑO (leccionado de v3.2.42r1 v1):
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

  /* ── Extraer el chord-block dividido en SECCIONES ──
     El <pre> del cancionero contiene letra + acordes intercalados, separados
     por <b class="chord-section">═══ ESTROFA N ═══</b> y similares.

     Para que el PDF haga page-break "inteligente" (sin cortar acordes a la
     mitad de una sección), DIVIDIMOS el <pre> en secciones lógicas. Cada
     sección será renderizada como un bloque independiente con
     `page-break-inside: avoid`. Si una sección no cabe al final de página,
     pasa entera a la siguiente — sin cortar.

     Heurística para dividir:
       • Buscamos los <b class="chord-section"> y <b class="chord-title">
         como puntos de corte.
       • Si el <pre> NO tiene esos marcadores (chord-blocks antiguos con <b>
         simple), caemos a un solo bloque indivisible.
       • Cualquier contenido antes del primer marcador (típicamente el
         "♫ Título" + nota de modulación) se trata como bloque inicial.

     Devuelve un array de strings (cada string es el innerHTML de una
     sección, sin cambios al contenido más allá del split). */
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

    /* Regex que matchea cualquier <b class="chord-section">...</b> o
       <b class="chord-title">...</b>. Usamos lazy match (.*?) para no
       capturar tags anidados ni saltarnos cierres. */
    var sectionRe = /<b class="chord-(?:section|title)"[^>]*>[\s\S]*?<\/b>/g;
    var matches = [];
    var m;
    while ((m = sectionRe.exec(html)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length });
    }

    /* Caso degenerado: chord-block sin marcadores semánticos (<b> simples).
       Devolvemos el HTML completo como un solo bloque. */
    if (matches.length === 0) return [html];

    var sections = [];

    /* Contenido ANTES del primer marcador (suele ser el ♫ título inicial
       en chord-blocks antiguos, o notas de modulación). Lo emitimos solo
       si tiene contenido visible. */
    if (matches[0].start > 0) {
      var prelude = html.substring(0, matches[0].start);
      if (prelude.replace(/\s+/g, '').length > 0) {
        sections.push(prelude);
      }
    }

    /* Cada sección va desde el marcador hasta justo antes del siguiente
       marcador (o hasta el final del HTML). */
    for (var i = 0; i < matches.length; i++) {
      var startIdx = matches[i].start;
      var endIdx = (i + 1 < matches.length) ? matches[i + 1].start : html.length;
      sections.push(html.substring(startIdx, endIdx));
    }

    return sections;
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

        /* Header del canto: número + tag de momento + título */
        html += '<div class="pdf-song">';
        html += '  <div class="pdf-song-header">';
        html += '    <div class="pdf-song-num">' + globalNum + '</div>';
        html += '    <div class="pdf-song-header-text">';
        html += '      <div class="pdf-song-moment-tag">' + escapeHtml(moment) + '</div>';
        html += '      <div class="pdf-song-title">' + escapeHtml(song.title) + '</div>';
        html += '    </div>';
        html += '  </div>';

        /* CONTENIDO según opción elegida ──
           "Con Acordes" → SOLO el <pre> del chord-block, dividido en
                            secciones (cada sección no se rompe entre páginas)
           "Sin Acordes" → SOLO el body sin chord-block embebido */
        if (withChords) {
          var hasChords = songHasChords(song.cpd);
          if (hasChords) {
            var sections = getSongChordsPreSections(song.cpd);
            html += '<div class="pdf-song-chords">';
            sections.forEach(function (sec) {
              html += '<div class="pdf-chord-section">' + sec + '</div>';
            });
            html += '</div>';
          } else {
            /* Si el canto no tiene acordes pero el usuario eligió "Con
               Acordes", caemos al body como fallback con un aviso. */
            html += '<div class="pdf-no-chords-notice">Este canto no tiene acordes registrados — se muestra la letra.</div>';
            html += '<div class="pdf-song-body">' + getSongBodyHtmlWithoutChords(song.cpd) + '</div>';
          }
        } else {
          var bodyHtml = getSongBodyHtmlWithoutChords(song.cpd);
          html += '<div class="pdf-song-body">' + bodyHtml + '</div>';
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

    /* Ventana popup separada — el navegador renderiza fuentes Google Fonts
       sin interferir con el cancionero, y el usuario puede cancelar/cerrar
       sin afectar la página principal. */
    var printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      alert('Permite popups en este sitio para poder imprimir el setlist.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    /* Esperar a que las fuentes carguen — sin esto, Chrome puede imprimir
       con tipografías fallback (serif genérica) y se pierde el diseño. */
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

  /* ── API pública para event-delegation (handlers en 25-event-delegation) */
  window.PdSetlistPrint = {
    open:             openDialog,
    close:            closeDialog,
    printWithChords:  function () { launchPrint(true); },
    printNoChords:    function () { launchPrint(false); }
  };
})();
