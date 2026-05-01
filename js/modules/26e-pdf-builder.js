/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/26e-pdf-builder.js
 *   @brief      Constructor de PDF vectorial con identidad visual Pacem Deus
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.45
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   26e-pdf-builder.js
   ============================================================================
   Genera PDFs vectoriales con jsPDF y la identidad visual del Coro Pacem Deus.
   Reemplaza el flujo basado en window.print() (que requería 3 pasos en móvil)
   por una generación cliente que se abre directamente en el visor PDF nativo,
   permitiendo compartir por WhatsApp en pocos taps.

   IDENTIDAD VISUAL:
     • Paleta oficial (tokens.css): dorado #C8943C, verde profundo #0E1A0C,
       verde litúrgico #6B9E4A, marfil #F5F0DC, texto cálido #3D3530.
     • Pinyon Script para "Coro Pacem Deus" (idéntico a la portada del web).
     • Cinzel para títulos, etiquetas de sección y números de canto.
     • Coros en cajas cream con barra dorada lateral (réplica de .chorus web).
     • Tags litúrgicos verdes (réplica de .ctx-tag-momento).

   PAGINACIÓN INTELIGENTE (orphan/widow control):
     • Header de canto siempre va junto con su primer bloque de contenido.
     • Pares "chord-line + lyric-line" nunca se separan entre páginas.
     • Etiqueta de sección no queda sola al final de página: si después
       de ella no caben mínimo 2 líneas, salta a la siguiente página.
     • Bloques (chorus/strophe) intentan no partirse; si no caben enteros
       y caben en su totalidad en la siguiente página, saltan; si son más
       grandes que una página entera, se parten dejando mínimo 2 líneas
       en cada página.

   ORDEN DE CARGA: 26e (después del parser y las fuentes).
   ============================================================================ */

