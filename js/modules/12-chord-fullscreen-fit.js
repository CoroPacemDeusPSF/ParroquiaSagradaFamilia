/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12-chord-fullscreen-fit.js
 *   @brief      Paginación horizontal de acordes en fullscreen + pinch zoom
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46r14
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12-chord-fullscreen-fit.js  —  v3.2.46r14
   ============================================================================
   PAGINACIÓN HORIZONTAL — REESCRITURA COMPLETA
   ────────────────────────────────────────────────────────────────────────────
   Reemplaza el approach r10/r12 (cols + scroll vertical continuo) por un
   sistema de páginas discretas con swipe horizontal, estilo libro digital
   o partitura física.

   PROBLEMAS QUE RESUELVE
     r10/r12 funcionaba pero tenía 3 issues sin resolver:
       1. Para ver el final de una columna había que scrollear hacia abajo.
       2. Para ver el inicio de la siguiente columna había que scrollear
          hacia arriba. Inútil para un músico tocando.
       3. La transpose-bar sticky tapaba parte del texto al scrollear.

     Con paginación horizontal:
       • Cada "página" muestra exactamente lo que cabe: N cols × pageH.
       • Para ver más, swipe lateral o tap en la flecha derecha.
       • Sin scroll vertical → la transpose-bar nunca tapa nada.

   MECANISMO
     1. El browser distribuye el contenido en cols dentro del wrapper con
        `column-count: N`, `column-fill: auto`, `height: 100%`.
     2. Cuando el contenido excede la altura disponible en N cols, el
        browser crea cols extras horizontalmente. Esas cols extras son las
        "siguientes páginas".
     3. El pager (contenedor exterior) tiene `overflow-x: auto` y
        `scroll-snap-type: x mandatory`, así el browser snapea cada
        scroll. JS complementa con snap programático en touchend para
        máxima fluidez en tablet.

   UI DE NAVEGACIÓN
     • Flecha derecha pulsante en el borde — desaparece al llegar a la
       última página. Estilo "tutorial móvil": sutil pero presente.
     • Flecha izquierda equivalente cuando no estás en página 1.
     • Contador "1/3" abajo al centro, solo visible si hay más de 1 página.
     • Flechas son tap-able: avanzan/retroceden una página.
     • Si el contenido cabe en 1 sola página: sin indicadores de ningún tipo.

   PINCH-TO-ZOOM
     Sigue funcionando. Cambia `--cf-fs` del wrapper, el browser refluya
     el contenido, las cols se reorganizan y el número total de páginas
     puede cambiar (más zoom → más páginas, menos zoom → menos páginas).
     Tras el reflow, recalculamos el contador y la visibilidad de las
     flechas.

   API PÚBLICA (sin cambios respecto a r10):
     window.enterChordFit(block)
     window.exitChordFit(block)
   ============================================================================ */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // CONSTANTES
  // ────────────────────────────────────────────────────────────
  var FS_DEFAULT       = 0.95;   // rem — font-size inicial
  var PINCH_FS_MIN     = 0.4;    // rem — pinch min
  var PINCH_FS_MAX     = 3.0;    // rem — pinch max
  var DOUBLETAP_MS     = 320;    // ventana double-tap

  var SCROLL_UI_DEBOUNCE_MS = 30;   // delay para actualizar UI tras scroll
  var SNAP_AFTER_TOUCH_MS   = 100;  // snap programático tras touchend
  var SNAP_AFTER_SCROLL_MS  = 140;  // snap programático tras inertia scroll
  var RESIZE_DEBOUNCE_MS    = 120;  // debounce de ResizeObserver

  // ────────────────────────────────────────────────────────────
  // DECISIÓN DE COLUMNAS según ancho del CONTENEDOR
  // ────────────────────────────────────────────────────────────
  // Igual que en r12: medimos el block real, no window.innerWidth.
  // El módulo 06 garantiza con su retry pattern que clientWidth >= 100
  // antes de llamarnos.
  function pickCols(availW) {
    if (availW < 700)  return 1;
    if (availW < 1200) return 2;
    return 3;
  }

  // ────────────────────────────────────────────────────────────
  // PARTIR EL HTML EN SECCIONES
  // ────────────────────────────────────────────────────────────
  // Heredado de r10. Detecta títulos, headers de sección, y anotaciones
  // inline (INTRO:/OUTRO:/etc.) para fusionarlas con su cuerpo siguiente.
  // Esto da unidades semánticas que el browser luego distribuye en cols.
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
        while (i < raw.length && isOnlyCapo(raw[i]))         { combo += '\n' + raw[i]; i++; }
        while (i < raw.length && isAnnotationLine(raw[i]))   { combo += '\n' + raw[i]; i++; }
        if (i < raw.length && isOnlySectionHeader(raw[i]))   { combo += '\n' + raw[i]; i++; }
        if (i < raw.length)                                  { combo += '\n' + raw[i]; i++; }
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
  // CONSTRUCCIÓN DE NODOS DEL DOM
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

  function buildPager(wrapper) {
    var pager = document.createElement('div');
    pager.className = 'chord-fit-pager';
    pager.appendChild(wrapper);
    return pager;
  }

  // Indicador de página "1/3" — solo visible cuando hay >1 páginas
  function buildPageIndicator() {
    var ind = document.createElement('div');
    ind.className = 'chord-fit-page-indicator';
    ind.setAttribute('aria-live', 'polite');
    ind.setAttribute('aria-atomic', 'true');
    ind.innerHTML =
      '<span class="cf-pi-current">1</span>' +
      '<span class="cf-pi-sep">/</span>' +
      '<span class="cf-pi-total">1</span>';
    return ind;
  }

  // Flechas hint izquierda/derecha — desaparecen cuando no aplican
  function buildHints() {
    var hints = document.createElement('div');
    hints.className = 'chord-fit-hints';
    hints.innerHTML =
      '<button type="button" class="cf-hint cf-hint-left" aria-label="Página anterior">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<polyline points="15 18 9 12 15 6"></polyline>' +
        '</svg>' +
      '</button>' +
      '<button type="button" class="cf-hint cf-hint-right" aria-label="Siguiente página">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<polyline points="9 18 15 12 9 6"></polyline>' +
        '</svg>' +
      '</button>';
    return hints;
  }

  // ────────────────────────────────────────────────────────────
  // ESTADO DE PÁGINAS (cálculo en vivo)
  // ────────────────────────────────────────────────────────────
  function getPageState(block) {
    var pager = block._cfPager;
    if (!pager || pager.clientWidth === 0) {
      return { pageW: 0, totalPages: 1, currentPage: 1 };
    }
    var pageW = pager.clientWidth;
    var totalW = pager.scrollWidth;
    var totalPages = Math.max(1, Math.round(totalW / pageW));
    var currentPage = Math.min(
      totalPages,
      Math.max(1, Math.round(pager.scrollLeft / pageW) + 1)
    );
    return { pageW: pageW, totalPages: totalPages, currentPage: currentPage };
  }

  function updateUI(block) {
    var state = getPageState(block);
    block._cfState = state;

    // Indicador "1/3"
    var ind = block._cfIndicator;
    if (ind) {
      var hidden = state.totalPages <= 1;
      ind.classList.toggle('cf-pi-visible', !hidden);
      if (!hidden) {
        ind.querySelector('.cf-pi-current').textContent = state.currentPage;
        ind.querySelector('.cf-pi-total').textContent   = state.totalPages;
      }
    }

    // Flechas hint
    var hints = block._cfHints;
    if (hints) {
      var leftBtn  = hints.querySelector('.cf-hint-left');
      var rightBtn = hints.querySelector('.cf-hint-right');
      var hasLeft  = state.currentPage > 1;
      var hasRight = state.currentPage < state.totalPages;
      leftBtn.classList.toggle('cf-hint-visible',  hasLeft);
      rightBtn.classList.toggle('cf-hint-visible', hasRight);
    }
  }

  // ────────────────────────────────────────────────────────────
  // NAVEGACIÓN ENTRE PÁGINAS
  // ────────────────────────────────────────────────────────────
  function gotoPage(block, page) {
    var pager = block._cfPager;
    if (!pager) return;
    var state = getPageState(block);
    page = Math.max(1, Math.min(state.totalPages, page));
    pager.scrollTo({
      left: (page - 1) * state.pageW,
      behavior: 'smooth'
    });
  }

  // Snap programático: redondea al entero más cercano.
  // Complementa el CSS scroll-snap nativo. En algunos browsers móviles
  // el snap nativo no es 100% confiable tras inertia scroll; este snap
  // garantiza que siempre quedamos centrados en una página.
  function snapToNearest(block) {
    var pager = block._cfPager;
    if (!pager) return;
    var pageW = pager.clientWidth;
    if (pageW === 0) return;
    var current = pager.scrollLeft / pageW;
    var target  = Math.round(current);
    var targetPx = target * pageW;
    if (Math.abs(pager.scrollLeft - targetPx) > 1) {
      pager.scrollTo({ left: targetPx, behavior: 'smooth' });
    }
  }

  // ────────────────────────────────────────────────────────────
  // PINCH-TO-ZOOM (móvil/tablet)
  // ────────────────────────────────────────────────────────────
  function setupPinch(pager, wrapper, baseFs, block) {
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
      // Tras el reflow del browser, recalcular UI (numPages cambia)
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { updateUI(block); });
      });
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
      // Ignorar taps en hints/buttons/etc.
      if (e.target.closest('button, a, .transpose-bar, .cf-hint')) return;
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

    pager.addEventListener('touchstart', onTouchStart, { passive: false });
    pager.addEventListener('touchmove',  onTouchMove,  { passive: false });
    pager.addEventListener('touchend',   onTouchEnd,   { passive: true  });
    pager.addEventListener('touchend',   onTap,        { passive: false });

    return function cleanup() {
      pager.removeEventListener('touchstart', onTouchStart);
      pager.removeEventListener('touchmove',  onTouchMove);
      pager.removeEventListener('touchend',   onTouchEnd);
      pager.removeEventListener('touchend',   onTap);
    };
  }

  // ────────────────────────────────────────────────────────────
  // WHEEL ZOOM (desktop, con Ctrl/Cmd)
  // ────────────────────────────────────────────────────────────
  function setupWheelZoom(pager, wrapper, baseFs, block) {
    var currentFs = baseFs, STEP = 0.05;

    function applyFs(fs) {
      currentFs = Math.min(PINCH_FS_MAX, Math.max(PINCH_FS_MIN, fs));
      wrapper.style.setProperty('--cf-fs', currentFs.toFixed(3) + 'rem');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { updateUI(block); });
      });
    }

    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyFs(currentFs + (e.deltaY > 0 ? -STEP : STEP));
    }
    function onDblClick(e) {
      if (e.target.closest('button, a, .transpose-bar, .cf-hint')) return;
      e.preventDefault();
      applyFs(baseFs);
    }
    pager.addEventListener('wheel',    onWheel, { passive: false });
    pager.addEventListener('dblclick', onDblClick);
    return function cleanup() {
      pager.removeEventListener('wheel',    onWheel);
      pager.removeEventListener('dblclick', onDblClick);
    };
  }

  // ────────────────────────────────────────────────────────────
  // RESIZE OBSERVER (rotación, fullscreen tardío, etc.)
  // ────────────────────────────────────────────────────────────
  function setupResizeObserver(block, pager, wrapper) {
    if (typeof ResizeObserver === 'undefined') return function () {};

    var debounceTimer = null;

    var ro = new ResizeObserver(function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var w = block.clientWidth || window.innerWidth;
        var newCols = pickCols(w);
        var current = parseInt(wrapper.style.getPropertyValue('--cf-cols'), 10);
        if (newCols !== current) {
          wrapper.style.setProperty('--cf-cols', newCols);
        }
        // Re-snap en caso que el ancho cambie y el scroll-left quede en
        // un punto intermedio. También recalcula UI.
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            snapToNearest(block);
            updateUI(block);
          });
        });
      }, RESIZE_DEBOUNCE_MS);
    });

    ro.observe(block);

    return function cleanup() {
      if (debounceTimer) clearTimeout(debounceTimer);
      try { ro.disconnect(); } catch (e) { /* noop */ }
    };
  }

  // ────────────────────────────────────────────────────────────
  // SCROLL LISTENER — actualizar UI + snap programático
  // ────────────────────────────────────────────────────────────
  function setupScrollListener(pager, block) {
    var uiTimer = null;
    var snapTimer = null;
    var isTouching = false;

    function onScroll() {
      // Update UI rápido para feedback fluido
      if (uiTimer) clearTimeout(uiTimer);
      uiTimer = setTimeout(function () { updateUI(block); }, SCROLL_UI_DEBOUNCE_MS);

      // Snap solo cuando NO está siendo tocado (deja que el browser
      // haga el snap CSS durante touchmove + inertia)
      if (!isTouching) {
        if (snapTimer) clearTimeout(snapTimer);
        snapTimer = setTimeout(function () { snapToNearest(block); }, SNAP_AFTER_SCROLL_MS);
      }
    }

    function onTouchStart() {
      isTouching = true;
      if (snapTimer) clearTimeout(snapTimer);
    }
    function onTouchEnd() {
      isTouching = false;
      if (snapTimer) clearTimeout(snapTimer);
      // Pequeño delay tras touchend para dejar que la inertia llegue al lugar
      snapTimer = setTimeout(function () { snapToNearest(block); }, SNAP_AFTER_TOUCH_MS);
    }

    pager.addEventListener('scroll',      onScroll,    { passive: true });
    pager.addEventListener('touchstart',  onTouchStart,{ passive: true });
    pager.addEventListener('touchend',    onTouchEnd,  { passive: true });
    pager.addEventListener('touchcancel', onTouchEnd,  { passive: true });

    return function cleanup() {
      if (uiTimer)   clearTimeout(uiTimer);
      if (snapTimer) clearTimeout(snapTimer);
      pager.removeEventListener('scroll',      onScroll);
      pager.removeEventListener('touchstart',  onTouchStart);
      pager.removeEventListener('touchend',    onTouchEnd);
      pager.removeEventListener('touchcancel', onTouchEnd);
    };
  }

  // ────────────────────────────────────────────────────────────
  // CLICKS EN LAS FLECHAS HINT
  // ────────────────────────────────────────────────────────────
  function setupHintClicks(hints, block) {
    function onClick(e) {
      var btn = e.target.closest('.cf-hint');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var dir = btn.classList.contains('cf-hint-right') ? 1 : -1;
      var state = block._cfState || getPageState(block);
      gotoPage(block, state.currentPage + dir);
    }
    hints.addEventListener('click', onClick);
    return function cleanup() {
      hints.removeEventListener('click', onClick);
    };
  }

  // ────────────────────────────────────────────────────────────
  // ENTRAR A FULLSCREEN-FIT
  // ────────────────────────────────────────────────────────────
  window.enterChordFit = function (block) {
    if (!block) return;
    if (block._cfPager) return;

    var pre = block.querySelector('pre:not(.cf-source-hidden)');
    if (!pre) return;

    // Construir la jerarquía de DOM
    var wrapper   = buildWrapper(pre.innerHTML);
    var pager     = buildPager(wrapper);
    var hints     = buildHints();
    var indicator = buildPageIndicator();

    // Activar layout fullscreen
    block.classList.add('cf-active');
    pre.classList.add('cf-source-hidden');
    block.appendChild(pager);
    block.appendChild(hints);      // hijos directos del block (no del pager)
    block.appendChild(indicator);  // así no scrollean con el contenido

    // Decidir cols según el block REAL (fix r12)
    var availW = block.clientWidth || window.innerWidth;
    var cols   = pickCols(availW);
    wrapper.style.setProperty('--cf-cols', cols);
    wrapper.style.setProperty('--cf-fs', FS_DEFAULT.toFixed(3) + 'rem');

    // Guardar referencias para que las funciones helper accedan
    block._cfPager     = pager;
    block._cfWrapper   = wrapper;
    block._cfHints     = hints;
    block._cfIndicator = indicator;
    block._cfBaseFs    = FS_DEFAULT;

    // Enganchar listeners
    var cleanupPinch  = setupPinch(pager, wrapper, FS_DEFAULT, block);
    var cleanupWheel  = setupWheelZoom(pager, wrapper, FS_DEFAULT, block);
    var cleanupResize = setupResizeObserver(block, pager, wrapper);
    var cleanupScroll = setupScrollListener(pager, block);
    var cleanupHints  = setupHintClicks(hints, block);

    block._cfCleanup = function () {
      cleanupPinch();
      cleanupWheel();
      cleanupResize();
      cleanupScroll();
      cleanupHints();
    };

    // Calcular UI inicial: doble rAF para que el browser haya hecho layout
    // de las cols ANTES de medir scrollWidth.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { updateUI(block); });
    });
  };

  // ────────────────────────────────────────────────────────────
  // SALIR DE FULLSCREEN-FIT
  // ────────────────────────────────────────────────────────────
  window.exitChordFit = function (block) {
    if (!block) return;
    if (block._cfCleanup) {
      block._cfCleanup();
      block._cfCleanup = null;
    }

    // Quitar pager, hints, indicator
    [block._cfPager, block._cfHints, block._cfIndicator].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    block._cfPager     = null;
    block._cfWrapper   = null;
    block._cfHints     = null;
    block._cfIndicator = null;
    block._cfBaseFs    = null;
    block._cfState     = null;

    block.classList.remove('cf-active');
    var hiddenPre = block.querySelector('pre.cf-source-hidden');
    if (hiddenPre) hiddenPre.classList.remove('cf-source-hidden');
  };

})();
