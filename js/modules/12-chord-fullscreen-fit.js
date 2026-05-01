/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12-chord-fullscreen-fit.js
 *   @brief      Auto-fit + pinch-to-zoom para acordes en fullscreen
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12-chord-fullscreen-fit.js
   ============================================================================
   FILOSOFÍA — Reemplazo del antiguo "multi-column con paginación manual"
   ────────────────────────────────────────────────────────────────────────────
   El objetivo del fullscreen de acordes es UNO SOLO: que el guitarrista vea
   la mayor parte del canto posible sin tener que pasar página, en cualquier
   tamaño de pantalla.

   Approach anterior (descartado):
     - Calculaba alturas de cada sección con clones invisibles.
     - Paginaba manualmente en "páginas estilo Word".
     - Re-evaluaba con ResizeObserver + debounce.
     - Tenía botones + - de zoom (arcaicos, race-conditions).
     - 275 líneas con bugs de overlap en móvil.

   Approach actual (este módulo):
     - Una sola medición al entrar a fullscreen.
     - CSS columns nativo (column-fill: balance) hace el layout automático.
     - Búsqueda binaria: encuentra (cols, font-size) que maximiza ambos sin
       que el contenido excede la altura disponible.
     - Pinch-to-zoom táctil custom (fullscreen suprime el pinch del browser).
     - Double-tap para reset al auto-fit.
     - Una sola fuente de verdad: el font-size del wrapper.

   API PÚBLICA:
     window.enterChordFit(block) — al entrar a fullscreen
     window.exitChordFit(block)  — al salir de fullscreen

   ORDEN DE CARGA: posición 12 de 24 (orden DOM original).
   ============================================================================ */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // CONSTANTES
  // ────────────────────────────────────────────────────────────
  var TOOLBAR_H        = 70;     // altura aprox de la transpose-bar
  var COL_GAP_PX       = 28;     // gap entre columnas (debe coincidir CSS)
  var FS_MIN           = 0.6;    // rem — font-size mínimo legible
  var FS_MAX           = 1.6;    // rem — font-size máximo razonable
  var FS_TARGET_MIN    = 0.85;   // rem — font-size aceptable para preferir +cols
  var BINARY_ITER      = 7;      // iteraciones de búsqueda binaria del fs
  var PINCH_FS_MIN     = 0.5;    // rem — pinch puede ir más bajo que auto
  var PINCH_FS_MAX     = 2.6;    // rem — pinch puede ir más alto que auto
  var DOUBLETAP_MS     = 320;    // ms — ventana de double-tap

  // ────────────────────────────────────────────────────────────
  // DETERMINAR CANDIDATOS DE COLUMNAS según ancho de pantalla
  // ────────────────────────────────────────────────────────────
  // En móvil portrait (< 600px) → solo 1 columna posible.
  // En tablet/landscape (600-1100px) → probar 2, luego 1.
  // En desktop wide (≥ 1100px) → probar 3, 2, 1.
  function colCandidates(availW) {
    if (availW < 600)  return [1];
    if (availW < 1100) return [2, 1];
    return [3, 2, 1];
  }

  // ────────────────────────────────────────────────────────────
  // PARTIR EL HTML EN SECCIONES por líneas vacías
  // ────────────────────────────────────────────────────────────
  // Cada sección (estrofa, coro, etc.) se mantiene unida en su columna
  // gracias a `break-inside: avoid` en CSS. Las separamos manualmente
  // para que CSS-columns las reciba como bloques distintos.
  function splitSections(html) {
    return html
      .split(/\n[ \t]*\n+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  // ────────────────────────────────────────────────────────────
  // CONSTRUIR el wrapper con secciones
  // ────────────────────────────────────────────────────────────
  function buildWrapper(sections) {
    var wrapper = document.createElement('div');
    wrapper.className = 'chord-fit-wrapper';

    sections.forEach(function (html) {
      var section = document.createElement('div');
      section.className = 'chord-fit-section';
      var pre = document.createElement('pre');
      pre.innerHTML = html;
      section.appendChild(pre);
      wrapper.appendChild(section);
    });

    return wrapper;
  }

  // ────────────────────────────────────────────────────────────
  // APLICAR un layout específico (cols, fontSize) al wrapper
  // ────────────────────────────────────────────────────────────
  function applyLayout(wrapper, cols, fsRem) {
    wrapper.style.setProperty('--cf-cols', cols);
    wrapper.style.setProperty('--cf-fs', fsRem.toFixed(3) + 'rem');
  }

  // ────────────────────────────────────────────────────────────
  // ¿El contenido CABE en la altura disponible con este layout?
  // ────────────────────────────────────────────────────────────
  // Estrategia: aplicar el layout, forzar reflow leyendo offsetHeight,
  // y comparar scrollHeight (altura total del contenido) contra la
  // altura disponible. Pequeño margen anti-clipping.
  function fitsInHeight(wrapper, cols, fsRem, availH) {
    applyLayout(wrapper, cols, fsRem);
    // Forzar reflow inmediato
    wrapper.offsetHeight;  // eslint-disable-line no-unused-expressions
    // Margen de seguridad de 4px contra clipping subpixel
    return wrapper.scrollHeight <= availH + 4;
  }

  // ────────────────────────────────────────────────────────────
  // ¿La línea más larga cabe horizontalmente con este layout?
  // ────────────────────────────────────────────────────────────
  // Cuando hay más columnas, cada columna es más estrecha. Si la línea
  // más larga del canto (con white-space: pre) no cabe, habría overflow
  // horizontal o las columnas se romperían. Verificamos esto por separado.
  //
  // Implementación: aplicamos el layout, leemos clientWidth y scrollWidth.
  // Si scrollWidth > clientWidth → hay líneas que se desbordan.
  function fitsInWidth(wrapper) {
    return wrapper.scrollWidth <= wrapper.clientWidth + 1;
  }

  // ────────────────────────────────────────────────────────────
  // BÚSQUEDA BINARIA: encontrar el font-size más grande que cabe
  // ────────────────────────────────────────────────────────────
  // Para una cantidad de columnas dada, encuentra el font-size más grande
  // (entre FS_MIN y FS_MAX) tal que TODO el contenido cabe en la altura
  // disponible Y la línea más larga cabe en el ancho de columna.
  //
  // Devuelve el font-size encontrado, o 0 si ni siquiera FS_MIN cabe.
  function findMaxFontSize(wrapper, cols, availH) {
    // Test rápido: ¿cabe con FS_MIN?
    if (!fitsInHeight(wrapper, cols, FS_MIN, availH) ||
        !fitsInWidth(wrapper)) {
      // Re-comprobamos: si con el mínimo NO cabe horizontalmente,
      // esa cantidad de columnas es inviable.
      if (!fitsInWidth(wrapper)) return 0;
      // Si cabe horizontal pero no vertical con FS_MIN, devolvemos
      // FS_MIN igual (aceptamos scroll vertical en este caso extremo).
      return FS_MIN;
    }

    // Test rápido: ¿cabe con FS_MAX? Si sí, no necesitamos búsqueda.
    if (fitsInHeight(wrapper, cols, FS_MAX, availH) &&
        fitsInWidth(wrapper)) {
      return FS_MAX;
    }

    // Búsqueda binaria propiamente dicha
    var lo = FS_MIN;
    var hi = FS_MAX;
    var best = FS_MIN;

    for (var i = 0; i < BINARY_ITER; i++) {
      var mid = (lo + hi) / 2;
      var fitsH = fitsInHeight(wrapper, cols, mid, availH);
      var fitsW = fitsInWidth(wrapper);

      if (fitsH && fitsW) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return best;
  }

  // ────────────────────────────────────────────────────────────
  // ENCONTRAR el mejor layout (cols, fs) para el canto y pantalla
  // ────────────────────────────────────────────────────────────
  // Lógica de prioridad:
  //   1. Probar de más a menos columnas.
  //   2. Para cada cantidad de columnas, encontrar el font-size máximo
  //      que cabe.
  //   3. Si ese font-size es ≥ FS_TARGET_MIN, ese layout es bueno.
  //   4. Si NINGUNA cantidad alcanza FS_TARGET_MIN, elegir la cantidad
  //      de columnas que dé el font-size más grande.
  function findBestLayout(wrapper, availW, availH) {
    var candidates = colCandidates(availW);
    var attempted = [];

    for (var i = 0; i < candidates.length; i++) {
      var cols = candidates[i];
      var fs = findMaxFontSize(wrapper, cols, availH);

      attempted.push({ cols: cols, fs: fs });

      // Layout aceptable encontrado — lo usamos
      if (fs >= FS_TARGET_MIN) {
        return { cols: cols, fs: fs };
      }
    }

    // Ningún layout alcanzó el target mínimo. Elegir el que dio mayor fs.
    var best = attempted[0];
    for (var j = 1; j < attempted.length; j++) {
      if (attempted[j].fs > best.fs) best = attempted[j];
    }

    // Si todos dieron fs=0 (caso patológico), forzar 1 col con FS_MIN
    if (best.fs === 0) {
      return { cols: 1, fs: FS_MIN };
    }

    return best;
  }

  // ────────────────────────────────────────────────────────────
  // PINCH-TO-ZOOM táctil custom
  // ────────────────────────────────────────────────────────────
  // En modo fullscreen el navegador suprime el pinch-zoom natural del
  // viewport. Implementamos pinch sobre el font-size del wrapper.
  //
  // Cuando el usuario amplía con pinch y el contenido no cabe en altura,
  // activamos `cf-overflow` que permite scroll vertical.
  function setupPinch(wrapper, baseFs, availH) {
    var currentFs = baseFs;
    var initialDistance = 0;
    var initialFs = baseFs;
    var pinching = false;

    function distance(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function clamp(x, min, max) {
      return Math.min(max, Math.max(min, x));
    }

    function applyFs(fs) {
      currentFs = fs;
      wrapper.style.setProperty('--cf-fs', fs.toFixed(3) + 'rem');
      // Si excede la altura, activar scroll vertical
      if (wrapper.scrollHeight > availH + 4) {
        wrapper.classList.add('cf-overflow');
      } else {
        wrapper.classList.remove('cf-overflow');
      }
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
        var newDistance = distance(e.touches);
        if (initialDistance > 0) {
          var ratio = newDistance / initialDistance;
          var newFs = clamp(initialFs * ratio, PINCH_FS_MIN, PINCH_FS_MAX);
          applyFs(newFs);
        }
        e.preventDefault();
      }
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) {
        pinching = false;
      }
    }

    // Double-tap para reset al auto-fit
    var lastTap = 0;
    function onTap(e) {
      // Ignorar taps en botones de la barra
      if (e.target.closest('button, a, .transpose-bar')) return;
      // Solo si NO hubo pinch (evitar falsos doubletaps tras pinch)
      if (e.touches && e.touches.length > 0) return;

      var now = Date.now();
      if (now - lastTap < DOUBLETAP_MS) {
        // Double-tap detectado → reset al auto-fit
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

    // Devolver función de cleanup
    return function cleanup() {
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove',  onTouchMove);
      wrapper.removeEventListener('touchend',   onTouchEnd);
      wrapper.removeEventListener('touchend',   onTap);
    };
  }

  // ────────────────────────────────────────────────────────────
  // ZOOM CON RUEDA en desktop (Ctrl + wheel)
  // ────────────────────────────────────────────────────────────
  // En desktop no hay pinch — pero Ctrl+rueda es el equivalente esperado.
  function setupWheelZoom(wrapper, baseFs, availH) {
    var currentFs = baseFs;
    var STEP = 0.05;

    function applyFs(fs) {
      currentFs = Math.min(PINCH_FS_MAX, Math.max(PINCH_FS_MIN, fs));
      wrapper.style.setProperty('--cf-fs', currentFs.toFixed(3) + 'rem');
      if (wrapper.scrollHeight > availH + 4) {
        wrapper.classList.add('cf-overflow');
      } else {
        wrapper.classList.remove('cf-overflow');
      }
    }

    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var delta = e.deltaY > 0 ? -STEP : STEP;
      applyFs(currentFs + delta);
    }

    // Double-click para reset (equivalente desktop al double-tap)
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
    if (block._cfWrapper) return;  // ya activo

    var pre = block.querySelector('pre:not(.cf-source-hidden)');
    if (!pre) return;

    // Crear wrapper con secciones
    var sections = splitSections(pre.innerHTML);
    if (sections.length === 0) return;

    var wrapper = buildWrapper(sections);

    // Insertar (oculto provisionalmente para medir)
    pre.classList.add('cf-source-hidden');
    block.appendChild(wrapper);

    // Calcular dimensiones disponibles
    var availW = block.clientWidth || window.innerWidth;
    var availH = (block.clientHeight || window.innerHeight) - TOOLBAR_H;

    // Encontrar el mejor layout
    var best = findBestLayout(wrapper, availW, availH);
    applyLayout(wrapper, best.cols, best.fs);

    // Limpiar clase de overflow (el auto-fit garantiza que cabe)
    wrapper.classList.remove('cf-overflow');

    // Configurar pinch (móvil) y wheel (desktop)
    var cleanupPinch = setupPinch(wrapper, best.fs, availH);
    var cleanupWheel = setupWheelZoom(wrapper, best.fs, availH);

    // Guardar referencias para cleanup
    block._cfWrapper = wrapper;
    block._cfBaseFs  = best.fs;
    block._cfCleanup = function () {
      cleanupPinch();
      cleanupWheel();
    };
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

    if (block._cfWrapper && block._cfWrapper.parentNode) {
      block._cfWrapper.parentNode.removeChild(block._cfWrapper);
    }
    block._cfWrapper = null;
    block._cfBaseFs  = null;

    // Restaurar el <pre> original
    var hiddenPre = block.querySelector('pre.cf-source-hidden');
    if (hiddenPre) hiddenPre.classList.remove('cf-source-hidden');
  };

})();
