/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12d-fullscreen-diag.js
 *   @brief      Botón "Diag" en transpose-bar para diagnosticar fullscreen-fit (Modo Dev)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46r11
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12d-fullscreen-diag.js  —  v3.2.46r11
   ============================================================================
   PROPÓSITO
   ────────────────────────────────────────────────────────────────────────────
   Permite diagnosticar el comportamiento del módulo 12-chord-fullscreen-fit.js
   directamente desde la tablet, sin necesidad de abrir DevTools (que en muchos
   tablets no es accesible y, además, en pantalla fullscreen no hay manera de
   levantar la consola del browser).

   La motivación viene del JSON inspeccionado en r9 que reveló por qué el
   layout fallaba (cols extras horizontales, contenido 5x más alto que el
   viewport, etc.). Ese JSON se obtuvo en desktop pegando un script en F12.
   En tablet horizontal —que es donde Renzo realmente toca— no se puede.

   Este módulo añade un botón "Diag" en la transpose-bar de cada bloque de
   acordes. Visibilidad controlada por CSS:

       body.dev-mode .chords-block.fullscreen.cf-active .chord-diag-btn

   → solo se ve en Modo Dev Y dentro de fullscreen activo. Modo Coro normal,
   o fullscreen sin Modo Dev, no lo muestran.

   FLUJO DE USO
   ────────────────────────────────────────────────────────────────────────────
     1. Activar Modo Coro (5 clicks en ícono de iglesia)
     2. Activar Modo Dev (5 clicks en versión bajo el ícono)
     3. Abrir acordes de un canto, click "Expandir" (entrar a fullscreen)
     4. En la transpose-bar aparece botón "Diag"
     5. Click → overlay modal con el JSON de diagnóstico
     6. Click "Copiar JSON" → portapapeles
     7. Pegar en chat para que Claude lo analice

   ARQUITECTURA
   ────────────────────────────────────────────────────────────────────────────
   Wrappea window.injectTransposeBar (definida por el módulo 06). Cada vez
   que se inyecta una transpose-bar nueva, este wrapper añade el botón "Diag"
   al final de la barra. NO modifica el módulo 06 ni el 12; añade
   funcionalidad de manera ortogonal.

   ORDEN DE CARGA: posición DESPUÉS del módulo 12 (porque depende de que
   window.injectTransposeBar ya esté definida por el módulo 06, que carga
   antes que el 12).
   ============================================================================ */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // CONSTANTES
  // ────────────────────────────────────────────────────────────
  var DIAG_BTN_CLASS    = 'chord-diag-btn';
  var DIAG_OVERLAY_ID   = 'chord-diag-overlay';
  var DIAG_OVERLAY_OPEN = 'chord-diag-overlay--open';

  // SVG del ícono del botón (estetoscopio simplificado / ícono diagnóstico)
  var DIAG_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"/>' +
      '<line x1="16" y1="16" x2="21" y2="21"/>' +
      '<line x1="8.5" y1="11" x2="13.5" y2="11"/>' +
      '<line x1="11" y1="8.5" x2="11" y2="13.5"/>' +
    '</svg>';

  // ────────────────────────────────────────────────────────────
  // WRAPPING DE window.injectTransposeBar
  // ────────────────────────────────────────────────────────────
  // El módulo 06 define window.injectTransposeBar y la usa al hacer toggle
  // de los acordes. Wrappeamos para añadir nuestro botón sin tocar el módulo
  // original. Mismo patrón usado históricamente en este proyecto.
  var origInject = window.injectTransposeBar;

  if (typeof origInject !== 'function') {
    // Si por alguna razón el módulo 06 no cargó, este módulo no tiene
    // nada que wrappear. Salimos sin romper nada.
    console.warn('[12d-diag] window.injectTransposeBar no existe; módulo inactivo.');
    return;
  }

  window.injectTransposeBar = function (blockId) {
    // Llamamos al inyector original (construye la barra completa)
    origInject(blockId);

    // Localizar el bloque y la barra recién construida
    var block = document.getElementById('chords-block-' + blockId);
    if (!block) return;

    var bar = block.querySelector('.transpose-bar');
    if (!bar) return;

    // Si ya tiene botón Diag, no duplicar
    if (bar.querySelector('.' + DIAG_BTN_CLASS)) return;

    // Construir el botón
    var btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = DIAG_BTN_CLASS;
    btn.title     = 'Diagnóstico fullscreen (Modo Dev)';
    btn.setAttribute('aria-label', 'Diagnóstico fullscreen');
    btn.innerHTML = DIAG_ICON_SVG + '<span>Diag</span>';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openDiagOverlay(block);
    });

    bar.appendChild(btn);
  };

  // ────────────────────────────────────────────────────────────
  // RECOLECCIÓN DEL DIAGNÓSTICO
  // ────────────────────────────────────────────────────────────
  // Reproduce el script de inspección de la saga r1-r10, ejecutado contra
  // el bloque que está actualmente en fullscreen. Si ese bloque no es el
  // mismo desde el que se abrió el diag, igual devuelve algo útil
  // (priorizando el block fullscreen activo del DOM).
  function collectDiagnostic(originBlock) {
    // Preferimos el bloque fullscreen activo. Si no hay, caemos al origen.
    var block = document.querySelector('.chords-block.fullscreen') || originBlock;
    if (!block) {
      return { error: 'No hay bloque fullscreen activo en el DOM.' };
    }

    var wrapper = block.querySelector('.chord-fit-wrapper');
    if (!wrapper) {
      return {
        error: 'No hay .chord-fit-wrapper. Módulo 12 puede no haberse activado.',
        moduloActivo: typeof window.enterChordFit === 'function',
        blockClasses: block.className
      };
    }

    var sections = wrapper.querySelectorAll('.chord-fit-section');
    var cs       = getComputedStyle(wrapper);
    var blockCs  = getComputedStyle(block);

    // Datos del primer section (suele ser el más grande / con título)
    var firstSection      = sections[0] || null;
    var firstSectionCs    = firstSection ? getComputedStyle(firstSection) : null;
    var primerMarginBot   = firstSectionCs ? firstSectionCs.marginBottom : null;
    var primerBreakInside = firstSectionCs ? firstSectionCs.breakInside  : null;

    // Suma de alturas de todas las secciones (proxy del contenido total)
    var alturaTotalSecciones = 0;
    Array.prototype.forEach.call(sections, function (sec) {
      alturaTotalSecciones += sec.offsetHeight;
    });

    // Identificación del canto para que Renzo no tenga que adivinar
    var card        = block.closest('.song-card');
    var chordId     = card ? (card.getAttribute('data-chord-id') || null) : null;
    var titleEl     = card ? card.querySelector('.song-title') : null;
    var cantoTitulo = titleEl
      ? titleEl.textContent.replace(/[𝄞▾▴]/g, '').trim()
      : null;

    return {
      version: 'v3.2.46r11',
      timestamp: new Date().toISOString(),

      // Identificación del canto inspeccionado
      canto: cantoTitulo,
      chordId: chordId,

      // Estado del módulo 12
      moduloActivo: typeof window.enterChordFit === 'function',

      // Clases del block y overflow del block (sticky bar depende de esto)
      blockClasses:  block.className,
      blockOverflow: blockCs.overflowY,
      blockScrollH:  block.scrollHeight,
      blockClientH:  block.clientHeight,

      // Métricas del wrapper (corazón del layout)
      wrapper_W:        wrapper.clientWidth,
      wrapper_H:        wrapper.clientHeight,
      wrapper_scrollH:  wrapper.scrollHeight,
      wrapper_scrollW:  wrapper.scrollWidth,

      // CSS computado del wrapper (lo que el browser realmente aplicó)
      cssCols:         cs.columnCount,
      cssFs:           cs.getPropertyValue('--cf-fs').trim(),
      cssOverflow_y:   cs.overflowY,
      cssTouchAction:  cs.touchAction,
      cssColumnFill:   cs.columnFill,

      // Estructura interna
      secciones_cantidad:     sections.length,
      primer_marginBottom:    primerMarginBot,
      primer_breakInside:     primerBreakInside,
      altura_total_secciones: alturaTotalSecciones,

      // Diagnóstico de overflow (claves del análisis r9)
      excede_altura_block:   block.scrollHeight   > block.clientHeight,
      excede_altura_wrapper: wrapper.scrollHeight > wrapper.clientHeight,
      excede_ancho:          wrapper.scrollWidth  > wrapper.clientWidth,

      // Viewport (para detectar problemas de elección de cols por timing)
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,

      // User agent (útil para distinguir tablet horizontal vs desktop)
      userAgent: navigator.userAgent
    };
  }

  // ────────────────────────────────────────────────────────────
  // OVERLAY DEL DIAGNÓSTICO
  // ────────────────────────────────────────────────────────────
  // Crea (o reutiliza) un overlay modal full-viewport con el JSON
  // pretty-printed y dos acciones: Copiar JSON, Cerrar.
  function buildOverlay() {
    var overlay = document.getElementById(DIAG_OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = DIAG_OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'chord-diag-title');

    overlay.innerHTML =
      '<div class="chord-diag-backdrop" data-action="close"></div>' +
      '<div class="chord-diag-panel">' +
        '<header class="chord-diag-header">' +
          '<h2 id="chord-diag-title" class="chord-diag-title">Diagnóstico Fullscreen</h2>' +
          '<button type="button" class="chord-diag-close" data-action="close" aria-label="Cerrar">✕</button>' +
        '</header>' +
        '<div class="chord-diag-body">' +
          '<pre class="chord-diag-pre" id="chord-diag-pre"></pre>' +
        '</div>' +
        '<footer class="chord-diag-footer">' +
          '<span class="chord-diag-status" id="chord-diag-status"></span>' +
          '<button type="button" class="chord-diag-btn-secondary" data-action="close">Cerrar</button>' +
          '<button type="button" class="chord-diag-btn-primary"   data-action="copy">Copiar JSON</button>' +
        '</footer>' +
      '</div>';

    document.body.appendChild(overlay);

    // Delegación de clicks
    overlay.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var action = actionEl.getAttribute('data-action');
      if (action === 'close') closeDiagOverlay();
      else if (action === 'copy') copyJsonToClipboard();
    });

    // Cerrar con tecla Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains(DIAG_OVERLAY_OPEN)) {
        closeDiagOverlay();
      }
    });

    return overlay;
  }

  function openDiagOverlay(originBlock) {
    var data    = collectDiagnostic(originBlock);
    var pretty  = JSON.stringify(data, null, 2);
    var overlay = buildOverlay();
    var pre     = overlay.querySelector('#chord-diag-pre');
    var status  = overlay.querySelector('#chord-diag-status');

    pre.textContent = pretty;
    if (status) status.textContent = '';

    // Guardar JSON en el overlay para el botón Copiar
    overlay._diagJson = pretty;

    overlay.classList.add(DIAG_OVERLAY_OPEN);
  }

  function closeDiagOverlay() {
    var overlay = document.getElementById(DIAG_OVERLAY_ID);
    if (overlay) overlay.classList.remove(DIAG_OVERLAY_OPEN);
  }

  // ────────────────────────────────────────────────────────────
  // COPIA AL PORTAPAPELES (con fallback)
  // ────────────────────────────────────────────────────────────
  // navigator.clipboard.writeText es ideal pero requiere contexto seguro
  // (HTTPS) y user activation. En GitHub Pages funciona sin problema. Si
  // por algún motivo falla (browser viejo, contexto no seguro, etc.) caemos
  // al método clásico con textarea + execCommand('copy').
  function copyJsonToClipboard() {
    var overlay = document.getElementById(DIAG_OVERLAY_ID);
    if (!overlay) return;
    var json    = overlay._diagJson || '';
    var status  = overlay.querySelector('#chord-diag-status');

    function ok() {
      if (status) {
        status.textContent = '✓ Copiado al portapapeles';
        status.classList.add('chord-diag-status--ok');
        setTimeout(function () {
          status.textContent = '';
          status.classList.remove('chord-diag-status--ok');
        }, 2200);
      }
    }
    function fail(err) {
      if (status) {
        status.textContent = '⚠ No se pudo copiar — selecciona y copia manual';
        status.classList.add('chord-diag-status--err');
        setTimeout(function () {
          status.textContent = '';
          status.classList.remove('chord-diag-status--err');
        }, 3500);
      }
      if (err) console.warn('[12d-diag] copy failed:', err);
    }

    // Camino moderno (preferido)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(json).then(ok).catch(function (err) {
        // Fallback si writeText falla por permisos
        legacyCopy(json) ? ok() : fail(err);
      });
      return;
    }

    // Camino clásico
    legacyCopy(json) ? ok() : fail();
  }

  // Fallback de copia: textarea oculto + execCommand
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      // Posicionado fuera de pantalla pero seleccionable
      ta.style.position = 'fixed';
      ta.style.top      = '-9999px';
      ta.style.left     = '0';
      ta.style.opacity  = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

})();
