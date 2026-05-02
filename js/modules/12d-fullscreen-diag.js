/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12d-fullscreen-diag.js
 *   @brief      Botón "Diag" + modo grabación de eventos para fullscreen-fit
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46r19
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12d-fullscreen-diag.js  —  v3.2.46r19
   ============================================================================
   FIX r13: overlay y badge visibles dentro del fullscreen API mode
   ────────────────────────────────────────────────────────────────────────────
   En r12 el overlay solo aparecía al SALIR de fullscreen porque vivía en
   document.body, y cuando el browser está en fullscreen API (vía
   block.requestFullscreen), solo el elemento promovido a fullscreen es
   visible. Cualquier nodo en body queda fuera del viewport del fullscreen.

   Solución r13:
     • Helper getOverlayHost() devuelve document.fullscreenElement si lo
       hay, con fallback a document.body.
     • placeInHost(el) reubica overlay/badge al host correcto antes de
       mostrarlos.
     • Listener fullscreenchange los reubica si el estado cambia mientras
       están visibles.

   El indicador "● REC" ahora también es visible durante el fullscreen API
   y se mueve automáticamente entre block ↔ body al cambiar el estado.

   PROPÓSITO
   ────────────────────────────────────────────────────────────────────────────
   Diagnóstico del módulo 12-chord-fullscreen-fit.js directamente desde la
   tablet, sin DevTools. Visible solo en Modo Dev + fullscreen activo.

   r12 AÑADE EL MODO GRABACIÓN
   ────────────────────────────────────────────────────────────────────────────
   r11 capturaba snapshots estáticos. Pero el bug del JSON 1 (cols=1) vs el
   JSON 2 (cols=2) demostró que el problema NO está en un estado final, sino
   en TRANSICIONES — algo cambia entre acciones del usuario y un snapshot
   único no captura ese cambio.

   El modo grabación captura una secuencia de snapshots cronológicos durante
   una sesión, etiquetando qué evento disparó cada captura:

     start    → estado inicial al iniciar grabación
     enter    → al entrar a fullscreen
     exit     → al salir
     resize   → ResizeObserver del block (debounced)
     orient   → orientationchange
     viewport → window.resize (debounced)
     pinch    → cambió --cf-fs (debounced, captura estado tras pinch)
     scroll   → scroll del block (throttled)
     manual   → tap en el botón "Snap"
     stop     → estado final al detener

   FLUJO DE GRABACIÓN
   ────────────────────────────────────────────────────────────────────────────
     1. Tap "Diag" → overlay abre con snapshot del estado actual.
     2. Tap "● Grabar" → overlay se cierra, aparece indicador flotante
        "● REC | N | Snap | Stop" en la esquina inferior derecha.
     3. El usuario hace acciones (rota tablet, pinch, scroll, etc.).
        Cada evento relevante captura snapshot con su label.
     4. "Snap" en el indicador → snapshot manual a demanda.
     5. "Stop" → overlay reabre con timeline cronológico:
          +000ms  [START]    cols=1 fs=0.95 wW=1018 wH=2108
          +1230ms [RESIZE]   cols=2 fs=0.95 wW=1018 wH=1093  (cssCols: 1→2)
          +3450ms [PINCH]    cols=2 fs=1.20 wW=1018 wH=1390  (cssFs: 0.95→1.20)
        Cada fila expandible al JSON completo.
     6. "Copiar JSON" → todo el log al portapapeles.

   ARQUITECTURA
   ────────────────────────────────────────────────────────────────────────────
   Wrappea window.injectTransposeBar (módulo 06) para añadir el botón "Diag".
   Wrappea window.enterChordFit y window.exitChordFit (módulo 12) para
   capturar esos eventos durante grabación. Wrap defensivo: si alguna no
   existe, el módulo sigue funcionando.

   ORDEN DE CARGA: posición DESPUÉS de los módulos 06 y 12.
   ============================================================================ */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // CONSTANTES
  // ────────────────────────────────────────────────────────────
  var DIAG_BTN_CLASS    = 'chord-diag-btn';
  var DIAG_OVERLAY_ID   = 'chord-diag-overlay';
  var DIAG_OVERLAY_OPEN = 'chord-diag-overlay--open';
  var DIAG_REC_ID       = 'chord-diag-recorder';

  var SCROLL_THROTTLE_MS    = 500;
  var RESIZE_DEBOUNCE_MS    = 200;
  var VIEWPORT_DEBOUNCE_MS  = 200;
  var PINCH_DEBOUNCE_MS     = 250;
  var MAX_RECORDED_SNAPSHOTS = 200;

  // SVG del botón principal (ícono lupa con cruz)
  var DIAG_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"/>' +
      '<line x1="16" y1="16" x2="21" y2="21"/>' +
      '<line x1="8.5" y1="11" x2="13.5" y2="11"/>' +
      '<line x1="11" y1="8.5" x2="11" y2="13.5"/>' +
    '</svg>';

  // ────────────────────────────────────────────────────────────
  // ESTADO GLOBAL DE GRABACIÓN
  // ────────────────────────────────────────────────────────────
  var recState = {
    active:    false,    // true durante una grabación
    startTime: 0,        // ms epoch al inicio
    snapshots: [],       // [{tRel, label, data}]
    cleanups:  []        // funciones para desmontar listeners
  };

  // ────────────────────────────────────────────────────────────
  // WRAPPING — inyectar botón Diag al construir transpose-bar
  // ────────────────────────────────────────────────────────────
  var origInject = window.injectTransposeBar;

  if (typeof origInject !== 'function') {
    console.warn('[12d-diag] window.injectTransposeBar no existe; módulo inactivo.');
    return;
  }

  window.injectTransposeBar = function (blockId) {
    origInject(blockId);

    var block = document.getElementById('chords-block-' + blockId);
    if (!block) return;
    var bar = block.querySelector('.transpose-bar');
    if (!bar) return;
    if (bar.querySelector('.' + DIAG_BTN_CLASS)) return;

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
  // WRAPPING — capturar enter/exit fullscreen durante grabación
  // ────────────────────────────────────────────────────────────
  var origEnter = window.enterChordFit;
  var origExit  = window.exitChordFit;

  if (typeof origEnter === 'function') {
    window.enterChordFit = function (block) {
      var result = origEnter.apply(this, arguments);
      if (recState.active) captureSnapshot('enter', block);
      return result;
    };
  }
  if (typeof origExit === 'function') {
    window.exitChordFit = function (block) {
      if (recState.active) captureSnapshot('exit', block);
      return origExit.apply(this, arguments);
    };
  }

  // ────────────────────────────────────────────────────────────
  // RECOLECCIÓN DEL DIAGNÓSTICO (un snapshot)
  // ────────────────────────────────────────────────────────────
  function collectDiagnostic(originBlock) {
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

    // r15: capturar info del pager (paradigma r14+) y del estado interno
    // del módulo 12. Permite diferenciar "CSS no se cargó" vs "JS no
    // corrió" vs "ambos OK pero el contenido no excede en cols".
    var pager      = block.querySelector('.chord-fit-pager');
    var pagerCs    = pager ? getComputedStyle(pager) : null;
    var pagerInfo  = pager ? {
      pager_existe:        true,
      pager_W:             pager.clientWidth,
      pager_H:             pager.clientHeight,
      pager_scrollW:       pager.scrollWidth,
      pager_scrollH:       pager.scrollHeight,
      pager_scrollLeft:    pager.scrollLeft,
      pager_overflowX:     pagerCs.overflowX,
      pager_overflowY:     pagerCs.overflowY,
      pager_scrollSnapType: pagerCs.scrollSnapType,
      pager_touchAction:   pagerCs.touchAction
    } : { pager_existe: false };

    // Estado interno del módulo 12 r14+ (paginación)
    var cfState = block._cfState || null;
    var hintsEl = block.querySelector('.chord-fit-hints');
    var indEl   = block.querySelector('.chord-fit-page-indicator');
    var paginationInfo = {
      cfState:                cfState,
      hints_existen:          !!hintsEl,
      hint_left_visible:      hintsEl  ? hintsEl.querySelector('.cf-hint-left.cf-hint-visible')  !== null : false,
      hint_right_visible:     hintsEl  ? hintsEl.querySelector('.cf-hint-right.cf-hint-visible') !== null : false,
      indicator_existe:       !!indEl,
      indicator_visible:      indEl ? indEl.classList.contains('cf-pi-visible') : false,
      indicator_text:         indEl ? indEl.textContent.replace(/\s+/g, '') : null
    };

    var sections = wrapper.querySelectorAll('.chord-fit-section');
    var cs       = getComputedStyle(wrapper);
    var blockCs  = getComputedStyle(block);

    var firstSection      = sections[0] || null;
    var firstSectionCs    = firstSection ? getComputedStyle(firstSection) : null;
    var primerMarginBot   = firstSectionCs ? firstSectionCs.marginBottom : null;
    var primerBreakInside = firstSectionCs ? firstSectionCs.breakInside  : null;

    var alturaTotalSecciones = 0;
    Array.prototype.forEach.call(sections, function (sec) {
      alturaTotalSecciones += sec.offsetHeight;
    });

    var card        = block.closest('.song-card');
    var chordId     = card ? (card.getAttribute('data-chord-id') || null) : null;
    var titleEl     = card ? card.querySelector('.song-title') : null;
    var cantoTitulo = titleEl
      ? titleEl.textContent.replace(/[𝄞▾▴]/g, '').trim()
      : null;

    var snapshot = {
      version: 'v3.2.46r19',
      timestamp: new Date().toISOString(),

      canto:    cantoTitulo,
      chordId:  chordId,

      moduloActivo: typeof window.enterChordFit === 'function',

      blockClasses:   block.className,
      blockOverflow:  blockCs.overflowY,
      blockDisplay:   blockCs.display,            // r15: detectar flex vs block
      blockScrollH:   block.scrollHeight,
      blockClientH:   block.clientHeight,
      blockScrollTop: block.scrollTop,

      wrapper_W:        wrapper.clientWidth,
      wrapper_H:        wrapper.clientHeight,
      wrapper_scrollH:  wrapper.scrollHeight,
      wrapper_scrollW:  wrapper.scrollWidth,

      cssCols:         cs.columnCount,
      cssFs:           cs.getPropertyValue('--cf-fs').trim(),
      cssOverflow_y:   cs.overflowY,
      cssTouchAction:  cs.touchAction,
      cssColumnFill:   cs.columnFill,

      secciones_cantidad:     sections.length,
      primer_marginBottom:    primerMarginBot,
      primer_breakInside:     primerBreakInside,
      altura_total_secciones: alturaTotalSecciones,

      excede_altura_block:   block.scrollHeight   > block.clientHeight,
      excede_altura_wrapper: wrapper.scrollHeight > wrapper.clientHeight,
      excede_ancho:          wrapper.scrollWidth  > wrapper.clientWidth,

      viewportW: window.innerWidth,
      viewportH: window.innerHeight,

      orientation: (screen.orientation && screen.orientation.type) || null,

      userAgent: navigator.userAgent
    };

    // r15: merge pager + pagination info al snapshot
    Object.keys(pagerInfo).forEach(function (k) { snapshot[k] = pagerInfo[k]; });
    Object.keys(paginationInfo).forEach(function (k) { snapshot[k] = paginationInfo[k]; });

    return snapshot;
  }

  // ────────────────────────────────────────────────────────────
  // HOST DEL OVERLAY — soluciona el bug del fullscreen API
  // ────────────────────────────────────────────────────────────
  // r13: cuando el browser entra en fullscreen API mode (block.requestFullscreen),
  // SOLO el elemento promovido a fullscreen es visible. Cualquier nodo en
  // document.body queda fuera del viewport del fullscreen, por eso en r12 el
  // overlay solo se veía al salir de fullscreen.
  //
  // Solución: insertar overlay y badge dentro del elemento que esté en
  // fullscreen, si lo hay. Si no, fallback a document.body. También
  // reubicamos en cada cambio de fullscreen para mantener consistencia.

  // Devuelve el contenedor donde overlay/badge deben vivir AHORA
  function getOverlayHost() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.body;
  }

  // Mueve el elemento al host correcto si no está ya ahí
  function placeInHost(el) {
    if (!el) return;
    var host = getOverlayHost();
    if (el.parentNode !== host) {
      host.appendChild(el);
    }
  }

  // Listener global: cuando cambia el estado de fullscreen, reubicar
  // overlay y badge al lugar correcto (si están visibles).
  function onFullscreenChange() {
    var overlay = document.getElementById(DIAG_OVERLAY_ID);
    var badge   = document.getElementById(DIAG_REC_ID);
    if (overlay && overlay.classList.contains(DIAG_OVERLAY_OPEN)) {
      placeInHost(overlay);
    }
    if (badge && badge.classList.contains('cdr-visible')) {
      placeInHost(badge);
    }
  }
  document.addEventListener('fullscreenchange',       onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // ────────────────────────────────────────────────────────────
  // OVERLAY MODAL
  // ────────────────────────────────────────────────────────────
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
        '<div class="chord-diag-body" id="chord-diag-body"></div>' +
        '<footer class="chord-diag-footer">' +
          '<span class="chord-diag-status" id="chord-diag-status"></span>' +
          '<button type="button" class="chord-diag-btn-secondary" data-action="close">Cerrar</button>' +
          '<button type="button" class="chord-diag-btn-record"    data-action="record">● Grabar</button>' +
          '<button type="button" class="chord-diag-btn-primary"   data-action="copy">Copiar JSON</button>' +
        '</footer>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      var action = actionEl.getAttribute('data-action');
      if (action === 'close')          closeDiagOverlay();
      else if (action === 'copy')      copyToClipboard(overlay._diagText);
      else if (action === 'record')    startRecording();
      else if (action === 'toggle-row') toggleSnapshotRow(actionEl);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains(DIAG_OVERLAY_OPEN)) {
        closeDiagOverlay();
      }
    });

    return overlay;
  }

  function openDiagOverlay(originBlock) {
    var overlay = buildOverlay();
    overlay._diagOriginBlk = originBlock;

    // Si hay grabación finalizada, mostrar timeline. Si no, snapshot único.
    if (!recState.active && recState.snapshots.length > 0) {
      renderTimeline(overlay);
    } else {
      var data    = collectDiagnostic(originBlock);
      var pretty  = JSON.stringify(data, null, 2);
      var body    = overlay.querySelector('#chord-diag-body');
      var status  = overlay.querySelector('#chord-diag-status');
      body.innerHTML = '<pre class="chord-diag-pre">' + escapeHtml(pretty) + '</pre>';
      if (status) status.textContent = '';
      overlay._diagText = pretty;
    }

    // r13: asegurar que el overlay vive dentro del fullscreen element
    // (si lo hay) para que sea visible. Si no, va al body.
    placeInHost(overlay);

    overlay.classList.add(DIAG_OVERLAY_OPEN);
  }

  function closeDiagOverlay() {
    var overlay = document.getElementById(DIAG_OVERLAY_ID);
    if (overlay) overlay.classList.remove(DIAG_OVERLAY_OPEN);
  }

  // ────────────────────────────────────────────────────────────
  // GRABACIÓN
  // ────────────────────────────────────────────────────────────
  function captureSnapshot(label, originBlock) {
    if (!recState.active) return;
    if (recState.snapshots.length >= MAX_RECORDED_SNAPSHOTS) return;

    var data = collectDiagnostic(originBlock);
    var t    = Date.now() - recState.startTime;
    recState.snapshots.push({ tRel: t, label: label, data: data });
    updateRecorderBadge();
  }

  function startRecording() {
    var overlay = document.getElementById(DIAG_OVERLAY_ID);
    var origin  = overlay ? overlay._diagOriginBlk : null;

    recState.active    = true;
    recState.startTime = Date.now();
    recState.snapshots = [];
    recState.cleanups  = [];

    captureSnapshot('start', origin);
    attachRecordingListeners(origin);
    closeDiagOverlay();
    showRecorderBadge();
  }

  function stopRecording() {
    if (!recState.active) return;

    var origin = (document.getElementById(DIAG_OVERLAY_ID) || {})._diagOriginBlk || null;
    captureSnapshot('stop', origin);

    recState.active = false;
    recState.cleanups.forEach(function (fn) { try { fn(); } catch (e) {} });
    recState.cleanups = [];

    hideRecorderBadge();

    var overlay = buildOverlay();
    overlay._diagOriginBlk = origin;
    renderTimeline(overlay);
    placeInHost(overlay); // r13: asegurar host correcto antes de mostrar
    overlay.classList.add(DIAG_OVERLAY_OPEN);
  }

  function attachRecordingListeners(originBlock) {
    var block = (originBlock && originBlock.classList && originBlock.classList.contains('chords-block'))
      ? originBlock
      : document.querySelector('.chords-block.fullscreen');

    // 1. Window resize (viewport)
    var vTimer = null;
    function onWindowResize() {
      if (vTimer) clearTimeout(vTimer);
      vTimer = setTimeout(function () { captureSnapshot('viewport', block); }, VIEWPORT_DEBOUNCE_MS);
    }
    window.addEventListener('resize', onWindowResize);
    recState.cleanups.push(function () {
      window.removeEventListener('resize', onWindowResize);
      if (vTimer) clearTimeout(vTimer);
    });

    // 2. Orientation change
    function onOrient() { captureSnapshot('orient', block); }
    window.addEventListener('orientationchange', onOrient);
    recState.cleanups.push(function () {
      window.removeEventListener('orientationchange', onOrient);
    });

    // 3. ResizeObserver del block (resize del contenedor real)
    if (block && typeof ResizeObserver !== 'undefined') {
      var rTimer = null;
      var ro = new ResizeObserver(function () {
        if (rTimer) clearTimeout(rTimer);
        rTimer = setTimeout(function () { captureSnapshot('resize', block); }, RESIZE_DEBOUNCE_MS);
      });
      ro.observe(block);
      recState.cleanups.push(function () {
        try { ro.disconnect(); } catch (e) {}
        if (rTimer) clearTimeout(rTimer);
      });
    }

    // 4. Scroll del block (throttled)
    if (block) {
      var lastScrollAt = 0;
      function onScroll() {
        var now = Date.now();
        if (now - lastScrollAt < SCROLL_THROTTLE_MS) return;
        lastScrollAt = now;
        captureSnapshot('scroll', block);
      }
      block.addEventListener('scroll', onScroll, { passive: true });
      recState.cleanups.push(function () {
        block.removeEventListener('scroll', onScroll);
      });
    }

    // 5. Pinch — observar cambios en --cf-fs del wrapper.
    // El módulo 12 setea esa CSS variable durante el pinch. Usamos
    // MutationObserver con debounce para capturar el estado tras pinch,
    // no en cada frame intermedio.
    var wrapper = block ? block.querySelector('.chord-fit-wrapper') : null;
    if (wrapper && typeof MutationObserver !== 'undefined') {
      var pTimer = null;
      var lastFs = wrapper.style.getPropertyValue('--cf-fs');
      var mo = new MutationObserver(function () {
        var nowFs = wrapper.style.getPropertyValue('--cf-fs');
        if (nowFs === lastFs) return;
        lastFs = nowFs;
        if (pTimer) clearTimeout(pTimer);
        pTimer = setTimeout(function () { captureSnapshot('pinch', block); }, PINCH_DEBOUNCE_MS);
      });
      mo.observe(wrapper, { attributes: true, attributeFilter: ['style'] });
      recState.cleanups.push(function () {
        try { mo.disconnect(); } catch (e) {}
        if (pTimer) clearTimeout(pTimer);
      });
    }
  }

  // ────────────────────────────────────────────────────────────
  // INDICADOR FLOTANTE "● REC"
  // ────────────────────────────────────────────────────────────
  function showRecorderBadge() {
    var badge = document.getElementById(DIAG_REC_ID);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = DIAG_REC_ID;
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      badge.innerHTML =
        '<span class="cdr-dot"></span>' +
        '<span class="cdr-label">REC</span>' +
        '<span class="cdr-count" id="cdr-count">0</span>' +
        '<button type="button" class="cdr-btn cdr-snap" data-rec-action="snap">Snap</button>' +
        '<button type="button" class="cdr-btn cdr-stop" data-rec-action="stop">Stop</button>';

      badge.addEventListener('click', function (e) {
        var actEl = e.target.closest('[data-rec-action]');
        if (!actEl) return;
        var act = actEl.getAttribute('data-rec-action');
        if (act === 'snap') {
          var origin = (document.getElementById(DIAG_OVERLAY_ID) || {})._diagOriginBlk || null;
          captureSnapshot('manual', origin);
        } else if (act === 'stop') {
          stopRecording();
        }
      });

      document.body.appendChild(badge);
    }
    // r13: asegurar que el badge vive dentro del fullscreen element
    // (si lo hay) para que sea visible durante el fullscreen API mode.
    placeInHost(badge);
    badge.classList.add('cdr-visible');
    updateRecorderBadge();
  }

  function hideRecorderBadge() {
    var badge = document.getElementById(DIAG_REC_ID);
    if (badge) badge.classList.remove('cdr-visible');
  }

  function updateRecorderBadge() {
    var countEl = document.getElementById('cdr-count');
    if (countEl) countEl.textContent = String(recState.snapshots.length);
  }

  // ────────────────────────────────────────────────────────────
  // TIMELINE
  // ────────────────────────────────────────────────────────────
  // Campos que se muestran en el diff entre snapshots consecutivos.
  // r15: agregados campos de pager + paginación para detectar cambios
  // del nuevo paradigma r14 (totalPages, currentPage, scroll horizontal).
  var DIFF_KEYS = [
    'cssCols', 'cssFs', 'cssColumnFill',
    'wrapper_W', 'wrapper_H', 'wrapper_scrollH', 'wrapper_scrollW',
    'blockClientH', 'blockScrollH', 'blockScrollTop', 'blockDisplay',
    'viewportW', 'viewportH', 'orientation',
    'excede_altura_block', 'excede_ancho',
    // r15: pager (paradigma de paginación)
    'pager_existe', 'pager_W', 'pager_scrollW', 'pager_scrollLeft',
    'pager_overflowX', 'pager_scrollSnapType',
    // r15: paginación visible al usuario
    'indicator_visible', 'indicator_text',
    'hint_left_visible', 'hint_right_visible'
  ];

  function renderTimeline(overlay) {
    var body   = overlay.querySelector('#chord-diag-body');
    var status = overlay.querySelector('#chord-diag-status');

    if (!recState.snapshots.length) {
      body.innerHTML = '<pre class="chord-diag-pre">Sin snapshots grabados.</pre>';
      overlay._diagText = '';
      return;
    }

    var html = '<div class="chord-diag-timeline">';
    var prev = null;
    recState.snapshots.forEach(function (snap, idx) {
      var changes = prev ? diffSnapshots(prev.data, snap.data) : [];
      html += renderSnapshotRow(idx, snap, changes);
      prev = snap;
    });
    html += '</div>';

    body.innerHTML = html;
    overlay._diagText = serializeRecording();

    if (status) {
      var lastT = recState.snapshots[recState.snapshots.length - 1].tRel;
      status.textContent = recState.snapshots.length + ' snapshots · '
        + (lastT / 1000).toFixed(1) + 's';
    }
  }

  function renderSnapshotRow(idx, snap, changes) {
    var data = snap.data || {};
    var tStr = formatRelTime(snap.tRel);
    var lbl  = (snap.label || '').toUpperCase();

    var summary =
      'cols=' + (data.cssCols   || '?') +
      ' fs='  + (data.cssFs     || '?') +
      ' wW='  + (data.wrapper_W || '?') +
      ' wH='  + (data.wrapper_H || '?');

    var changesHtml = '';
    if (changes.length) {
      changesHtml = '<ul class="cdr-changes">' +
        changes.map(function (c) {
          return '<li><span class="cdr-key">' + escapeHtml(c.key) + ':</span> ' +
                 '<span class="cdr-old">' + escapeHtml(String(c.from)) + '</span> → ' +
                 '<span class="cdr-new">' + escapeHtml(String(c.to))   + '</span></li>';
        }).join('') +
        '</ul>';
    }

    var jsonPretty = JSON.stringify(data, null, 2);

    return (
      '<div class="cdr-row" data-idx="' + idx + '">' +
        '<button type="button" class="cdr-row-toggle" data-action="toggle-row">' +
          '<span class="cdr-time">' + tStr + '</span>' +
          '<span class="cdr-label-tag cdr-label-' + escapeHtml(snap.label) + '">' + escapeHtml(lbl) + '</span>' +
          '<span class="cdr-summary">' + escapeHtml(summary) + '</span>' +
        '</button>' +
        changesHtml +
        '<pre class="cdr-json" hidden>' + escapeHtml(jsonPretty) + '</pre>' +
      '</div>'
    );
  }

  function toggleSnapshotRow(toggleBtn) {
    var row  = toggleBtn.closest('.cdr-row');
    if (!row) return;
    var pre  = row.querySelector('.cdr-json');
    if (!pre) return;
    var open = !pre.hasAttribute('hidden');
    if (open) pre.setAttribute('hidden', '');
    else      pre.removeAttribute('hidden');
    row.classList.toggle('cdr-row--open', !open);
  }

  function diffSnapshots(a, b) {
    var changes = [];
    DIFF_KEYS.forEach(function (k) {
      var va = a[k], vb = b[k];
      if (typeof va === 'undefined' && typeof vb === 'undefined') return;
      if (va !== vb) changes.push({ key: k, from: va, to: vb });
    });
    return changes;
  }

  function serializeRecording() {
    var out = {
      version: 'v3.2.46r19',
      type:    'recording',
      duration_ms: recState.snapshots.length
        ? recState.snapshots[recState.snapshots.length - 1].tRel
        : 0,
      snapshots_count: recState.snapshots.length,
      snapshots: recState.snapshots.map(function (s) {
        return { tRel_ms: s.tRel, label: s.label, data: s.data };
      })
    };
    return JSON.stringify(out, null, 2);
  }

  // ────────────────────────────────────────────────────────────
  // UTILIDADES
  // ────────────────────────────────────────────────────────────
  function formatRelTime(ms) {
    if (ms < 1000) return '+' + ms + 'ms';
    return '+' + (ms / 1000).toFixed(2) + 's';
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ────────────────────────────────────────────────────────────
  // PORTAPAPELES (con fallback)
  // ────────────────────────────────────────────────────────────
  function copyToClipboard(text) {
    var overlay = document.getElementById(DIAG_OVERLAY_ID);
    var status  = overlay ? overlay.querySelector('#chord-diag-status') : null;
    var payload = text || (overlay && overlay._diagText) || '';

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

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(payload).then(ok).catch(function (err) {
        legacyCopy(payload) ? ok() : fail(err);
      });
      return;
    }
    legacyCopy(payload) ? ok() : fail();
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
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
