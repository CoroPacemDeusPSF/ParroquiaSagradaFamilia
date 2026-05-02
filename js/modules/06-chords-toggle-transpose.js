/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/06-chords-toggle-transpose.js
 *   @brief      Bloque de acordes: toggle, transposición ±, fullscreen, imprimir, zoom
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46r7
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   06-chords-toggle-transpose.js
   ============================================================================
   Sistema de acordes — toggle, transposición, zoom, impresión

   MUY EXTENSO. parseChord, transposeChord, applyTranspose, injectTransposeBar, printChords. Define window.toggleChords y window.injectTransposeBar.

   ORDEN DE CARGA: posición 6 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── CHORDS TOGGLE + TRANSPOSE ─────────────────────
(function() {
  // ── Chromatic scale (Latin notation) ──
  var NOTES = ['DO','DO#','RE','RE#','MI','FA','FA#','SOL','SOL#','LA','LA#','SI'];
  // Flats → sharps mapping for lookup
  var FLAT_MAP = {'REb':'DO#','MIb':'RE#','FAb':'MI','SOLb':'FA#','LAb':'SOL#','SIb':'LA#','DOb':'SI'};

  // Parse a chord string into { root, rootIndex, suffix, bass, bassIndex }
  function parseChord(txt) {
    var t = txt.trim();
    if (!t) return null;

    // Split on slash for bass note (but not at position 0)
    var mainPart = t, bassPart = '';
    var slashIdx = t.indexOf('/');
    if (slashIdx > 0) {
      mainPart = t.substring(0, slashIdx);
      bassPart = t.substring(slashIdx + 1);
    }

    var rootInfo = extractNote(mainPart);
    if (!rootInfo) return null;

    var bassInfo = bassPart ? extractNote(bassPart) : null;

    return {
      root: rootInfo.note,
      rootIndex: rootInfo.index,
      rootCase: rootInfo.originalCase,
      rootSystem: rootInfo.system || 'latin',
      suffix: mainPart.substring(rootInfo.length),
      bass: bassInfo ? bassInfo.note : '',
      bassIndex: bassInfo ? bassInfo.index : -1,
      bassCase: bassInfo ? bassInfo.originalCase : '',
      bassSystem: bassInfo ? (bassInfo.system || 'latin') : 'latin',
      bassSuffix: bassInfo ? bassPart.substring(bassInfo.length) : '',
      hasSlash: slashIdx > 0
    };
  }

  // Extract root note from beginning of string
  function extractNote(s) {
    var upper = s.toUpperCase();
    // Latin notation: compare in UPPERCASE (flats: SIb→SIB, MIb→MIB, etc.)
    // Order: longer/more specific first
    var latinUpper = ['SOL#','SOLB','SOL','DO#','DOB','RE#','REB','MI#','MIB','FA#','FAB','LA#','LAB','SI#','SIB','SI','LA','MI','FA','DO','RE'];
    var FLAT_MAP_U  = {'REB':'DO#','MIB':'RE#','FAB':'MI','SOLB':'FA#','LAB':'SOL#','SIB':'LA#','DOB':'SI'};
    for (var i = 0; i < latinUpper.length; i++) {
      var pat = latinUpper[i];
      if (upper.indexOf(pat) === 0) {
        var note = FLAT_MAP_U[pat] || pat;
        if (note === 'MI#') note = 'FA';
        if (note === 'SI#') note = 'DO';
        var idx = NOTES.indexOf(note);
        if (idx < 0) continue;
        return { note: note, index: idx, length: pat.length, originalCase: s.substring(0, pat.length), system: 'latin' };
      }
    }
    // English notation: C, D, E, F, G, A, B (with # or b)
    var ENG_MAP = {'C':'DO','C#':'DO#','Cb':'SI','D':'RE','D#':'RE#','Db':'DO#','E':'MI','E#':'FA','Eb':'RE#','F':'FA','F#':'FA#','Fb':'MI','G':'SOL','G#':'SOL#','Gb':'FA#','A':'LA','A#':'LA#','Ab':'SOL#','B':'SI','B#':'DO','Bb':'LA#'};
    var eng = ['G#','Gb','Ab','Bb','C#','Cb','D#','Db','E#','Eb','F#','Fb','A','B','C','D','E','F','G'];
    for (var i = 0; i < eng.length; i++) {
      if (upper.indexOf(eng[i]) === 0) {
        var mapped = ENG_MAP[eng[i]];
        if (!mapped) continue;
        var idx = NOTES.indexOf(mapped);
        if (idx < 0) continue;
        return { note: mapped, index: idx, length: eng[i].length, originalCase: s.substring(0, eng[i].length), system: 'english' };
      }
    }
    return null;
  }

  // Reverse map: Latin note → English
  var LATIN_TO_ENG = {'DO':'C','DO#':'C#','RE':'D','RE#':'D#','MI':'E','FA':'F','FA#':'F#','SOL':'G','SOL#':'G#','LA':'A','LA#':'A#','SI':'B'};

  // Transpose a note index by semitones
  function transposeIndex(idx, semitones) {
    return ((idx + semitones) % 12 + 12) % 12;
  }

  // Reconstruct chord with case and notation system matching
  function formatNote(noteIndex, originalCase, system) {
    var note = NOTES[noteIndex];
    // English notation
    if (system === 'english') {
      var eng = LATIN_TO_ENG[note] || note;
      if (originalCase && originalCase === originalCase.toLowerCase()) return eng.toLowerCase();
      return eng;
    }
    // Latin notation: detectar caso por las LETRAS, ignorando accidentales (# y b)
    // "Re"  → letras="Re"  → mixto       → title case  (e.g. Rem, Sol)
    // "SOL" → letras="SOL" → todo mayúsc → ALL CAPS    (e.g. SOL, LA)
    // "SIb" → letras="SI"  → todo mayúsc → ALL CAPS    (la b es accidental, no casing)
    // "la"  → letras="la"  → todo minúsc → minúsculas  (raro, por si acaso)
    if (!originalCase) return note;
    var letters = originalCase.replace(/[#b♭♯°]/g, '');
    if (!letters) return note;
    if (letters === letters.toLowerCase()) {
      // todo minúsculas → minúsculas
      return note.toLowerCase();
    }
    if (letters === letters.toUpperCase()) {
      // todo mayúsculas (incluyendo SIb, MIb → letras=SI,MI → mayúsculas) → ALL CAPS
      return note;
    }
    // Mixto (primera mayúscula, resto minúscula) → title case
    return note.charAt(0) + note.substring(1).toLowerCase();
  }

  function transposeChord(txt, semitones) {
    var parsed = parseChord(txt);
    if (!parsed) return txt;

    var newRoot = transposeIndex(parsed.rootIndex, semitones);
    var result = formatNote(newRoot, parsed.rootCase, parsed.rootSystem) + parsed.suffix;

    if (parsed.hasSlash) {
      var newBass = transposeIndex(parsed.bassIndex, semitones);
      result += '/' + formatNote(newBass, parsed.bassCase, parsed.bassSystem) + parsed.bassSuffix;
    }

    return result;
  }

  // Store originals and apply transpose
  function applyTranspose(blockId, semitones) {
    var block = document.getElementById('chords-block-' + blockId);
    if (!block) return;

    var chords = block.querySelectorAll('.chord');
    chords.forEach(function(el) {
      // Store original on first call
      if (!el.dataset.original) el.dataset.original = el.textContent;
      el.textContent = semitones === 0 ? el.dataset.original : transposeChord(el.dataset.original, semitones);
    });
  }

  // Inject transpose bar into a block
  window.injectTransposeBar = function injectTransposeBar(blockId) {
    var block = document.getElementById('chords-block-' + blockId);
    if (!block || block.querySelector('.transpose-bar')) return;

    /* En fullscreen: el zoom y la densidad de columnas los maneja
       el módulo 12-chord-fullscreen-fit.js (auto-fit + pinch-to-zoom).
       Aquí solo construimos la transpose-bar. */

    var bar = document.createElement('div');
    bar.className = 'transpose-bar';
    bar.innerHTML =
      '<button class="fullscreen-close" title="Cerrar">✕</button>' +
      '<button class="transpose-btn" data-dir="-1">−</button>' +
      '<span class="transpose-label" id="transpose-val-' + blockId + '">Original</span>' +
      '<button class="transpose-btn" data-dir="1">+</button>' +
      '<button class="transpose-reset">Reset</button>' +
      '<button class="fullscreen-btn" data-block="' + blockId + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>Expandir</button>' +
      '<button class="print-chords-btn" data-block="' + blockId + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir</button>';
    block.insertBefore(bar, block.firstChild);

    var current = 0;
    var label = bar.querySelector('.transpose-label');

    bar.addEventListener('click', function(e) {
      var btn = e.target.closest('.transpose-btn');
      var reset = e.target.closest('.transpose-reset');
      var print = e.target.closest('.print-chords-btn');
      var expand = e.target.closest('.fullscreen-btn:not(.mc-toggle-btn)');
      var close = e.target.closest('.fullscreen-close');

      if (btn) {
        current += parseInt(btn.dataset.dir);
        if (current > 11) current = -11;
        if (current < -11) current = 11;
        applyTranspose(blockId, current);
        label.textContent = current === 0 ? 'Original' : (current > 0 ? '+' + current : '' + current);
      } else if (reset) {
        current = 0;
        applyTranspose(blockId, current);
        label.textContent = 'Original';
      } else if (print) {
        printChords(blockId);
      } else if (expand) {
        if (block.classList.contains('fullscreen')) {
          // ── Restaurar ──
          window.exitChordFit && window.exitChordFit(block);
          block.classList.remove('fullscreen');
          expand.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>Expandir';
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          }
        } else {
          // ── Expandir ──
          block.classList.add('fullscreen');
          // No bloquear body.overflow — eso bloquea el pinch-zoom en Android.
          // overscroll-behavior:contain en el bloque evita scroll del fondo.
          block.scrollTop = 0;
          expand.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>Restaurar';
          var el = block;
          if (el.requestFullscreen) el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
          // Esperar al menos 60ms para que el CSS fullscreen aplique (crítico en PC),
        // luego reintentar si las dimensiones no están listas (necesario en móvil)
        setTimeout(function() {
          (function tryEnter(attempts) {
            var w = block.clientWidth, h = block.clientHeight;
            if ((w < 100 || h < 100) && attempts < 5) {
              setTimeout(function() { tryEnter(attempts + 1); }, 80);
            } else {
              window.enterChordFit && window.enterChordFit(block);
            }
          })(0);
        }, 60);
        }
      } else if (close) {
        // El botón ✕ sigue funcionando igual (por si acaso)
        var fsBtn = bar.querySelector('.fullscreen-btn');
        if (fsBtn) fsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>Expandir';
        window.exitChordFit && window.exitChordFit(block);
        block.classList.remove('fullscreen');
        document.body.style.overflow = '';
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      }
    });
  }

  // ── Print chords ──
  function printChords(blockId) {
    var block = document.getElementById('chords-block-' + blockId);
    if (!block) return;
    var pre = block.querySelector('pre');
    if (!pre) return;

    // Get the song title from the closest song-card
    var card = block.closest('.song-card');
    var titleEl = card ? card.querySelector('.song-title') : null;
    var title = titleEl ? titleEl.textContent.replace(/[𝄞▾▴]/g, '').trim() : 'Acordes';

    // Get current chord content (already transposed if applicable)
    var content = pre.innerHTML;

    // Analyze line lengths to decide columns
    var lines = pre.textContent.split('\n');
    var maxLen = 0;
    lines.forEach(function(l) { if (l.length > maxLen) maxLen = l.length; });
    var useColumns = maxLen < 50;

    var win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<title>' + title + ' — Acordes</title>' +
      '<style>' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { font-family: "Courier New", monospace; font-size: 11px; line-height: 1.6; padding: 1.5cm; color: #000; }' +
      'h1 { font-family: Georgia, serif; font-size: 16px; text-align: center; margin-bottom: 0.3cm; font-weight: normal; }' +
      '.subtitle { font-family: Georgia, serif; font-size: 10px; text-align: center; color: #666; margin-bottom: 0.6cm; }' +
      'hr { border: none; border-top: 1px solid #ccc; margin-bottom: 0.5cm; }' +
      '.chord-content { white-space: pre; overflow: visible; ' +
      (useColumns ? 'column-count: 2; column-gap: 1.5cm; column-rule: 1px solid #ddd;' : '') +
      ' }' +
      '.chord-content b { font-weight: bold; }' +
      '.chord { color: #000; font-weight: bold; }' +
      'pre { white-space: pre; margin: 0; font-family: inherit; font-size: inherit; line-height: inherit; }' +
      '@media print {' +
      '  body { padding: 1cm; }' +
      '  .chord-content { orphans: 2; widows: 2; }' +
      '}' +
      '<\/style><\/head><body>' +
      '<h1>' + title + '<\/h1>' +
      '<div class="subtitle">Coro Pacem Deus — Parroquia de la Sagrada Familia<\/div>' +
      '<hr>' +
      '<div class="chord-content">' + content + '<\/div>' +
      '<\/body><\/html>');
    win.document.close();
    setTimeout(function() { win.print(); }, 400);
  }

  // Clean up if user exits fullscreen via Escape or browser gesture
  document.addEventListener('fullscreenchange', handleFSChange);
  document.addEventListener('webkitfullscreenchange', handleFSChange);
  function handleFSChange() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      var fs = document.querySelector('.chords-block.fullscreen');
      if (fs) {
        // Resetear botón Expandir/Restaurar
        var fsBtn = fs.querySelector('.fullscreen-btn');
        if (fsBtn) fsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>Expandir';
        window.exitChordFit && window.exitChordFit(fs);
        fs.classList.remove('fullscreen');
      }
    }
  }

  // ── Toggle function (public) ──
  window.toggleChords = function(id, forceOpen) {
    var block = document.getElementById('chords-block-' + id);
    var btn   = document.getElementById('chords-toggle-' + id);
    if (!block) return;
    var opening = (forceOpen === true) ? true : !block.classList.contains('open');
    block.classList.toggle('open', opening);
    if (btn) btn.textContent = opening ? 'Ocultar acordes ▴' : 'Ver acordes ▾';
    if (opening) {
      window.injectTransposeBar(id);
      window.decorateChordBlock(block);
    }
  };
})();
