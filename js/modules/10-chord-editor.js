/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/10-chord-editor.js
 *   @brief      Editor fullscreen de acordes con guardado en Firebase
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.45
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   10-chord-editor.js
   ============================================================================
   Editor de acordes (Modo Coro) — fullscreen + Firebase

   MUY CRÍTICO. openChordEditor(), normalizeChord, isValidChord, write/read a Firebase. NO TOCAR LÓGICA.

   ORDEN DE CARGA: posición 10 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

  // ── Get permanent chord ID (never changes on renumbering/reordering) ──
  function getChordKey(blockId) {
    var block = document.getElementById('chords-block-' + blockId);
    if (!block) return blockId;
    var card = block.closest('.song-card');
    if (!card) return blockId;
    return card.getAttribute('data-chord-id') || blockId;
  }

var FIREBASE_URL = 'https://coropacemdeusdominical-default-rtdb.firebaseio.com';

// ── CHORD EDITOR MODE ─────────────────────────────
(function() {
  var overlay    = document.getElementById('chord-editor-overlay');
  var textarea   = document.getElementById('chord-editor-textarea');
  var status     = document.getElementById('chord-editor-status');
  var saveBtn    = document.getElementById('editor-save-btn');
  var cancelBtn  = document.getElementById('editor-cancel-btn');
  var resetBtn   = document.getElementById('editor-reset-btn');
  var titleEl      = document.getElementById('chord-editor-title');
  var highlightDiv   = document.getElementById('editor-highlight');
  var diagnosePanel  = document.getElementById('editor-diagnose-panel');
  var diagnosePre    = document.getElementById('editor-diagnose-panel-content');

  var currentBlockId = null;
  var originalHtml   = null;

  // ── Real-time syntax highlight ──────────────────────
  // Parses the textarea content and renders chord lines in amber.
  // Called on input, paste, scroll, and whenever editor content changes.
  function refreshHighlight() {
    if (!highlightDiv) return;
    var lines = textarea.value.split('\n');
    var htmlLines = lines.map(function(line) {
      var trimmed = line.trim();

      // Header lines (═══, ♫, ⚠) and == shorthand
      if (/^[═♫⚠]/.test(trimmed) || /^==\s/.test(trimmed)) {
        return '<span class="hl-header">' + escHtml(line) + '</span>';
      }

      // Capo lines: * Capo +N *
      if (/^\*\s.+\s\*$/.test(trimmed)) {
        return '<span class="hl-capo">' + escHtml(line) + '</span>';
      }

      // Dynamic lines: # Forte # or ## Forte ##
      if (/^#{1,2}\s.+\s#{1,2}$/.test(trimmed)) {
        return '<span class="hl-dynamic">' + escHtml(line) + '</span>';
      }

      // Empty line
      if (!trimmed) return '';

      // Check if every token is a valid chord
      var tokens = trimmed.split(/\s+/).filter(Boolean);
      var allChords = tokens.length > 0 && tokens.every(function(t) {
        return isValidChord(t);
      });

      if (allChords) {
        /* Colorear cada acorde y normalizarlo en vivo SOLO cuando la
           normalización no cambia el largo del token. Esto preserva la UX
           histórica (ej: SOLM → Solm, lam → Lam, mim → Mim) sin causar el
           bug de desfase de líneas que ocurriría si normalizamos casos
           que SÍ alteran el largo (ej: C → DO agrega 1 char, G → SOL
           agrega 2, Cmaj7 → DOmaj7 agrega 1). En esos casos dejamos el
           texto original en el highlight; la normalización completa se
           aplica al guardar, momento en el que el usuario ya ve el
           diálogo "se normalizaron N línea(s)" y decide si confirma. */
        return line.replace(/\S+/g, function(token) {
          var normalized = normalizeChord(token);
          var displayToken = (normalized.length === token.length) ? normalized : token;
          return '<span class="hl-chord">' + escHtml(displayToken) + '</span>';
        });
      }

      // Regular lyric line
      return escHtml(line);
    });

    // Compensar la línea fantasma del textarea: si textarea.value termina
    // con '\n', el textarea renderiza una línea visual extra al final que el
    // <div> con white-space:pre-wrap no muestra. Sin esto, el highlight
    // queda 1 línea más corto que el textarea, y el cursor se desfasa.
    // Agregamos un espacio invisible para forzar la línea final.
    var html = htmlLines.join('\n');
    if (textarea.value.endsWith('\n')) {
      html += ' ';
    }
    highlightDiv.innerHTML = html;

    // Compensar el ancho del scrollbar del textarea: el textarea tiene
    // overflow-y:scroll que reserva ~15px de scrollbar reduciendo su ancho
    // útil. El highlight no muestra ese scrollbar, así que tendría 15px más
    // de ancho útil → wrappea más tarde → desincronización progresiva
    // línea a línea. Medimos el scrollbar dinámicamente (varía por OS) y
    // ajustamos el padding-right del highlight para que el ancho disponible
    // para texto sea exactamente el mismo en ambos elementos.
    var scrollbarWidth = textarea.offsetWidth - textarea.clientWidth;
    if (scrollbarWidth > 0) {
      var taPaddingRight = parseFloat(getComputedStyle(textarea).paddingRight) || 0;
      highlightDiv.style.paddingRight = (taPaddingRight + scrollbarWidth) + 'px';
    }

    // Sync scroll position with textarea
    highlightDiv.scrollTop = textarea.scrollTop;
  }

  // ── Chord notation standard (v2 — cobertura completa de teoría musical) ──
  // Anatomía de un acorde válido en notación latina:
  //   [RAÍZ][ALTERACIÓN][CALIDAD][EXTENSIONES][ALT_INTERNAS][/BAJO]
  //
  // Ejemplos cubiertos:
  //   Mayores: DO, RE7, FA#, SIb, DO7+, DOmaj7, DOM7, DO13b9
  //   Menores: Dom, Fa#m, Fam# (orden flexible), Lam7, Sim7b5, Lamadd9
  //   Aumentados: DOaug, DO+, DO7+, DOaug7
  //   Disminuidos: SIdim, FA#°, DOdim7, SI°7
  //   Semi-disminuidos: Sim7b5, Lamø, Simø7
  //   Suspendidos: DOsus2, DOsus4, DOsus, LA4 (= LAsus4), RE2 (= REsus2)
  //   Add: DOadd9, Lamadd9, DOadd11
  //   Slash: DO/SOL, FA/LA, Lam/FA#, FA/SIb, DO7+(9)
  //   Anglosajón aceptado y normalizado: G→SOL, Am→Lam, Bb→SIb, F#m→Fa#m
  //
  // Notación canónica de salida:
  //   - Mayores en CAPS:    DO, RE7, FA#, SIb, DO7+
  //   - Menores Title + m:  Dom, Rem7, Fa#m, Lam7b5
  //   - Bajo siempre CAPS:  /SOL, /FA#, /SIb
  //   - Alteración SIEMPRE entre raíz y calidad: Fa#m (NO Fam#), Sibm (NO Simb)

  // 1. Variantes de raíz (ordenadas por longitud — DO antes que D, etc.)
  var ROOT_VARIANTS = [
    { match: /^sol/i,  canonical: 'SOL', length: 3 },
    { match: /^do/i,   canonical: 'DO',  length: 2 },
    { match: /^re/i,   canonical: 'RE',  length: 2 },
    { match: /^mi/i,   canonical: 'MI',  length: 2 },
    { match: /^fa/i,   canonical: 'FA',  length: 2 },
    { match: /^la/i,   canonical: 'LA',  length: 2 },
    { match: /^si/i,   canonical: 'SI',  length: 2 },
    { match: /^A/,     canonical: 'LA',  length: 1 },
    { match: /^B/,     canonical: 'SI',  length: 1 },
    { match: /^C/,     canonical: 'DO',  length: 1 },
    { match: /^D/,     canonical: 'RE',  length: 1 },
    { match: /^E/,     canonical: 'MI',  length: 1 },
    { match: /^F/,     canonical: 'FA',  length: 1 },
    { match: /^G/,     canonical: 'SOL', length: 1 }
  ];

  // 2. Filtro: distinguir acordes de palabras de la letra
  // Tokens "Mi", "Yo", "al", "Re", "Do" sin sufijos son texto, no acordes.
  // El cancionero usa CAPS para acordes sin calidad → rechazamos Title-case
  // de raíz sola y letras anglosajonas solas.
  function looksLikeChord(raw) {
    if (!raw || raw.length === 0) return false;
    if (/^(?:Do|Re|Mi|Fa|Sol|La|Si)$/.test(raw)) return false;
    if (/^[A-G]$/.test(raw)) return false;
    if (/[#b♯♭0-9°ø+/()]/.test(raw)) return true;
    if (/^(?:DO|RE|MI|FA|SOL|LA|SI|Do|Re|Mi|Fa|Sol|La|Si)/.test(raw)) {
      if (/(?:m|min|Min|MIN|maj|Maj|MAJ|M|sus|aug|dim|add)$/.test(raw) ||
          /(?:m|min|Min|MIN|maj|Maj|MAJ|sus|aug|dim|add)/.test(raw)) {
        return true;
      }
      if (/^(?:DO|RE|MI|FA|SOL|LA|SI)$/.test(raw)) return true;
    }
    if (/^[A-G](?:m|min|maj|sus|aug|dim|add)/.test(raw)) return true;
    return false;
  }

  function normalizeAccidental(acc) {
    if (acc === '♯') return '#';
    if (acc === '♭') return 'b';
    return acc || '';
  }

  // 3. Parser principal — prueba múltiples interpretaciones de orden
  function parseChord(raw) {
    if (!raw) return null;
    var input = String(raw).trim();
    if (!input) return null;

    var cleaned = input.replace(/[()]/g, '');
    if (!cleaned) return null;

    var bassRoot = null;
    var bassAccidental = '';
    var slashIdx = cleaned.indexOf('/');
    var mainPart = cleaned;

    if (slashIdx > 0) {
      var afterSlash = cleaned.substring(slashIdx + 1);
      if (/^\d/.test(afterSlash)) {
        // 6/9 — no es slash chord, es notación rara que dejamos en mainPart
      } else {
        mainPart = cleaned.substring(0, slashIdx);
        var bassParsed = parseRoot(afterSlash);
        if (!bassParsed || bassParsed.rest.length > 0) return null;
        bassRoot = bassParsed.root;
        bassAccidental = bassParsed.accidental;
      }
    }

    var result = tryParseMainPart(mainPart);
    if (!result) return null;

    return {
      root: result.root,
      accidental: result.accidental,
      isMinor: result.isMinor,
      quality: result.quality,
      bassRoot: bassRoot,
      bassAccidental: normalizeAccidental(bassAccidental)
    };
  }

  function parseRoot(input) {
    if (!input) return null;
    var sorted = ROOT_VARIANTS.slice().sort(function(a, b) {
      return b.length - a.length;
    });
    for (var i = 0; i < sorted.length; i++) {
      var v = sorted[i];
      if (v.match.test(input)) {
        var rest = input.substring(v.length);
        var accidental = '';
        if (rest.length > 0) {
          var ch = rest[0];
          if (ch === '#' || ch === 'b' || ch === '♯' || ch === '♭') {
            accidental = ch;
            rest = rest.substring(1);
          }
        }
        return { root: v.canonical, accidental: accidental, rest: rest };
      }
    }
    return null;
  }

  function tryParseMainPart(mainPart) {
    var sorted = ROOT_VARIANTS.slice().sort(function(a, b) {
      return b.length - a.length;
    });
    for (var i = 0; i < sorted.length; i++) {
      var v = sorted[i];
      if (!v.match.test(mainPart)) continue;
      var rootStr = v.canonical;
      var afterRoot = mainPart.substring(v.length);
      var candidates = generateCandidates(rootStr, afterRoot);
      for (var j = 0; j < candidates.length; j++) {
        var c = candidates[j];
        if (isValidQuality(c.quality, c.isMinor)) return c;
      }
      break;
    }
    return null;
  }

  // Genera todas las interpretaciones del afterRoot (orden #/b vs m flexible)
  function generateCandidates(root, afterRoot) {
    var candidates = [];

    // Caso 1: alteración + m + quality (Fa#m, Reb m, REbm)
    var m1 = afterRoot.match(/^([#b♯♭])(m|min|Min|MIN)(.*)$/);
    if (m1) candidates.push({
      root: root, accidental: normalizeAccidental(m1[1]),
      isMinor: true, quality: m1[3]
    });

    // Caso 2: m + alteración + quality (Fam#, Remb)
    var m2 = afterRoot.match(/^(m|min|Min|MIN)([#b♯♭])(.*)$/);
    if (m2) candidates.push({
      root: root, accidental: normalizeAccidental(m2[2]),
      isMinor: true, quality: m2[3]
    });

    // Caso 3: alteración + quality (mayor con alteración: FA#7, MIb9)
    var m3 = afterRoot.match(/^([#b♯♭])(.*)$/);
    if (m3) {
      var q = m3[2];
      // No aceptar si quality empieza con m que no sea maj/min
      if (!/^m(?!aj|in|Min|MIN|M)/.test(q)) {
        candidates.push({
          root: root, accidental: normalizeAccidental(m3[1]),
          isMinor: false, quality: q
        });
      }
    }

    // Caso 4: m + quality (Lamadd9, Dom7, Lamaug)
    var m4 = afterRoot.match(/^(m|min|Min|MIN)(.*)$/);
    if (m4) {
      var q4 = m4[2];
      // 'maj' empieza con m pero NO es menor
      if (!/^aj/.test(q4)) {
        candidates.push({
          root: root, accidental: '', isMinor: true, quality: q4
        });
      }
    }

    // Caso 5: sin alteración, sin m, solo quality (mayor: DO7, FAmaj7, REsus4)
    candidates.push({
      root: root, accidental: '', isMinor: false, quality: afterRoot
    });

    return candidates;
  }

  // 4. Validador de quality/extensiones — cobertura completa
  function isValidQuality(q, isMinor) {
    if (!q) return true;
    var QUALITY_RE = new RegExp('^(?:' +
      // Mayor séptima: M7, maj7, Maj7, MAJ7, M, maj
      '(?:M|maj|Maj|MAJ)(?:6|7|9|11|13)?(?:[b#]\\d+)*\\+?|' +
      // Semi-disminuido: ø, ø7
      'ø(?:7)?|' +
      // Disminuido: dim, °, dim7, °7
      '(?:dim|°)(?:7)?|' +
      // Aumentado: aug, +, aug7, +7, +M7
      '(?:aug|\\+)(?:[679]|11|13|M7|maj7)?|' +
      // Suspendido: sus, sus2, sus4, sus(add9), 7sus4
      'sus[24]?(?:7|9|11|13)?(?:[b#]\\d+)*|' +
      // Add: add9, add11, add2, add4, add6
      'add(?:2|4|6|9|11|13)|' +
      // Sexta-novena: 6/9
      '6\\/9|' +
      // Quinta (power chord): 5
      '5(?![0-9])|' +
      // Suspendido abreviado: 4 = sus4, 2 = sus2
      '[24](?![0-9])|' +
      // Numérica con alteraciones internas: 7, 9, 13, 7b9, 7#5, 13b9#5, 7+9
      '(?:6|7|9|11|13)(?:[b#](?:5|9|11|13))*\\+?(?:9|11|13)?(?:sus[24]?)?(?:add(?:2|4|9|11))?\\+?|' +
      // 7 con add9 fusionado (residuo de quitar paréntesis: 7(9) → 79)
      '7(?:9|11|13)|' +
      // Solo + (mayor7 abreviado)
      '\\+' +
    ')$');
    return QUALITY_RE.test(q);
  }

  // 5. Normalizador — produce notación canónica
  function normalizeChord(raw) {
    if (!raw) return raw;
    var input = String(raw).trim();
    if (input.indexOf('-') >= 0) {
      return input.split('-').map(function(p) {
        return normalizeChord(p.trim());
      }).join('-');
    }
    var parsed = parseChord(input);
    if (!parsed) return input;

    var rootStr;
    if (parsed.isMinor) {
      rootStr = parsed.root.charAt(0) + parsed.root.substring(1).toLowerCase();
    } else {
      rootStr = parsed.root;
    }

    var result = rootStr + parsed.accidental;
    if (parsed.isMinor) result += 'm';

    if (parsed.quality) {
      var q = parsed.quality;
      q = q.replace(/^(?:Maj|MAJ)/, 'maj');
      q = q.replace(/^M(?=\d|$)/, 'maj');
      result += q;
    }

    if (parsed.bassRoot) {
      result += '/' + parsed.bassRoot + parsed.bassAccidental;
    }
    return result;
  }

  // 6. Validador público
  function isValidChord(token) {
    if (!token) return false;
    var clean = String(token).trim().replace(/[()]/g, '').trim();
    if (!clean) return false;
    if (clean.indexOf('-') >= 0) {
      return clean.split('-').every(function(p) {
        return isValidChord(p.trim());
      });
    }
    if (!looksLikeChord(clean)) return false;
    return parseChord(clean) !== null;
  }

  function isHeaderLine(line) {
    var t = line.trim();
    return t.startsWith('═') || t.startsWith('==') || t.startsWith('♫') || t.startsWith('⚠') ||
           t.startsWith('(Rep') || t.startsWith('INTRO') || t.startsWith('//') ||
           t === '' || /^\d+\./.test(t);
  }

  // ── Convert HTML pre content → plain text ──
  function htmlToText(htmlStr) {
    return htmlStr
      .replace(/<b class="chord-capo">(.*?)<\/b>/g, '* $1 *')
      .replace(/<b class="chord-dynamic">(.*?)<\/b>/g, '## $1 ##')
      .replace(/<b[^>]*>(.*?)<\/b>/g, '$1')
      .replace(/<span class="chord">(.*?)<\/span>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  // ── Convert edited text → HTML with chord spans ──
  function textToHtml(text) {
    var lines = text.split('\n');
    var result = [];
    var errors = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // Headers → bold
      // Incluye: ═══ secciones ═══ | ♫ título | ⚠ avisos | * Capo +N * 
      // Normalize == to ═══ (easier to type)
      if (/^==\s*(.*?)\s*==$/.test(trimmed)) {
        trimmed = '\u2550\u2550\u2550 ' + trimmed.replace(/^==\s*/, '').replace(/\s*==$/, '') + ' \u2550\u2550\u2550';
        line = trimmed;
      }
      if (/^[═♫⚠]/.test(trimmed) || /^═/.test(trimmed) || /^\*\s.*\s\*$/.test(trimmed)) {
        result.push('<b>' + escHtml(trimmed) + '</b>');
        continue;
      }

      // Dynamics → bold (will be decorated as chord-dynamic)
      // Incluye: # Forte # | ## Forte ## | # Piano #
      if (/^#{1,2}\s.+\s#{1,2}$/.test(trimmed)) {
        result.push('<b>' + escHtml(trimmed) + '</b>');
        continue;
      }

      // Empty line
      if (!trimmed) { result.push(''); continue; }

      // Check if line is all chords (every non-space token is a chord)
      var tokens = trimmed.split(/\s+/);
      var allChords = tokens.length > 0 && tokens.every(function(t) {
        return isValidChord(t);
      });


      if (allChords && tokens.length > 0) {
        // Rebuild line preserving spacing, wrapping each chord
        var rebuilt = line;
        // Replace each chord token with <span class="chord">
        // Work from right to left to preserve positions
        var matches = [];
        var re = /\S+/g;
        var m;
        while ((m = re.exec(line)) !== null) {
          matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        }
        for (var j = matches.length - 1; j >= 0; j--) {
          var mt = matches[j];
          // Wrap compound chords (DO-MI7) — each part gets its own span
          // Auto-correct notation: lam→Lam, LAm→Lam, do→DO, etc.
          var chordParts = mt.text.split('-');
          var wrapped = chordParts.map(function(cp) {
            return '<span class="chord">' + escHtml(normalizeChord(cp)) + '</span>';
          }).join('-');
          rebuilt = rebuilt.substring(0, mt.start) + wrapped + rebuilt.substring(mt.end);
        }
        result.push(rebuilt);
      } else {
        // Check for mixed lines — if some tokens look like chords but not all
        // This is a lyric line, pass as-is
        result.push(escHtml(line));

        // But validate: warn if a token looks chord-ish but isn't valid
        tokens.forEach(function(t) {
          if (/^[A-Z]{2,3}[#b]?[m7]/.test(t) && !isValidChord(t)) {
            errors.push('Línea ' + (i+1) + ': "' + t + '" parece un acorde pero no es válido');
          }
        });
      }
    }

    return { html: result.join('\n'), errors: errors };
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── INPUT / SCROLL → refresh highlight ──
  // 'input' fires after typing AND after paste — covers both cases.
  textarea.addEventListener('input', refreshHighlight);
  textarea.addEventListener('scroll', function() {
    if (highlightDiv) highlightDiv.scrollTop = textarea.scrollTop;
  });

  // ── OPEN EDITOR ──
  window.openChordEditor = function(blockId) {
    currentBlockId = blockId;
    // Exponer el cpd-id para CPDHistory (historial de acordes)
    window._currentChordEditorCpdId = getChordKey(blockId);
    window.chordHtmlToText = htmlToText;
    window.refreshChordHighlight = refreshHighlight;
    var block = document.getElementById('chords-block-' + blockId);
    if (!block) return;
    var pre = block.querySelector('pre');
    if (!pre) return;

    // Exit browser fullscreen if active (chord block fullscreen)
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      var exitFS = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFS) exitFS.call(document);
    }

    // Reset any active transposition before reading
    var chords = pre.querySelectorAll('.chord');
    chords.forEach(function(el) {
      if (el.dataset.original) el.textContent = el.dataset.original;
    });

    // Store original (untransposed) for reset
    originalHtml = pre.innerHTML;

    // Convert to plain text
    textarea.value = htmlToText(pre.innerHTML);
    refreshHighlight();  // render initial highlight
    titleEl.textContent = 'Modo Edición — ' + (pre.querySelector('b') ? htmlToText(pre.querySelector('b').innerHTML) : blockId);
    status.textContent = 'Edita los acordes. Al guardar se subirán a la nube.';
    status.className = '';
    cancelBtn.textContent = 'Cancelar';

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // On touch devices (tablet/phone), skip native fullscreen to avoid
    // keyboard conflicts. Use CSS fixed positioning instead.
    var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    setTimeout(function() {
      if (!isTouch) {
        var el = overlay;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }
      textarea.focus();
    }, 100);
  };

  // ── SAVE ──
  saveBtn.addEventListener('click', function() {
    var result = textToHtml(textarea.value);

    if (result.errors.length > 0) {
      status.textContent = result.errors[0] + (result.errors.length > 1 ? ' (+' + (result.errors.length-1) + ' más)' : '');
      status.className = 'error';
      return;
    }

    // Check if normalization changed any chords
    var originalText = textarea.value;
    var normalizedText = htmlToText(result.html);
    var diffs = [];
    var origLines = originalText.split('\n');
    var normLines = normalizedText.split('\n');
    for (var i = 0; i < origLines.length; i++) {
      if (i < normLines.length && origLines[i].trim() !== normLines[i].trim() && origLines[i].trim().length > 0) {
        diffs.push((i+1) + ': "' + origLines[i].trim() + '" → "' + normLines[i].trim() + '"');
      }
    }

    if (diffs.length > 0) {
      // Show normalization dialog
      status.className = '';
      status.textContent = 'Se normalizaron ' + diffs.length + ' línea(s): ' + diffs[0] + (diffs.length > 1 ? ' (+' + (diffs.length-1) + ' más)' : '') + ' — ¿Guardar con normalización?';
      
      // Create Yes/No buttons in status bar
      var yesBtn = document.createElement('button');
      yesBtn.textContent = 'Sí';
      yesBtn.style.cssText = 'margin-left:1rem;padding:0.3rem 1rem;border:1px solid #5C7A3A;background:#5C7A3A;color:#fff;font-family:Cinzel,serif;font-size:0.6rem;letter-spacing:0.1em;cursor:pointer;border-radius:2px;';
      var noBtn = document.createElement('button');
      noBtn.textContent = 'No';
      noBtn.style.cssText = 'margin-left:0.5rem;padding:0.3rem 1rem;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#ccc;font-family:Cinzel,serif;font-size:0.6rem;letter-spacing:0.1em;cursor:pointer;border-radius:2px;';
      
      status.appendChild(yesBtn);
      status.appendChild(noBtn);
      
      noBtn.addEventListener('click', function() {
        status.textContent = 'Guardado cancelado. Edita los acordes manualmente si lo prefieres.';
        status.className = '';
      });
      
      yesBtn.addEventListener('click', function() {
        // Update the editor to show normalized text before saving
        textarea.value = normalizedText;
        refreshHighlight();
        doSave(result.html);
      });
      return;
    }

    // No normalization needed, save directly
    doSave(result.html);
  });

  function doSave(htmlContent) {
    var block = document.getElementById('chords-block-' + currentBlockId);
    if (!block) return;
    var pre = block.querySelector('pre');
    if (!pre) return;

    pre.innerHTML = htmlContent;
    if (window.decorateChordBlock) window.decorateChordBlock(block);
    saveBtn.disabled = true;
    status.textContent = '⏳ Guardando en la nube...';
    status.className = '';

    var saveId = currentBlockId;
    var chordKey = getChordKey(saveId);
    window._currentChordEditorCpdId = chordKey;
    window.chordHtmlToText = htmlToText;
    window.refreshChordHighlight = refreshHighlight;

    window.CPDHistory.saveWithHistory('chord', chordKey, htmlContent)
    .then(function() {
      status.textContent = '⏳ Verificando en la base de datos...';
      return fetch(FIREBASE_URL + '/chord-overrides/' + chordKey + '.json');
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Error al verificar: HTTP ' + r.status);
      return r.json();
    })
    .then(function(saved) {
      if (saved && saved.length > 10) {
        status.textContent = '✓ Confirmado: acordes guardados (' + chordKey + ')';
        status.className = 'success';
        saveBtn.disabled = false;
        cancelBtn.textContent = 'Cerrar';
      } else {
        throw new Error('La verificación devolvió datos vacíos');
      }
    })
    .catch(function(err) {
      status.textContent = '✗ ' + err.message;
      status.className = 'error';
      saveBtn.disabled = false;
    });
  }

  // ── CANCEL ──
  cancelBtn.addEventListener('click', closeEditor);

  // ── RESET (undo to state when editor opened) ──
  resetBtn.addEventListener('click', function() {
    if (!currentBlockId || !originalHtml) return;
    var block = document.getElementById('chords-block-' + currentBlockId);
    if (block) {
      var pre = block.querySelector('pre');
      if (pre) {
        pre.innerHTML = originalHtml;
        if (window.decorateChordBlock) window.decorateChordBlock(block);
      }
    }
    textarea.value = htmlToText(originalHtml);
    refreshHighlight();  // re-render highlight after reset
    status.textContent = '✓ Restaurado al estado anterior (sin cambios en la nube)';
    status.className = 'success';
  });

  // ── RESET HTML (dev mode: restore to inline HTML + delete Firebase override) ──
  document.getElementById('editor-reset-html-btn').addEventListener('click', function() {
    if (!currentBlockId) return;
    var chordKey = getChordKey(currentBlockId);
    
    // Delete from Firebase
    fetch(FIREBASE_URL + '/chord-overrides/' + chordKey + '.json', {
      method: 'DELETE'
    }).then(function() {
      status.textContent = '✓ Override eliminado de Firebase (' + chordKey + '). Recarga la página para ver los acordes originales del HTML.';
      status.className = 'success';
    }).catch(function(err) {
      status.textContent = '✗ Error: ' + err.message;
      status.className = 'error';
    });
  });

  // ── CLOSE DIAGNOSE PANEL ──
  document.getElementById('editor-diagnose-panel-close').addEventListener('click', function() {
    diagnosePanel.classList.remove('open');
    diagnosePre.textContent = '';
  });

  // ── RELOAD FIREBASE OVERRIDES (Dev Mode) ──
  document.getElementById('editor-reload-btn').addEventListener('click', function() {
    status.textContent = '⏳ Recargando overrides desde Firebase...';
    status.className = '';
    // Replace loadFirebaseOverrides with a version that reports to status
    fetch(FIREBASE_URL + '/chord-overrides.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data) {
          status.textContent = 'Firebase vacío — no hay overrides que aplicar.';
          status.className = '';
          return;
        }
        var applied = 0;
        document.querySelectorAll('.chords-block').forEach(function(block) {
          var blockId = block.id.replace('chords-block-', '');
          var slug = getChordKey(blockId);
          if (data[slug]) {
            var pre = block.querySelector('pre');
            if (pre) {
              pre.innerHTML = data[slug];
              if (window.decorateChordBlock) window.decorateChordBlock(block);
              applied++;
              console.log('[Dev] Override recargado: ' + slug + ' → ' + blockId);
            }
          }
        });
        status.textContent = '✓ ' + applied + ' override(s) recargados desde Firebase. Los cambios ya son visibles en el cancionero.';
        status.className = 'success';
      })
      .catch(function(err) {
        status.textContent = '✗ Error al recargar: ' + err.message;
        status.className = 'error';
      });
  });

  function closeEditor() {
    // Close diagnose panel if open
    diagnosePanel.classList.remove('open');
    diagnosePre.textContent = '';
    // Exit fullscreen if editor is in fullscreen
    if (document.fullscreenElement === overlay || document.webkitFullscreenElement === overlay) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    overlay.classList.remove('open');
    // Reset viewport adjustments
    overlay.style.height = '';
    overlay.style.top = '';
    overlay.style.bottom = '';
    document.body.style.overflow = '';
    currentBlockId = null;
    originalHtml = null;
  }

  /* ── VIRTUAL KEYBOARD HANDLING (tablet/phone) ──
     When the on-screen keyboard appears, the visual viewport shrinks.
     We resize the editor overlay to fit above the keyboard. */
  if (window.visualViewport) {
    var adjustEditorViewport = function() {
      if (!overlay.classList.contains('open')) return;
      // If in native fullscreen, browser handles it — skip
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      var vv = window.visualViewport;
      overlay.style.height = vv.height + 'px';
      overlay.style.top = vv.offsetTop + 'px';
      overlay.style.bottom = 'auto';
    };
    window.visualViewport.addEventListener('resize', adjustEditorViewport);
    window.visualViewport.addEventListener('scroll', adjustEditorViewport);
  }


  // ── DIAGNOSE FIREBASE OVERRIDES (Dev Mode) ──
  document.getElementById('editor-diagnose-btn').addEventListener('click', function() {
    status.textContent = '⏳ Leyendo Firebase...';
    status.className = '';
    
    fetch(FIREBASE_URL + '/chord-overrides.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var lines = [];
        lines.push('══════════════════════════════════════════');
        lines.push('DIAGNÓSTICO COMPLETO — ' + new Date().toLocaleString());
        lines.push('Firebase URL: ' + FIREBASE_URL);
        lines.push('══════════════════════════════════════════');
        
        if (!data) {
          lines.push('\nFirebase: VACÍO (sin overrides)');
        } else {
          var keys = Object.keys(data).sort();
          lines.push('\n═══ FIREBASE OVERRIDES (' + keys.length + ') ═══\n');
          
          keys.forEach(function(key) {
            var content = data[key] || '';
            var titleMatch = content.match(/♫\s*([^<]+)/);
            var title = titleMatch ? titleMatch[1].trim() : '(sin título ♫)';
            var hasSpans = content.indexOf('<span class="chord">') >= 0;
            var chordCount = (content.match(/<span class="chord">/g) || []).length;
            var lineCount = content.split('\n').length;
            
            // Plain-text preview (first 12 non-empty lines)
            var plainText = content
              .replace(/<b>(.*?)<\/b>/g, '$1')
              .replace(/<span class="chord">(.*?)<\/span>/g, '$1')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

            lines.push('Clave: ' + key);
            lines.push('  Título: ' + title);
            lines.push('  Tamaño: ' + content.length + ' chars | ' + lineCount + ' líneas | ' + chordCount + ' acordes formateados');
            lines.push('  Tiene spans: ' + (hasSpans ? 'SÍ' : 'NO ⚠'));
            lines.push('  Contenido:');
            plainText.split('\n').filter(function(l) { return l.trim(); })
              .forEach(function(pl) { lines.push('    ' + pl); });
            lines.push('');
          });
        }
        
        lines.push('═══ CANCIONES EN PÁGINA (' + document.querySelectorAll('.song-card').length + ') ═══\n');
        
        document.querySelectorAll('.song-card[data-chord-id]').forEach(function(card) {
          var chordId = card.getAttribute('data-chord-id');
          var titleEl = card.querySelector('.song-title');
          var title = titleEl ? titleEl.textContent.replace(/[\u{1D11E}▾▴]/gu, '').trim() : '?';
          var chordBlock = card.querySelector('.chords-block');
          var blockId = chordBlock ? chordBlock.id : '-';
          var hasChords = chordBlock ? 'sí' : 'no';
          
          var overrideInfo = '';
          if (data && data[chordId]) {
            var ovTitle = (data[chordId].match(/♫\s*([^<]+)/) || [])[1] || '';
            if (ovTitle.trim().toLowerCase() === title.toLowerCase()) {
              overrideInfo = ' ✓ OVERRIDE OK';
            } else {
              overrideInfo = ' ✗ MISMATCH: "' + ovTitle.trim() + '"';
            }
          }
          
          lines.push(chordId + ' | ' + blockId + ' | ' + title + ' | acordes: ' + hasChords + overrideInfo);
        });
        
        lines.push('\n═══ LOCALSTORAGE ═══\n');
        var lsCount = 0;
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && (k.indexOf('chord') >= 0 || k.indexOf('rehearsal') >= 0 || k.indexOf('dev') >= 0)) {
              var val = localStorage.getItem(k);
              lines.push(k + ' = ' + (val ? val.substring(0, 80) + (val.length > 80 ? '...' : '') : 'null'));
              lsCount++;
            }
          }
        } catch(e) {}
        if (lsCount === 0) lines.push('(vacío)');
        
        lines.push('\n═══ FIN ═══');
        
        // Show results in the dedicated panel — never touches the textarea
        diagnosePre.textContent = lines.join('\n');
        diagnosePanel.classList.add('open');
        status.textContent = '✓ Diagnóstico completo — ' + (data ? Object.keys(data).length : 0) + ' overrides en Firebase';
        status.className = 'success';
      })
      .catch(function(err) {
        status.textContent = '✗ Error: ' + err.message;
        status.className = 'error';
      });
  });

  // Escape key closes
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeEditor();
    }
  });



  

  // ── LOAD CHORD OVERRIDES (2-layer: Firebase → inline) ──
  // Layer 1: Firebase Realtime DB (cloud overrides) — highest priority
  // Layer 2: Inline HTML (base version from zip) — fallback
  // localStorage is used only as temp cache while Firebase loads
  // Load overrides from Firebase
  window.loadFirebaseOverrides = function loadFirebaseOverrides() {
    fetch(FIREBASE_URL + '/chord-overrides.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data) { console.log('[Chords] Firebase: sin overrides'); return; }
        var slugKeys = Object.keys(data);
        console.log('[Chords] Firebase: ' + slugKeys.length + ' override(s):', slugKeys.join(', '));
        
        // Build slug→blockId map for all chord blocks on this page
        document.querySelectorAll('.chords-block').forEach(function(block) {
          var blockId = block.id.replace('chords-block-', '');
          var slug = getChordKey(blockId);
          if (data[slug]) {
            var pre = block.querySelector('pre');
            if (pre) {
              pre.innerHTML = data[slug];
              if (window.decorateChordBlock) window.decorateChordBlock(block);
              // no cache
              console.log('[Chords] Override aplicado: ' + slug + ' → ' + blockId);
            }
          }
        });
      })
      .catch(function(err) { console.warn('[Chords] Firebase no disponible:', err.message); });

    // No cache — Firebase loads directly
  };
  window.loadFirebaseOverrides(); // run on page load


    // ── INJECT "EDITAR" BUTTON INTO TRANSPOSE BARS ──
  // The transpose bar is injected dynamically by injectTransposeBar().
  // We'll add the edit button when the bar is created.
  var origInject = window.injectTransposeBar;
  if (origInject) {
    window.injectTransposeBar = function(id) {
      origInject(id);
      // Check if edit button already exists
      var block = document.getElementById('chords-block-' + id);
      if (!block) return;
      var bar = block.querySelector('.transpose-bar');
      if (!bar || bar.querySelector('.editor-open-btn')) return;
      var editBtn = document.createElement('button');
      editBtn.className = 'editor-open-btn';
      editBtn.textContent = 'Editar';
      editBtn.style.cssText = 'margin-left:0.3rem;padding:0.2rem 0.6rem;font-family:Cinzel,serif;font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;border:1px solid #C8943C;border-radius:2px;background:transparent;color:#C8943C;cursor:pointer;';
      editBtn.addEventListener('click', function() { window.openChordEditor(id); });
      // Insert after the expand button
      var expandBtn = bar.querySelector('[data-action="expand"]');
      if (expandBtn) {
        expandBtn.parentNode.insertBefore(editBtn, expandBtn.nextSibling);
      } else {
        bar.appendChild(editBtn);
      }
    };
  }
})();
