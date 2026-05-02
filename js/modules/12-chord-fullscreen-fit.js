/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12-chord-fullscreen-fit.js
 *   @brief      Pinch-to-zoom para acordes en fullscreen (cols + scroll natural)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46r10
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12-chord-fullscreen-fit.js  —  v3.2.46r10
   ============================================================================
   APPROACH RADICAL POST-DIAGNÓSTICO (r10)
   ────────────────────────────────────────────────────────────────────────────
   Diagnóstico con datos reales del JSON inspeccionado en producción (r9):
     wrapper_W: 653, scrollW: 1297      → cols extras horizontales
     altura_secciones: 2790 vs H: 595   → contenido 5x más alto que viewport
     cssCols: "3" cuando availW=653     → eligió mal por timing de medición
     break-inside: avoid + cols cortas  → huecos al final de col
     overflow-y: auto sin scroll        → contenido fue horizontal, no vertical

   FILOSOFÍA r10 (mucho más simple):

     1. UN <pre> por sección, todas dentro del wrapper.
     2. SIN auto-fit complejo. Solo: cols por viewport, font-size por defecto.
     3. column-fill: balance → cols equilibradas, sin huecos.
     4. SIN altura fija en wrapper → crece naturalmente con el contenido.
     5. SIN break-inside: avoid en secciones → fluyen entre cols.
     6. Scroll vertical en el BLOCK fullscreen → "pasar página" natural.
     7. Pinch-to-zoom intacto: ajusta font-size en vivo.

   API PÚBLICA:
     window.enterChordFit(block)
     window.exitChordFit(block)
   ============================================================================ */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // CONSTANTES
  // ────────────────────────────────────────────────────────────
  var FS_DEFAULT       = 0.95;   // rem — font-size de inicio
  var PINCH_FS_MIN     = 0.4;    // rem — pinch min
  var PINCH_FS_MAX     = 3.0;    // rem — pinch max
  var DOUBLETAP_MS     = 320;    // ventana double-tap

  // ────────────────────────────────────────────────────────────
  // DECISIÓN DE COLUMNAS según ancho del viewport
  // ────────────────────────────────────────────────────────────
  // Simple y predecible. Sin auto-fit complejo que falla por timing.
  // El usuario puede zoomear con pinch si quiere ver más/menos.
  function pickCols(availW) {
    if (availW < 700)  return 1;
    if (availW < 1200) return 2;
    return 3;
  }

  // ────────────────────────────────────────────────────────────
  // PARTIR EL HTML EN SECCIONES
  // ────────────────────────────────────────────────────────────
  function splitSections(html) {
    var raw = html
      .split(/\n[ \t]*\n+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });

    function isOnlyTitle(s) {
      return /^<b\s+class=["']chord-title["']>[^<]*<\/b>$/.test(s.trim());
    }
    function isOnlyCapo(s) {
      var t = s.trim();
      if (t.charAt(0) !== '⚠') return false;
      return !/<span\s+class=["']chord["']/.test(t);
    }
    function isOnlySectionHeader(s) {
      var stripped = s.replace(/<\/?b[^>]*>/g, '').trim();
      if (/^[═─━]{2,}\s+.+\s+[═─━]{2,}/.test(stripped)) {
        return /^<b[^>]*>[^<]*<\/b>$/.test(s.trim());
      }
      return false;
    }
    function isAnnotationLine(s) {
      var t = s.trim();
      return /^(INTRO|OUTRO|FINAL|PUENTE|INTERLUDIO|TAG|CODA)\s*:/i.test(t);
    }

    var merged = [];
    var i = 0;
    while (i < raw.length) {
      var current = raw[i];
      if (isOnlyTitle(current)) {
        var combo = current;
        i++;
        while (i < raw.length && isOnlyCapo(raw[i])) {
          combo += '\n' + raw[i];
          i++;
        }
        while (i < raw.length && isAnnotationLine(raw[i])) {
          combo += '\n' + raw[i];
          i++;
        }
        if (i < raw.length && isOnlySectionHeader(raw[i])) {
          combo += '\n' + raw[i];
          i++;
        }
        if (i < raw.length) {
          combo += '\n' + raw[i];
          i++;
        }
        merged.push(combo);
        continue;
      }
      if (isOnlySectionHeader(current) && i + 1 < raw.length) {
        merged.push(current + '\n' + raw[i + 1]);
        i += 2;
        continue;
      }
      if (isAnnotationLine(current) && merged.length > 0) {
        merged[merged.length - 1] += '\n' + current;
        i++;
        continue;
      }
      merged.push(current);
      i++;
    }
    return merged;
  }

  // ────────────────────────────────────────────────────────────
  // CONSTRUIR el wrapper con secciones
  // ────────────────────────────────────────────────────────────
  function buildWrapper(html) {
    var wrapper = document.createElement('div');
    wrapper.className = 'chord-fit-wrapper';

    var sections = splitSections(html);
    sections.forEach(function (sectionHtml) {
      var section = document.createElement('div');
      section.className = 'chord-fit-section';

      var pre = document.createElement('pre');
      pre.className = 'chord-fit-pre';
      var cleaned = sectionHtml
        .replace(/^[\s\n]+/, '')
        .replace(/[\s\n]+$/, '')
        .replace(/\n[ \t]*\n[\s\n]*/g, '\n');
      pre.innerHTML = cleaned;

      section.appendChild(pre);
      wrapper.appendChild(section);
    });

    return wrapper;
  }

  // ────────────────────────────────────────────────────────────
  // PINCH-TO-ZOOM (móvil/tablet)
  // ────────────────────────────────────────────────────────────
  function setupPinch(wrapper, baseFs) {
    var currentFs = baseFs;
    var initialDistance = 0, initialFs = baseFs, pinching = false;

    function distance(t) {
      var dx = t[0].clientX - t[1].clientX;
      var dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function clamp(x, mn, mx) { return Math.min(mx, Math.max(mn, x)); }

    function applyFs(fs) {
      currentFs = fs;
      wrapper.style.setProperty('--cf-fs', fs.toFixed(3) + 'rem');
    }

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        pinching = true;
        initialDistance = distance(e.touches);
        initialFs = currentFs;
        e.preventDefault();
      }
    }
    function onTouchMove(e) {
      if (pinching && e.touches.length === 2) {
        var nd = distance(e.touches);
        if (initialDistance > 0) {
          applyFs(clamp(initialFs * (nd / initialDistance), PINCH_FS_MIN, PINCH_FS_MAX));
        }
        e.preventDefault();
      }
    }
    function onTouchEnd(e) {
      if (e.touches.length < 2) pinching = false;
    }

    var lastTap = 0;
    function onTap(e) {
      if (e.target.closest('button, a, .transpose-bar')) return;
      if (e.touches && e.touches.length > 0) return;
      var now = Date.now();
      if (now - lastTap < DOUBLETAP_MS) {
        applyFs(baseFs);
        lastTap = 0;
        e.preventDefault();
      } else {
        lastTap = now;
      }
    }

    wrapper.addEventListener('touchstart', onTouchStart, { passive: false });
    wrapper.addEventListener('touchmove',  onTouchMove,  { passive: false });
    wrapper.addEventListener('touchend',   onTouchEnd,   { passive: true  });
    wrapper.addEventListener('touchend',   onTap,        { passive: false });

    return function cleanup() {
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove',  onTouchMove);
      wrapper.removeEventListener('touchend',   onTouchEnd);
      wrapper.removeEventListener('touchend',   onTap);
    };
  }

  // ────────────────────────────────────────────────────────────
  // WHEEL ZOOM (desktop)
  // ────────────────────────────────────────────────────────────
  function setupWheelZoom(wrapper, baseFs) {
    var currentFs = baseFs, STEP = 0.05;
    function applyFs(fs) {
      currentFs = Math.min(PINCH_FS_MAX, Math.max(PINCH_FS_MIN, fs));
      wrapper.style.setProperty('--cf-fs', currentFs.toFixed(3) + 'rem');
    }
    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyFs(currentFs + (e.deltaY > 0 ? -STEP : STEP));
    }
    function onDblClick(e) {
      if (e.target.closest('button, a, .transpose-bar')) return;
      e.preventDefault();
      applyFs(baseFs);
    }
    wrapper.addEventListener('wheel', onWheel, { passive: false });
    wrapper.addEventListener('dblclick', onDblClick);
    return function cleanup() {
      wrapper.removeEventListener('wheel', onWheel);
      wrapper.removeEventListener('dblclick', onDblClick);
    };
  }

  // ────────────────────────────────────────────────────────────
  // ENTRAR A FULLSCREEN-FIT
  // ────────────────────────────────────────────────────────────
  window.enterChordFit = function (block) {
    if (!block) return;
    if (block._cfWrapper) return;

    var pre = block.querySelector('pre:not(.cf-source-hidden)');
    if (!pre) return;

    var wrapper = buildWrapper(pre.innerHTML);

    block.classList.add('cf-active');
    pre.classList.add('cf-source-hidden');
    block.appendChild(wrapper);

    // Decidir cols según ancho del viewport (no del wrapper, evita timing issue)
    var cols = pickCols(window.innerWidth);
    wrapper.style.setProperty('--cf-cols', cols);
    wrapper.style.setProperty('--cf-fs', FS_DEFAULT.toFixed(3) + 'rem');

    var cleanupPinch = setupPinch(wrapper, FS_DEFAULT);
    var cleanupWheel = setupWheelZoom(wrapper, FS_DEFAULT);

    block._cfWrapper = wrapper;
    block._cfBaseFs  = FS_DEFAULT;
    block._cfCleanup = function () { cleanupPinch(); cleanupWheel(); };
  };

  // ────────────────────────────────────────────────────────────
  // SALIR DE FULLSCREEN-FIT
  // ────────────────────────────────────────────────────────────
  window.exitChordFit = function (block) {
    if (!block) return;
    if (block._cfCleanup) { block._cfCleanup(); block._cfCleanup = null; }
    if (block._cfWrapper && block._cfWrapper.parentNode) {
      block._cfWrapper.parentNode.removeChild(block._cfWrapper);
    }
    block._cfWrapper = null;
    block._cfBaseFs  = null;
    block.classList.remove('cf-active');
    var hiddenPre = block.querySelector('pre.cf-source-hidden');
    if (hiddenPre) hiddenPre.classList.remove('cf-source-hidden');
  };

})();