(function (global) {
  'use strict';

  /* ============================================================
     CONFIGURACIÓN — paleta y métricas oficiales (tokens.css)
     ============================================================ */
  const CFG = {
    /* Página A4 portrait en mm */
    pageWidth:    210,
    pageHeight:   297,
    marginX:      18,
    marginTop:    22,
    marginBottom: 22,

    /* Paleta oficial extraída de css/tokens.css (RGB) */
    color: {
      bgDeep:       [14, 26, 12],     /* #0E1A0C  fondo verde profundo    */
      bgDeepMid:    [26, 40, 24],     /* #1A2818  variante elevada        */
      bgPage:       [248, 244, 230],  /* #F8F4E6  fondo beige suave       */
      bgCardSoft:   [255, 255, 255],  /* #FFFFFF  cajas .chorus (blancas
                                                    sobre el beige)        */
      accent:       [200, 148, 60],   /* #C8943C  dorado principal        */
      accentBright: [212, 160, 74],   /* #D4A04A  dorado claro            */
      accentDeep:   [176, 128, 48],   /* #B08030  dorado oscuro           */
      liturgical:   [107, 158, 74],   /* #6B9E4A  verde litúrgico         */
      textStrong:   [42, 38, 32],     /* #2A2620  títulos sobre claro     */
      textBase:     [61, 53, 48],     /* #3D3530  cuerpo                  */
      textSoft:     [90, 80, 64],     /* #5A5040  notas                   */
      textMuted:    [122, 110, 96],   /* #7A6E60  metadatos               */
      textOnDark:   [245, 240, 220],  /* #F5F0DC  texto sobre oscuro      */
      divider:      [200, 180, 150],  /* separadores sutiles              */
      white:        [255, 255, 255]
    },

    /* Tipografía — tamaños en pt */
    font: {
      titleSize:    18,
      momentSize:   8,
      sectionSize:  10.5,
      lyricSize:    11.2,
      chordSize:    9.5,
      noteSize:     8.5,
      coverTitle:   34,
      coverSub:     11.5,
      coverDate:    10,
      eyebrow:      8.5,
      pinyon:       38   /* "Coro Pacem Deus" en cursiva — grande         */
    },

    /* Espaciados en mm */
    space: {
      blockBottom:    4,
      chorusPadding:  6,
      lineHeight:     5.6,
      chordLineH:     4.6,
      sectionMarginT: 4,
      sectionMarginB: 3
    }
  };

  /* Caracteres no soportados por WinAnsi → reemplazo seguro.
     jsPDF soporta UTF-8 con fuentes embebidas (Cinzel, Pinyon), pero las
     fuentes estándar (Helvetica, Times, Courier) usan WinAnsi y no tienen
     glifos para ✦, ⚠, ♫, ═. Sustituimos antes de pintar. */
  const CHAR_REPLACEMENTS = {
    '✦': '\u2022',
    '⚠': '!',
    '♫': '\u266A',
    '═': '-',
    '─': '-',
    '✓': '·',
    '☩': '+'
  };

  /* ============================================================
     UTILIDADES
     ============================================================ */

  function getJsPDFConstructor() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    throw new Error('jsPDF no está cargado');
  }

  function sanitizeText(text) {
    if (!text) return '';
    let out = String(text);
    Object.keys(CHAR_REPLACEMENTS).forEach(function (ch) {
      out = out.split(ch).join(CHAR_REPLACEMENTS[ch]);
    });
    return out;
  }

  function safeText(doc, text, x, y, opts) {
    return doc.text(sanitizeText(text), x, y, opts || {});
  }

  function setFill(doc, rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
  function setText(doc, rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
  function setDraw(doc, rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }

  /**
   * Pinta el fondo beige suave sobre toda la página actual.
   * Llamado al inicio de cada página (incluyendo después de addPage()).
   * El cancionero web no tiene fondo blanco puro: usa una paleta cálida.
   * Replicar este matiz en el PDF da continuidad visual.
   */
  function paintPageBackground(doc) {
    setFill(doc, CFG.color.bgPage);
    doc.rect(0, 0, CFG.pageWidth, CFG.pageHeight, 'F');
  }

  /* Registra Cinzel + Pinyon en el doc con fallback silencioso a Times. */
  function registerFonts(doc) {
    const result = { hasCinzel: false, hasPinyon: false };

    if (window.CINZEL_FONTS) {
      try {
        doc.addFileToVFS('Cinzel-Regular.ttf', window.CINZEL_FONTS.regular);
        doc.addFont('Cinzel-Regular.ttf', 'Cinzel', 'normal');
        doc.addFileToVFS('Cinzel-Bold.ttf', window.CINZEL_FONTS.bold);
        doc.addFont('Cinzel-Bold.ttf', 'Cinzel', 'bold');
        result.hasCinzel = true;
      } catch (e) {
        console.warn('[PDF] No se pudo registrar Cinzel:', e.message);
      }
    }

    if (window.PINYON_FONT) {
      try {
        doc.addFileToVFS('PinyonScript-Regular.ttf', window.PINYON_FONT.regular);
        doc.addFont('PinyonScript-Regular.ttf', 'PinyonScript', 'normal');
        result.hasPinyon = true;
      } catch (e) {
        console.warn('[PDF] No se pudo registrar Pinyon Script:', e.message);
      }
    }

    return result;
  }

  /* ============================================================
     PUNTO DE ENTRADA PÚBLICO
     ============================================================ */

  /**
   * Genera el blob PDF a partir de un array de cantos del SetList.
   *
   * @param {Array} songs - cantos en orden, con campos:
   *                        cpd, title, moment, body_html, chords_html
   * @param {Object} opts - { withChords: bool, dateLabel: string }
   * @returns {Blob} - blob PDF listo para abrir en el visor del navegador
   */
  function buildPdf(songs, opts) {
    opts = opts || {};
    const withChords = !!opts.withChords;
    const dateLabel  = opts.dateLabel || formatNextSunday();

    const JsPDF = getJsPDFConstructor();
    const doc = new JsPDF({
      unit:        'mm',
      format:      'a4',
      orientation: 'portrait',
      compress:    true
    });

    const fontStatus = registerFonts(doc);

    /* Helpers para configurar tipografías con fallback silencioso */
    doc.setHeaderFont = function (style) {
      if (fontStatus.hasCinzel) doc.setFont('Cinzel', style || 'normal');
      else                       doc.setFont('times', style === 'bold' ? 'bold' : 'normal');
    };
    doc.setScriptFont = function () {
      if (fontStatus.hasPinyon) doc.setFont('PinyonScript', 'normal');
      else                       doc.setFont('times', 'italic');
    };

    /* Portada */
    drawCover(doc, songs, dateLabel, withChords);

    /* Cantos */
    songs.forEach(function (song, idx) {
      doc.addPage();
      drawSong(doc, song, idx + 1, songs.length, withChords);
    });

    /* Pintar cabecera/pie en TODAS las páginas (excepto la portada).
       Lo hacemos al final cuando ya conocemos el total de páginas. */
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 2; p <= totalPages; p++) {
      doc.setPage(p);
      drawPageChrome(doc, p - 1, totalPages - 1);
    }

    return doc.output('blob');
  }

  /* ============================================================
     PORTADA — emula site-header del index.html
     ============================================================ */

  function drawCover(doc, songs, dateLabel, withChords) {
    const cx = CFG.pageWidth / 2;

    /* Fondo beige suave de toda la página */
    paintPageBackground(doc);

    /* Banda superior verde profundo (≈ site-header) */
    setFill(doc, CFG.color.bgDeep);
    doc.rect(0, 0, CFG.pageWidth, 100, 'F');

    /* Filetes dorados arriba/abajo de la banda */
    setDraw(doc, CFG.color.accent);
    doc.setLineWidth(0.5);
    doc.line(CFG.marginX, 14, CFG.pageWidth - CFG.marginX, 14);
    doc.line(CFG.marginX, 92, CFG.pageWidth - CFG.marginX, 92);

    /* Cruz decorativa */
    doc.setHeaderFont('normal');
    doc.setFontSize(18);
    setText(doc, CFG.color.accent);
    safeText(doc, '+', cx, 26, { align: 'center' });

    /* Eyebrow: "Parroquia de la Sagrada Familia" */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(CFG.font.eyebrow);
    setText(doc, CFG.color.accentBright);
    doc.setCharSpace(0.5);
    safeText(doc, 'PARROQUIA DE LA SAGRADA FAMILIA', cx, 38, { align: 'center' });
    doc.setCharSpace(0);

    /* "Coro Pacem Deus" en Pinyon Script — la firma visual del coro */
    doc.setScriptFont();
    doc.setFontSize(CFG.font.pinyon);
    setText(doc, CFG.color.accent);
    safeText(doc, 'Coro Pacem Deus', cx, 65, { align: 'center' });

    /* Tagline en italic dorado */
    doc.setFont('times', 'italic');
    doc.setFontSize(9.5);
    setText(doc, CFG.color.accentBright);
    safeText(doc, '« Cantamos al Amor de los Amores »', cx, 78, { align: 'center' });

    /* ───── ZONA INFERIOR (fondo claro) ───── */

    /* Título principal: CANCIONERO */
    doc.setHeaderFont('bold');
    doc.setFontSize(CFG.font.coverTitle);
    setText(doc, CFG.color.textStrong);
    doc.setCharSpace(2);
    safeText(doc, 'CANCIONERO', cx, 128, { align: 'center' });
    doc.setCharSpace(0);

    /* Subtítulo: edición */
    doc.setFont('times', 'italic');
    doc.setFontSize(CFG.font.coverSub);
    setText(doc, CFG.color.textMuted);
    const subtitulo = withChords ? 'Edición con acordes' : 'Edición para la asamblea';
    safeText(doc, subtitulo, cx, 138, { align: 'center' });

    /* Filete decorativo con punto central */
    drawDecorativeRule(doc, cx, 146);

    /* Fecha del próximo domingo */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(CFG.font.coverDate);
    setText(doc, CFG.color.textBase);
    safeText(doc, dateLabel, cx, 156, { align: 'center' });

    /* Etiqueta ÍNDICE */
    doc.setHeaderFont('bold');
    doc.setFontSize(11);
    setText(doc, CFG.color.accentDeep);
    doc.setCharSpace(2);
    safeText(doc, 'ÍNDICE', cx, 174, { align: 'center' });
    doc.setCharSpace(0);

    /* Filas del índice */
    let y = 186;
    songs.forEach(function (song, idx) {
      const num = String(idx + 1).padStart(2, '0');

      doc.setHeaderFont('bold');
      doc.setFontSize(11);
      setText(doc, CFG.color.accent);
      safeText(doc, num, cx - 70, y, { align: 'left' });

      doc.setFont('times', 'normal');
      doc.setFontSize(11);
      setText(doc, CFG.color.textBase);
      safeText(doc, song.title, cx - 60, y, { align: 'left' });

      doc.setFont('times', 'italic');
      doc.setFontSize(9);
      setText(doc, CFG.color.textMuted);
      safeText(doc, song.moment, cx + 70, y, { align: 'right' });

      y += 7;
    });

    /* Pie de portada — coherente con el footer del resto de páginas */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, CFG.color.accent);
    safeText(doc, '\u2022   \u2022   \u2022', cx, CFG.pageHeight - 22, { align: 'center' });

    doc.setFont('times', 'italic');
    doc.setFontSize(9);
    setText(doc, CFG.color.textMuted);
    safeText(doc, 'Cantamos al Amor de los Amores',
             cx, CFG.pageHeight - 14, { align: 'center' });
  }

  function drawDecorativeRule(doc, cx, y) {
    setDraw(doc, CFG.color.accent);
    doc.setLineWidth(0.3);
    doc.line(cx - 30, y, cx - 4, y);
    doc.line(cx + 4, y, cx + 30, y);
    setFill(doc, CFG.color.accent);
    doc.circle(cx, y, 0.7, 'F');
  }

  /* ============================================================
     CABECERA Y PIE DE PÁGINAS INTERIORES
     ============================================================ */

  function drawPageChrome(doc, pageNum, total) {
    /* Cabecera */
    setDraw(doc, CFG.color.divider);
    doc.setLineWidth(0.2);
    doc.line(CFG.marginX, 11, CFG.pageWidth - CFG.marginX, 11);

    doc.setHeaderFont('normal');
    doc.setFontSize(7);
    setText(doc, CFG.color.textMuted);
    doc.setCharSpace(0.8);
    safeText(doc, 'CORO PACEM DEUS', CFG.marginX, 9);
    doc.setCharSpace(0);

    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    setText(doc, CFG.color.textMuted);
    const pageStr = String(pageNum).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    safeText(doc, pageStr, CFG.pageWidth - CFG.marginX, 9, { align: 'right' });

    /* Pie */
    const cx = CFG.pageWidth / 2;
    const y = CFG.pageHeight - 12;

    setDraw(doc, CFG.color.divider);
    doc.setLineWidth(0.2);
    doc.line(CFG.marginX, y - 4, CFG.pageWidth - CFG.marginX, y - 4);

    doc.setFont('times', 'italic');
    doc.setFontSize(7.5);
    setText(doc, CFG.color.textMuted);
    safeText(doc, 'Cantamos al Amor de los Amores', cx, y, { align: 'center' });
  }

  /* ============================================================
     ENCABEZADO DE CANTO — badge dorado + título Cinzel + tag verde
     ============================================================ */

  function drawSongHeader(doc, song, number, y) {
    const cx = CFG.pageWidth / 2;

    /* Badge circular dorado con número */
    const badgeR = 5.5;
    const badgeY = y + 8;
    const numStr = String(number).padStart(2, '0');

    setFill(doc, CFG.color.accent);
    doc.circle(cx, badgeY, badgeR, 'F');

    setDraw(doc, CFG.color.accentDeep);
    doc.setLineWidth(0.3);
    doc.circle(cx, badgeY, badgeR, 'S');

    doc.setHeaderFont('bold');
    doc.setFontSize(10);
    setText(doc, CFG.color.white);
    safeText(doc, numStr, cx, badgeY + 1.4, { align: 'center' });

    /* Título en Cinzel UPPERCASE */
    doc.setHeaderFont('bold');
    doc.setFontSize(CFG.font.titleSize);
    setText(doc, CFG.color.textStrong);
    doc.setCharSpace(0.6);
    safeText(doc, song.title.toUpperCase(), cx, y + 23, { align: 'center' });
    doc.setCharSpace(0);

    /* Tag verde litúrgico con momento */
    drawLiturgicalTag(doc, cx, y + 30, song.moment);

    return y + 40;
  }

  function drawLiturgicalTag(doc, cx, y, label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const text = label.toUpperCase();
    const charSpacing = 0.4; /* en mm (unidad del documento) */

    /* getTextWidth ignora char-spacing — sumamos a mano:
       (n-1) gaps adicionales de tamaño charSpacing entre cada par de chars. */
    doc.setCharSpace(0);
    const baseWidth = doc.getTextWidth(sanitizeText(text));
    const extraSpace = Math.max(0, text.length - 1) * charSpacing;
    const textWidth = baseWidth + extraSpace;

    const padX = 5;
    const padY = 1.6;
    const tagW = textWidth + padX * 2;
    const tagH = 4.8;

    setFill(doc, CFG.color.liturgical);
    doc.roundedRect(cx - tagW / 2, y - tagH + padY, tagW, tagH, 1.4, 1.4, 'F');

    setText(doc, CFG.color.white);
    doc.setCharSpace(charSpacing);
    safeText(doc, text, cx, y, { align: 'center' });
    doc.setCharSpace(0);
  }

  /* ============================================================
     RENDER DE CANTO COMPLETO
     ============================================================ */

  function drawSong(doc, song, number, total, withChords) {
    paintPageBackground(doc);
    let y = CFG.marginTop;
    y = drawSongHeader(doc, song, number, y);
    y += 6;

    if (withChords) {
      drawSongWithChords(doc, song, y);
    } else {
      drawSongLyrics(doc, song, y);
    }
  }

  /* Espacio disponible vertical en la página actual */
  function availableSpace(y) {
    return CFG.pageHeight - CFG.marginBottom - 6 - y;
  }

  /* Hacer page-break y devolver la nueva Y. Pinta fondo de la nueva página. */
  function pageBreak(doc) {
    doc.addPage();
    paintPageBackground(doc);
    return CFG.marginTop;
  }

  /* ============================================================
     MODO LETRAS — paginación inteligente por bloques
     ============================================================ */

  function drawSongLyrics(doc, song, y) {
    const blocks = window.PDFParser.parseBodyHtml(song.body_html);

    /* Estimar altura por tipo */
    function estimateBlockHeight(block) {
      if (block.type === 'ornament') return 11;
      if (block.type === 'note')     return 8;
      const lineH = CFG.space.lineHeight;
      const padding = (block.type === 'chorus') ? 6 : 0;
      return block.lines.length * lineH + padding + CFG.space.blockBottom;
    }

    const MIN_LINES_BEFORE_BREAK = 2; /* mínimo de líneas si partimos un bloque */

    blocks.forEach(function (block) {
      const blockH = estimateBlockHeight(block);
      const avail = availableSpace(y);

      /* Bloques cortos (ornament, note) o que caben enteros: dibujar normal */
      if (blockH <= avail) {
        y = drawLyricBlock(doc, block, y);
        return;
      }

      /* Bloque NO cabe entero. Decisión:
         - Si cabe entero en una página nueva → saltar página. */
      if (blockH <= CFG.pageHeight - CFG.marginTop - CFG.marginBottom - 6) {
        y = pageBreak(doc);
        y = drawLyricBlock(doc, block, y);
        return;
      }

      /* Bloque más grande que una página entera (caso muy raro): partir por
         líneas, manteniendo MIN_LINES_BEFORE_BREAK juntas. */
      y = drawLyricBlockWithSplit(doc, block, y, MIN_LINES_BEFORE_BREAK);
    });
  }

  /**
   * Dibuja un bloque entero (sin partir). Asume que cabe en la página actual.
   */
  function drawLyricBlock(doc, block, y) {
    const PDFParser = window.PDFParser;

    if (block.type === PDFParser.BLOCK_TYPES.ORNAMENT) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      setText(doc, CFG.color.accent);
      safeText(doc, '\u2022    \u2022    \u2022',
               CFG.pageWidth / 2, y + 5, { align: 'center' });
      return y + 11;
    }

    if (block.type === PDFParser.BLOCK_TYPES.NOTE) {
      doc.setFont('times', 'italic');
      doc.setFontSize(CFG.font.noteSize);
      setText(doc, CFG.color.textSoft);
      safeText(doc, block.lines[0] || '',
               CFG.pageWidth / 2, y + 3, { align: 'center' });
      return y + 8;
    }

    const isChorus = (block.type === PDFParser.BLOCK_TYPES.CHORUS);

    if (isChorus) {
      /* Caja del coro: fondo cream + barra dorada lateral */
      const padTop = 2;
      const padBot = 2;
      const padLeft = 8;
      const blockH = block.lines.length * CFG.space.lineHeight + padTop + padBot;

      setFill(doc, CFG.color.bgCardSoft);
      doc.rect(CFG.marginX, y - 1, CFG.pageWidth - CFG.marginX * 2, blockH, 'F');

      setFill(doc, CFG.color.accent);
      doc.rect(CFG.marginX, y - 1, 1.4, blockH, 'F');

      doc.setFont('times', 'bolditalic');
      doc.setFontSize(CFG.font.lyricSize);
      setText(doc, CFG.color.textStrong);

      let lineY = y + padTop + 3;
      block.lines.forEach(function (line) {
        safeText(doc, line, CFG.marginX + padLeft, lineY);
        lineY += CFG.space.lineHeight;
      });

      return y + blockH + 3;
    }

    /* Estrofa o LP-Section */
    doc.setFont('times', 'normal');
    doc.setFontSize(CFG.font.lyricSize);
    setText(doc, CFG.color.textBase);

    block.lines.forEach(function (line) {
      safeText(doc, line, CFG.marginX + 2, y);
      y += CFG.space.lineHeight;
    });

    return y + CFG.space.blockBottom;
  }

  /**
   * Dibuja un bloque enorme partiéndolo entre páginas, con orphan/widow
   * control: nunca deja menos de minLines en cada parte.
   */
  function drawLyricBlockWithSplit(doc, block, y, minLines) {
    const PDFParser = window.PDFParser;
    const isChorus = (block.type === PDFParser.BLOCK_TYPES.CHORUS);

    let i = 0;
    const total = block.lines.length;

    while (i < total) {
      const linesAvail = Math.floor(availableSpace(y) / CFG.space.lineHeight);
      let linesToDraw = Math.min(linesAvail, total - i);

      /* Asegurar que las líneas restantes después de esta página sean ≥ minLines.
         Si no, reducir las que dibujamos ahora para empujar más a la siguiente. */
      if (total - i - linesToDraw > 0 && total - i - linesToDraw < minLines) {
        linesToDraw = Math.max(0, total - i - minLines);
      }

      if (linesToDraw < minLines && i === 0) {
        /* Ni siquiera podemos dibujar minLines en la primera parte: salta página */
        y = pageBreak(doc);
        continue;
      }

      if (linesToDraw === 0) {
        y = pageBreak(doc);
        continue;
      }

      const partialBlock = {
        type: block.type,
        lines: block.lines.slice(i, i + linesToDraw)
      };
      y = drawLyricBlock(doc, partialBlock, y);
      i += linesToDraw;

      if (i < total) {
        y = pageBreak(doc);
      }
    }

    return y;
  }

  /* ============================================================
     MODO CON ACORDES — paginación por SECCIONES
     ============================================================ */

  function drawSongWithChords(doc, song, y) {
    if (!song.chords_html) {
      doc.setFont('times', 'italic');
      doc.setFontSize(CFG.font.lyricSize);
      setText(doc, CFG.color.textSoft);
      safeText(doc, '(Sin acordes registrados para este canto.)',
               CFG.marginX, y);
      y += 6;
      drawSongLyrics(doc, song, y);
      return;
    }

    const elements = window.PDFParser.parseChordsHtml(song.chords_html);

    /* Agrupar elementos en SECCIONES atómicas:
       cada sección es {label, items[]}. label puede ser null (preludio
       antes del primer marcador, ej. nota de tonalidad). */
    const sections = groupChordElementsBySection(elements);

    /* Constantes de paginación:
       - sectionLabelHeight: altura aproximada del label de sección
       - itemHeight: altura típica de chord-line + lyric-line
       - MIN_PAIRS_PER_BREAK: mínimo de pares chord+lyric a mantener juntos */
    const MIN_PAIRS_AFTER_LABEL = 2; /* tras "ESTROFA 1" deben caber ≥ 2 pares */
    const MIN_PAIRS_PER_BREAK   = 2; /* nunca dejar 1 par solo en una página  */

    sections.forEach(function (section) {
      y = drawChordSection(doc, section, y,
                           MIN_PAIRS_AFTER_LABEL, MIN_PAIRS_PER_BREAK);
    });
  }

  /**
   * Agrupa los elementos parseados de chords_html en secciones atómicas.
   * Una sección comienza con un elemento 'section' (etiqueta CORO/ESTROFA)
   * y contiene todos los elementos hasta la siguiente etiqueta.
   * Los elementos previos a la primera 'section' van en una sección con label=null.
   */
  function groupChordElementsBySection(elements) {
    const sections = [];
    let current = { label: null, items: [] };

    elements.forEach(function (el) {
      if (el.type === 'section') {
        /* Si la sección actual tiene contenido o un label, cerrarla */
        if (current.label || current.items.length > 0) {
          sections.push(current);
        }
        current = { label: el.text, items: [] };
      } else {
        current.items.push(el);
      }
    });

    if (current.label || current.items.length > 0) {
      sections.push(current);
    }

    return sections;
  }

  /**
   * Dibuja una sección completa con paginación inteligente.
   *
   * Algoritmo:
   *  1) Si la sección entera cabe en la página actual → dibujar.
   *  2) Si no cabe pero cabe en una página nueva → page-break + dibujar.
   *  3) Si la sección es más grande que una página → partir, manteniendo
   *     siempre MIN_PAIRS_PER_BREAK pares chord+lyric juntos a cada lado.
   */
  function drawChordSection(doc, section, y, minPairsAfterLabel, minPairsPerBreak) {
    /* Calcular altura total de la sección */
    const labelH = section.label ? (CFG.space.sectionMarginT + CFG.space.sectionMarginB + 4) : 0;
    const itemsH = estimateChordItemsHeight(section.items);
    const totalH = labelH + itemsH;

    /* Determinar si cabe en la página actual */
    if (totalH <= availableSpace(y)) {
      /* Cabe entera → dibujar normal */
      if (section.label) y = drawSectionLabel(doc, section.label, y);
      y = drawChordItems(doc, section.items, y);
      return y;
    }

    /* No cabe entera. Verificar si la podemos meter completa en página nueva. */
    const fullPageAvail = CFG.pageHeight - CFG.marginTop - CFG.marginBottom - 6;
    if (totalH <= fullPageAvail) {
      /* Cabe en página nueva → saltar */
      y = pageBreak(doc);
      if (section.label) y = drawSectionLabel(doc, section.label, y);
      y = drawChordItems(doc, section.items, y);
      return y;
    }

    /* La sección es más grande que una página entera. Hay que partirla.
       Estrategia: si hay label, dibujarlo + asegurar que mínimo
       minPairsAfterLabel pares chord+lyric quepan tras él. Después
       avanzar partiendo por bloques de pares chord+lyric. */

    /* Asegurar espacio para label + minPairsAfterLabel pares.
       Cada "par" típico = 2 líneas (chord + lyric) = ~ 9-10mm. */
    const minSpaceForLabelAndMinPairs = labelH +
      (minPairsAfterLabel * 2 * CFG.space.chordLineH);

    if (section.label && availableSpace(y) < minSpaceForLabelAndMinPairs) {
      y = pageBreak(doc);
    }

    if (section.label) {
      y = drawSectionLabel(doc, section.label, y);
    }

    y = drawChordItemsWithSplit(doc, section.items, y, minPairsPerBreak);
    return y;
  }

  /* Estimar altura de un array de items chord/lyric/note/intro/blank */
  function estimateChordItemsHeight(items) {
    let h = 0;
    items.forEach(function (el) {
      if (el.type === 'blank')             h += 2;
      else if (el.type === 'note')         h += 6;
      else if (el.type === 'intro-line')   h += CFG.space.chordLineH + 1;
      else                                 h += CFG.space.chordLineH;
    });
    return h;
  }

  /* Dibuja la etiqueta de sección (CORO, ESTROFA 1, etc.) */
  function drawSectionLabel(doc, label, y) {
    doc.setHeaderFont('bold');
    doc.setFontSize(CFG.font.sectionSize);
    setText(doc, CFG.color.accentDeep);
    doc.setCharSpace(1.3);
    const labelUp = label.toUpperCase();
    safeText(doc, labelUp, CFG.marginX, y + CFG.space.sectionMarginT);
    doc.setCharSpace(0);

    /* Filete dorado debajo */
    setDraw(doc, CFG.color.accent);
    doc.setLineWidth(0.4);
    doc.setCharSpace(0);
    const tw = doc.getTextWidth(sanitizeText(labelUp)) + 4;
    doc.line(CFG.marginX,
             y + CFG.space.sectionMarginT + 2,
             CFG.marginX + tw,
             y + CFG.space.sectionMarginT + 2);

    return y + CFG.space.sectionMarginT + CFG.space.sectionMarginB + 4;
  }

  /* Dibuja items chord/lyric/note/blank dentro de la página actual.
     Asume que todo cabe — si no, usa drawChordItemsWithSplit. */
  function drawChordItems(doc, items, y) {
    items.forEach(function (el) {
      y = drawChordItem(doc, el, y);
    });
    return y;
  }

  /**
   * Dibuja items partiendo entre páginas con orphan/widow control.
   *
   * Conceptualmente agrupamos los items en "pares" (chord-line + lyric-line)
   * y dibujamos respetando minPairsPerBreak: si nos queda solo 1 par para
   * la página siguiente, mejor empujamos la última pareja a la siguiente
   * para evitar viudas.
   */
  function drawChordItemsWithSplit(doc, items, y, minPairsPerBreak) {
    /* Identificar índices de "pares" — un par es chord-line+lyric-line
       o lyric-line solo o chord-line solo, agrupado por proximidad.
       Para simplificar, tratamos cada chord-line y cada lyric-line como
       una unidad atómica. La regla simple: nunca cortar entre una
       chord-line y la lyric-line inmediatamente siguiente, ni viceversa. */

    let i = 0;
    while (i < items.length) {
      const el = items[i];

      /* Espacio que ocupa el item actual + posiblemente el siguiente
         (si están "atados" — chord seguido de lyric o viceversa) */
      const groupSize = couplingGroupSize(items, i);
      const groupHeight = computeGroupHeight(items, i, groupSize);

      if (groupHeight > availableSpace(y)) {
        /* No cabe el grupo atado → page-break */
        y = pageBreak(doc);
        continue;
      }

      /* Dibuja el grupo atado */
      for (let k = 0; k < groupSize; k++) {
        y = drawChordItem(doc, items[i + k], y);
      }
      i += groupSize;
    }

    return y;
  }

  /**
   * Devuelve el tamaño del "grupo atado" empezando en idx.
   * Reglas:
   *   - chord-line seguida de lyric-line → grupo de 2
   *   - lyric-line seguida de chord-line → grupo de 2 (acordes que continúan)
   *   - blank → grupo de 1
   *   - note → grupo de 1
   *   - cualquier otra cosa → grupo de 1
   */
  function couplingGroupSize(items, idx) {
    if (idx >= items.length) return 0;
    const cur = items[idx];
    const next = items[idx + 1];
    if (!next) return 1;

    if (cur.type === 'chord-line' && next.type === 'lyric-line') return 2;
    if (cur.type === 'lyric-line' && next.type === 'chord-line') return 2;

    return 1;
  }

  function computeGroupHeight(items, idx, size) {
    let h = 0;
    for (let k = 0; k < size; k++) {
      const el = items[idx + k];
      if (el.type === 'blank')           h += 2;
      else if (el.type === 'note')       h += 6;
      else if (el.type === 'intro-line') h += CFG.space.chordLineH + 1;
      else                               h += CFG.space.chordLineH;
    }
    return h;
  }

  /* Dibuja UN solo item (sin paginación — debe haber sido validado antes) */
  function drawChordItem(doc, el, y) {
    if (el.type === 'blank') {
      return y + 2;
    }

    if (el.type === 'note') {
      doc.setFont('times', 'italic');
      doc.setFontSize(CFG.font.noteSize);
      setText(doc, CFG.color.textSoft);
      safeText(doc, el.text, CFG.marginX, y + 3);
      return y + 6;
    }

    if (el.type === 'intro-line') {
      /* Label (e.g. "INTRO:") en Cinzel UPPERCASE dorado oscuro
         seguido de los acordes en courier bold dorado, en la misma línea. */
      doc.setHeaderFont('bold');
      doc.setFontSize(CFG.font.chordSize);
      setText(doc, CFG.color.accentDeep);
      doc.setCharSpace(0.5);
      const labelText = el.label.toUpperCase();
      safeText(doc, labelText, CFG.marginX, y);
      /* Calcular ancho del label (jsPDF ignora char-spacing en getTextWidth) */
      const baseW = doc.getTextWidth(sanitizeText(labelText));
      const extraW = Math.max(0, labelText.length - 1) * 0.5;
      const labelWidth = baseW + extraW;
      doc.setCharSpace(0);

      /* Acordes después del label */
      doc.setFont('courier', 'bold');
      setText(doc, CFG.color.accent);
      safeText(doc, el.chords, CFG.marginX + labelWidth + 3, y);

      return y + CFG.space.chordLineH + 1;
    }

    if (el.type === 'chord-line') {
      doc.setFont('courier', 'bold');
      doc.setFontSize(CFG.font.chordSize);
      setText(doc, CFG.color.accent);
      safeText(doc, el.text, CFG.marginX, y);
      return y + CFG.space.chordLineH;
    }

    if (el.type === 'lyric-line') {
      doc.setFont('courier', 'normal');
      doc.setFontSize(CFG.font.chordSize);
      setText(doc, CFG.color.textBase);
      safeText(doc, el.text, CFG.marginX, y);
      return y + CFG.space.chordLineH + 0.5;
    }

    return y + 2;
  }

  /* ============================================================
     UTILIDADES DE FECHA
     ============================================================ */

  function formatNextSunday() {
    const today = new Date();
    const day = today.getDay(); /* 0 = domingo */
    const daysToSunday = (7 - day) % 7 || 7;
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + daysToSunday);

    const meses = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    return 'Domingo, ' + sunday.getDate() + ' de ' + meses[sunday.getMonth()] +
           ' de ' + sunday.getFullYear();
  }

  /* ── Exportar API pública ─────────────────────────────────────────────── */
  global.PDFBuilder = {
    buildPdf:         buildPdf,
    formatNextSunday: formatNextSunday
  };

})(window);
