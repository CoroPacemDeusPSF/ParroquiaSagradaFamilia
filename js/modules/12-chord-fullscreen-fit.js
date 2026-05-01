/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12-chord-fullscreen-fit.js
 *   @brief      Auto-fit + pinch-to-zoom para acordes en fullscreen
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46r5
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12-chord-fullscreen-fit.js
   ============================================================================
   FILOSOFÍA — recalibrada en r5 después de iteraciones fallidas.

   El objetivo del fullscreen de acordes es ÚNICO:
     "Ver la mayor cantidad de letra y acordes en un solo pantallazo,
      sin comerse nada, con espaciado optimizado."

   APPROACH FINAL (simple y directo):

     1. UN SOLO <pre> con TODO el contenido del canto. CSS-columns parte
        el texto naturalmente entre columnas, igual que un cancionero
        impreso. Una estrofa puede arrancar en col 1 y continuar en col 2.

     2. Una línea en blanco entre estrofas (ni 0, ni 4). El HTML original
        ya viene así; solo normalizamos secuencias de 3+ saltos a 2.

     3. Solo el TÍTULO se protege con break-inside: avoid (no debe
        partirse entre columnas). El resto fluye libremente.

     4. Auto-fit del font-size: encuentra el más grande que hace que el
        contenido CABE verticalmente con las columnas que aplican.

     5. Decisión de columnas: si la línea más larga del canto no cabe en
        un ancho de columna estrecho, FORZAR menos columnas. Solo subir
        a 2/3 cols si las líneas SÍ caben en columnas más estrechas.

     6. Pinch-to-zoom para ajuste manual. Si al ampliar el contenido
        excede la altura, scroll vertical natural.

   API PÚBLICA:
     window.enterChordFit(block)
     window.exitChordFit(block)
   ============================================================================ */

