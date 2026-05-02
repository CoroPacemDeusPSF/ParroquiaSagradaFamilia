/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12-chord-fullscreen-fit.js
 *   @brief      Auto-fit + pinch-to-zoom para acordes en fullscreen
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46r9
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12-chord-fullscreen-fit.js  —  v3.2.46r9
   ============================================================================
   FILOSOFÍA — recalibrada en r9 después de retomar el approach del r3.

   El r3 estaba MUY cerca de funcionar:
     ✅ Columnas se aplicaban correctamente
     ✅ Zoom funcionaba
     ✅ Distribución entre cols correcta
     ❌ Margenes grandes entre estrofas → espacios gigantes en horizontal

   Los r5–r8 cambiaron de arquitectura ("un solo <pre>") y rompieron todo.
   El r9 RETOMA la arquitectura del r3 (múltiples .chord-fit-section con
   break-inside: avoid) y SÓLO cambia el margin a un valor mínimo.

   ARQUITECTURA:
     - Múltiples .chord-fit-section, cada una con un <pre>.
     - CSS-columns aplicado al WRAPPER (no al pre).
     - break-inside: avoid en cada sección → estrofa no se parte.
     - margin-bottom: 0.2em entre secciones → separación mínima visible.
     - Wrapper con overflow-y: auto + touch-action: pan-y → scroll vertical
       natural cuando no cabe = "pasar página".
     - Auto-fit del font-size para que QUEPA el máximo posible.
     - Pinch-to-zoom para ajuste manual.

   API PÚBLICA:
     window.enterChordFit(block)
     window.exitChordFit(block)
   ============================================================================ */

(function () {
  'use strict';

  var FS_MIN           = 0.55;   // rem — auto-fit mínimo
  var FS_MAX           = 1.6;    // rem — auto-fit máximo
  var FS_TARGET_MIN    = 0.85;   // rem — preferir +cols si fs ≥ este valor
  var BINARY_ITER      = 8;      // iteraciones binary search
  var PINCH_FS_MIN     = 0.4;    // rem — pinch min
  var PINCH_FS_MAX     = 3.0;    // rem — pinch max
  var DOUBLETAP_MS     = 320;    // ventana double-tap

  // ────────────────────────────────────────────────────────────
  // CANDIDATOS DE COLUMNAS según ancho disponible
  // ────────────────────────────────────────────────────────────
  function colCandidates(availW) {
    if (availW < 600)  return [1];
    if (availW < 1100) return [2, 1];
    return [3, 2, 1];
  }

  // ────────────────────────────────────────────────────────────
  // PARTIR EL HTML EN SECCIONES por líneas vacías
  // ────────────────────────────────────────────────────────────
  // Cada sección (estrofa, coro, etc.) será un .chord-fit-section
  // independiente. CSS-columns las distribuye entre cols, y
  // break-inside: avoid impide que una estrofa se parta a la mitad.
  //
  // Fusiones para optimizar espacio:
  //   - Título solo + capo + 1er header → cabecera compacta
  //   - Header solo (═══ X ═══) → fusionar con cuerpo siguiente
  //   - Anotaciones inline (INTRO:, FINAL:) → fusionar con vecino
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

      // Caso 1: título → cabecera compacta (título + capo + 1er header + 1er cuerpo)
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

      // Caso 2: header solo → fusionar con cuerpo siguiente
      if (isOnlySectionHeader(current) && i + 1 < raw.length) {
        merged.push(current + '\n' + raw[i + 1]);
        i += 2;
        continue;
      }

      // Caso 3: anotación inline → fusionar con bloque anterior
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
      // Strip blanks al inicio/final para evitar líneas vacías visibles.
      // Colapsar dobles+ saltos a uno (cada salto = línea visible en pre).
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
  // APLICAR layout (cols + font-size)
  // ────────────────────────────────────────────────────────────
  function applyLayout(wrapper, cols, fsRem) {
    wrapper.style.setProperty('--cf-cols', cols);
    wrapper.style.setProperty('--cf-fs', fsRem.toFixed(3) + 'rem');
  }

  // ────────────────────────────────────────────────────────────
  // ¿CABE el contenido en la altura disponible?
  // ────────────────────────────────────────────────────────────
  // Mide el wrapper directamente. El wrapper contiene las cols.
  function fitsInHeight(wrapper, cols, fsRem, availH) {
    applyLayout(wrapper, cols, fsRem);
    wrapper.offsetHeight;  // forzar reflow
    return wrapper.scrollHeight <= availH + 4;
  }

  function fitsInWidth(wrapper) {
    return wrapper.scrollWidth <= wrapper.clientWidth + 4;
  }

  function fitsInWidthAt(wrapper, cols, fsRem) {
    applyLayout(wrapper, cols, fsRem);
    wrapper.offsetHeight;
    return fitsInWidth(wrapper);
  }

  // ────────────────────────────────────────────────────────────
  // BÚSQUEDA BINARIA del font-size más grande que cabe
  // ────────────────────────────────────────────────────────────
  function findMaxFontSize(wrapper, cols, availH) {
    if (fitsInHeight(wrapper, cols, FS_MAX, availH) && fitsInWidth(wrapper)) {
      return FS_MAX;
    }
    if (!fitsInWidthAt(wrapper, cols, FS_MIN)) return 0;

    var lo = FS_MIN, hi = FS_MAX, best = FS_MIN;
    for (var i = 0; i < BINARY_ITER; i++) {
      var mid = (lo + hi) / 2;
      var fitsH = fitsInHeight(wrapper, cols, mid, availH);
      var fitsW = fitsInWidth(wrapper);
      if (fitsH && fitsW) { best = mid; lo = mid; }
      else                 { hi = mid; }
    }
    return best;
  }

  // ────────────────────────────────────────────────────────────
  // ENCONTRAR mejor layout (cols, fs) para el canto y pantalla
  // ────────────────────────────────────────────────────────────
  function findBestLayout(wrapper, availW, availH) {
    var candidates = colCandidates(availW);
    var attempted = [];

    for (var i = 0; i < candidates.length; i++) {
      var cols = candidates[i];
      var fs = findMaxFontSize(wrapper, cols, availH);

      if (fs === 0) {
        attempted.push({ cols: cols, fs: 0 });
        continue;
      }
      attempted.push({ cols: cols, fs: fs });
      if (fs >= FS_TARGET_MIN) return { cols: cols, fs: fs };
    }

    // Ningún layout alcanzó el target. Elegir el de fs mayor.
    var viable = attempted.filter(function (a) { return a.fs > 0; });
    if (viable.length > 0) {
      var best = viable[0];
      for (var j = 1; j < viable.length; j++) {
        if (viable[j].fs > best.fs) best = viable[j];
      }
      return { cols: best.cols, fs: best.fs };
    }

    // Caso extremo: nada cabe. 1 col con FS_MIN, scroll vertical hará lo demás.
    return { cols: 1, fs: FS_MIN };
  }

  // ────────────────────────────────────────────────────────────
  // PINCH-TO-ZOOM
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

    wrapper.offsetHeight;  // forzar reflow

    var availW = wrapper.clientWidth  || window.innerWidth;
    var availH = wrapper.clientHeight || (window.innerHeight - 80);

    var best = findBestLayout(wrapper, availW, availH);
    applyLayout(wrapper, best.cols, best.fs);

    var cleanupPinch = setupPinch(wrapper, best.fs);
    var cleanupWheel = setupWheelZoom(wrapper, best.fs);

    block._cfWrapper = wrapper;
    block._cfBaseFs  = best.fs;
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
