/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/26d-pdf-parser.js
 *   @brief      Parser semántico de body_html y chords_html para el generador PDF
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.44r2
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   26d-pdf-parser.js
   ============================================================================
   Convierte el HTML de los cantos (body_html y chords_html de songs.json) en
   estructuras intermedias tipadas que el módulo 27 (pdf-builder) consume sin
   tocar el DOM rendereado.

   FILOSOFÍA:
     Renderizamos al PDF desde la SEMÁNTICA del canto (chorus, strophe, sección,
     línea de acordes, línea de letra), NO desde el DOM rendereado del web. Esto
     permite que el PDF tenga su propio diseño profesional, vectorial y ligero,
     manteniendo coherencia con la identidad visual del cancionero pero
     desacoplado del CSS web.

   ORDEN DE CARGA: 26d (después de fuentes, antes de pdf-builder).
   ============================================================================ */

(function (global) {
  'use strict';

  /* ── Tipos de bloque que produce el parser ────────────────────────────── */
  const BLOCK_TYPES = {
    NOTE:       'note',       /* anotación pequeña (tonalidad, ritmo)       */
    CHORUS:     'chorus',     /* coro — recibe énfasis visual               */
    STROPHE:    'strophe',    /* estrofa                                    */
    LP_SECTION: 'lp-section', /* sección larga (cantos extensos)            */
    ORNAMENT:   'ornament'    /* adorno final (✦ ✦ ✦)                       */
  };

  /* ── Parsea body_html → array de bloques ──────────────────────────────── */
  /**
   * @param {string} html — body_html del canto (de songs.json)
   * @returns {Array<{type:string, lines:string[]}>}
   */
  function parseBodyHtml(html) {
    if (!html) return [];

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    const blocks = [];

    Array.from(wrapper.children).forEach(function (node) {
      const cls = node.className || '';

      let type = null;
      if (cls.indexOf('chorus') !== -1)             type = BLOCK_TYPES.CHORUS;
      else if (cls.indexOf('lp-section') !== -1)    type = BLOCK_TYPES.LP_SECTION;
      else if (cls.indexOf('strophe') !== -1)       type = BLOCK_TYPES.STROPHE;
      else if (cls.indexOf('song-ornament') !== -1) type = BLOCK_TYPES.ORNAMENT;
      else if (cls.indexOf('song-note') !== -1)     type = BLOCK_TYPES.NOTE;
      else                                          type = BLOCK_TYPES.STROPHE;

      let lines = [];
      if (type === BLOCK_TYPES.ORNAMENT || type === BLOCK_TYPES.NOTE) {
        lines = [node.textContent.trim()];
      } else {
        const paragraphs = node.querySelectorAll('p');
        if (paragraphs.length > 0) {
          paragraphs.forEach(function (p) {
            const txt = p.textContent.trim();
            if (txt) lines.push(txt);
          });
        } else {
          const txt = node.textContent.trim();
          if (txt) lines.push(txt);
        }
      }

      if (lines.length > 0) {
        blocks.push({ type: type, lines: lines });
      }
    });

    return blocks;
  }

  /* ── Parsea chords_html → array de elementos tipados ──────────────────── */
  /**
   * El chords_html viene como texto preformateado con marcadores HTML:
   *   <b>♫ Título</b>           — cabecera del canto (descartamos)
   *   <b>═══ CORO ═══</b>       — etiqueta de sección
   *   "letra de la línea"
   *   <span class="chord">DO</span> ... — línea de acordes alineada con espacios
   *
   * Devolvemos elementos con type ∈ {'header', 'section', 'note',
   * 'chord-line', 'lyric-line', 'blank'}.
   */
  function parseChordsHtml(html) {
    if (!html) return [];

    const elements = [];

    /* 1) Reemplazar <span class="chord">X</span> por solo "X" preservando
          posición — los acordes ya tienen los espacios de alineación en
          el texto plano del HTML. */
    const chordless = html.replace(
      /<span class="chord">([^<]+)<\/span>/g,
      '$1'
    );

    /* 2) Procesar línea por línea */
    const rawLines = chordless.split('\n');

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      /* Línea vacía → marcador de separación */
      if (!trimmed) {
        elements.push({ type: 'blank', text: '' });
        continue;
      }

      /* Cabecera "♫ Título": la descartamos porque ya viene del campo title */
      if (/<b>♫/.test(trimmed)) {
        continue;
      }

      /* Etiqueta de sección.
         Soporta variantes:
           <b>═══ CORO ═══</b>
           <b>═══ ESTROFA 1 ═══ TONALIDAD: DO</b>     ← texto extra al final
           <b>═══ ESTROFAS (mismos acordes) ═══</b>
         La etiqueta se compone de "LABEL — EXTRA" si hay texto adicional. */
      const boldMatch = trimmed.match(/<b>([\s\S]+?)<\/b>/);
      if (boldMatch) {
        const inner = boldMatch[1];
        const sectionPattern = /═══\s*([^═]+?)\s*═══/;
        const sm = inner.match(sectionPattern);
        if (sm) {
          const label = sm[1].trim();
          /* Texto que sobra antes/después del bloque ═══ ... ═══ */
          const remainder = inner.replace(sectionPattern, '').trim();
          const finalLabel = remainder ? (label + ' — ' + remainder) : label;
          elements.push({ type: 'section', text: finalLabel });
          continue;
        }
      }

      /* Anotación con ⚠ (TONALIDAD, etc.) */
      if (/^⚠/.test(trimmed)) {
        elements.push({ type: 'note', text: trimmed });
        continue;
      }

      /* Patrón "<b>LABEL:</b> contenido" — anotación con acordes después
         (típicamente INTRO:, OUTRO:, INTERLUDIO:, PUENTE:, etc.).
         Si el contenido tras el label son todos acordes válidos, emitimos
         un tipo 'intro-line' que se renderiza con label + acordes en una
         sola línea. Si no son acordes, lo tratamos como lyric-line para
         evitar mostrar HTML literal. */
      const labelMatch = trimmed.match(/^<b>([^<]+)<\/b>\s*(.*)$/);
      if (labelMatch) {
        const label = labelMatch[1].trim();
        const rest = labelMatch[2].trim();

        if (!rest) {
          /* Solo "<b>X</b>" sin contenido extra → nota inline */
          elements.push({ type: 'note', text: label });
        } else if (isChordLine(rest)) {
          /* "INTRO: SOL RE DO9..." → línea especial con label + acordes */
          elements.push({ type: 'intro-line', label: label, chords: rest });
        } else {
          /* Contenido mixto que no son solo acordes → strip tags y tratar
             como lyric-line para evitar mostrar HTML crudo. */
          elements.push({ type: 'lyric-line', text: label + ' ' + rest });
        }
        continue;
      }

      /* Heurística: línea de acordes vs línea de letra.
         Una línea es "de acordes" si TODOS sus tokens son acordes válidos. */
      if (isChordLine(line)) {
        elements.push({ type: 'chord-line', text: line.replace(/\s+$/, '') });
      } else {
        elements.push({ type: 'lyric-line', text: line.replace(/\s+$/, '') });
      }
    }

    return elements;
  }

  /* ── Detección de línea de acordes ────────────────────────────────────── */
  /**
   * Notación esperada (latina, estándar Coro Pacem Deus):
   *   - Mayores: DO, RE, MI, FA, SOL, LA, SI
   *   - Menores: Dom, Rem, Mim, Fam, Solm, Lam, Sim
   *   - Sostenidos/bemoles: DO#, MIb, FA#, SIb, Do#m, Fa#m
   *   - Sufijos: 7, 9, maj7, sus, dim, aug, +
   *   - Slash chords: Lam/SOL, FA/LA, Rem/DO
   *
   * Una línea es "de acordes" si TODOS sus tokens son acordes válidos.
   */
  const NOTE_PATTERN = '(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si|[A-G])';
  const CHORD_RE = new RegExp(
    '^' + NOTE_PATTERN +
    '(?:#|b)?' +
    '(?:m|maj|dim|aug|sus[24]?)?' +
    '\\d*' +
    '(?:\\+)?' +
    '(?:\\/' + NOTE_PATTERN + '(?:#|b)?)?' +
    '$'
  );

  function isChordLine(line) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0) return false;

    let chordCount = 0;
    let nonChordCount = 0;

    tokens.forEach(function (t) {
      if (CHORD_RE.test(t)) chordCount++;
      else                   nonChordCount++;
    });

    return chordCount > 0 && nonChordCount === 0;
  }

  /* ── Exportar API pública ─────────────────────────────────────────────── */
  global.PDFParser = {
    BLOCK_TYPES:     BLOCK_TYPES,
    parseBodyHtml:   parseBodyHtml,
    parseChordsHtml: parseChordsHtml,
    isChordLine:     isChordLine
  };

})(window);