(function () {
  'use strict';

  var FS_MIN           = 0.55;
  var FS_MAX           = 1.6;
  var FS_TARGET_MIN    = 0.85;
  var BINARY_ITER      = 8;
  var PINCH_FS_MIN     = 0.4;
  var PINCH_FS_MAX     = 3.0;
  var DOUBLETAP_MS     = 320;

  function colCandidates(availW) {
    if (availW < 600)  return [1];
    if (availW < 1100) return [2, 1];
    return [3, 2, 1];
  }

  // Normaliza el HTML: strip blanks y colapsa 3+ saltos consecutivos a 2.
  // Preserva pares letra/acordes (single \n) y separación entre estrofas
  // (UN solo blank line, no más, no menos).
  function normalizeContent(html) {
    return html
      .replace(/^[\s\n]+/, '')
      .replace(/[\s\n]+$/, '')
      .replace(/\n[ \t]*\n[\s\n]+/g, '\n\n');
  }

  function buildWrapper(html) {
    var wrapper = document.createElement('div');
    wrapper.className = 'chord-fit-wrapper';
    var pre = document.createElement('pre');
    pre.className = 'chord-fit-pre';
    pre.innerHTML = normalizeContent(html);
    wrapper.appendChild(pre);
    return wrapper;
  }

  function applyLayout(wrapper, cols, fsRem) {
    wrapper.style.setProperty('--cf-cols', cols);
    wrapper.style.setProperty('--cf-fs', fsRem.toFixed(3) + 'rem');
  }

  function fitsInHeight(wrapper, cols, fsRem, availH) {
    applyLayout(wrapper, cols, fsRem);
    wrapper.offsetHeight;  // forzar reflow
    return wrapper.scrollHeight <= availH + 4;
  }

  function fitsInWidth(wrapper) {
    return wrapper.scrollWidth <= wrapper.clientWidth + 1;
  }

  function fitsInWidthAt(wrapper, cols, fsRem) {
    applyLayout(wrapper, cols, fsRem);
    wrapper.offsetHeight;
    return fitsInWidth(wrapper);
  }

  // Búsqueda binaria del font-size más grande que cabe (alto + ancho)
  function findMaxFontSize(wrapper, cols, availH) {
    if (fitsInHeight(wrapper, cols, FS_MAX, availH) && fitsInWidth(wrapper)) {
      return FS_MAX;
    }
    // ¿Cabe siquiera horizontalmente con FS_MIN?
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

  // Font-size más grande que cabe HORIZONTALMENTE (sin importar el alto).
  // Usado cuando ningún layout cabe en el alto disponible — al menos quiero
  // que las líneas no se desborden, dejando scroll vertical hacer el resto.
  function findMaxFontSizeForWidth(wrapper, cols) {
    if (fitsInWidthAt(wrapper, cols, FS_MAX)) return FS_MAX;
    if (!fitsInWidthAt(wrapper, cols, FS_MIN)) return 0;
    var lo = FS_MIN, hi = FS_MAX, best = FS_MIN;
    for (var i = 0; i < BINARY_ITER; i++) {
      var mid = (lo + hi) / 2;
      if (fitsInWidthAt(wrapper, cols, mid)) { best = mid; lo = mid; }
      else                                    { hi = mid; }
    }
    return best;
  }

  function findBestLayout(wrapper, availW, availH) {
    var candidates = colCandidates(availW);
    var attempted = [];

    for (var i = 0; i < candidates.length; i++) {
      var cols = candidates[i];
      var fs = findMaxFontSize(wrapper, cols, availH);
      if (fs === 0) {
        attempted.push({ cols: cols, fs: 0, viable: false });
        continue;
      }
      attempted.push({ cols: cols, fs: fs, viable: true });
      if (fs >= FS_TARGET_MIN) return { cols: cols, fs: fs };
    }

    var viable = attempted.filter(function (a) { return a.viable; });
    if (viable.length > 0) {
      var best = viable[0];
      for (var j = 1; j < viable.length; j++) {
        if (viable[j].fs > best.fs) best = viable[j];
      }
      return { cols: best.cols, fs: best.fs };
    }

    // Caso extremo: nada cabe. Forzar 1 col con el font que al menos
    // hace que las líneas no se desborden horizontalmente.
    var fsForWidth = findMaxFontSizeForWidth(wrapper, 1);
    return { cols: 1, fs: fsForWidth || FS_MIN };
  }

  // ─── Pinch-to-zoom ───
  function setupPinch(wrapper, baseFs, availH) {
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
      if (wrapper.scrollHeight > availH + 4) wrapper.classList.add('cf-overflow');
      else                                    wrapper.classList.remove('cf-overflow');
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

  // ─── Wheel zoom (desktop) ───
  function setupWheelZoom(wrapper, baseFs, availH) {
    var currentFs = baseFs, STEP = 0.05;
    function applyFs(fs) {
      currentFs = Math.min(PINCH_FS_MAX, Math.max(PINCH_FS_MIN, fs));
      wrapper.style.setProperty('--cf-fs', currentFs.toFixed(3) + 'rem');
      if (wrapper.scrollHeight > availH + 4) wrapper.classList.add('cf-overflow');
      else                                    wrapper.classList.remove('cf-overflow');
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

  // ─── ENTRAR A FULLSCREEN-FIT ───
  window.enterChordFit = function (block) {
    if (!block) return;
    if (block._cfWrapper) return;

    var pre = block.querySelector('pre:not(.cf-source-hidden)');
    if (!pre) return;

    var wrapper = buildWrapper(pre.innerHTML);

    block.classList.add('cf-active');
    pre.classList.add('cf-source-hidden');
    block.appendChild(wrapper);

    wrapper.offsetHeight;

    var availW = wrapper.clientWidth  || window.innerWidth;
    var availH = wrapper.clientHeight || window.innerHeight - 80;

    var best = findBestLayout(wrapper, availW, availH);
    applyLayout(wrapper, best.cols, best.fs);
    wrapper.offsetHeight;

    if (wrapper.scrollHeight > availH + 4) wrapper.classList.add('cf-overflow');
    else                                    wrapper.classList.remove('cf-overflow');

    var cleanupPinch = setupPinch(wrapper, best.fs, availH);
    var cleanupWheel = setupWheelZoom(wrapper, best.fs, availH);

    block._cfWrapper = wrapper;
    block._cfBaseFs  = best.fs;
    block._cfCleanup = function () { cleanupPinch(); cleanupWheel(); };
  };

  // ─── SALIR DE FULLSCREEN-FIT ───
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
