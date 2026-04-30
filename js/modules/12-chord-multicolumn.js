/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/12-chord-multicolumn.js
 *   @brief      Layout multi-columna de acordes en fullscreen (estilo Word)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r2
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   12-chord-multicolumn.js
   ============================================================================
   Layout multi-columna en fullscreen de acordes

   Pagina los acordes en columnas estilo Word para mejor lectura. Re-cálculo en resize.

   ORDEN DE CARGA: posición 12 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── MULTI-COLUMN CHORD LAYOUT ────────────────────────
// Modo "páginas de Word": cada página llena N columnas de arriba hacia abajo.
// El usuario solo hace scroll vertical para ver páginas adicionales.
// column-fill: auto — col 1 llena primero, luego col 2, etc.
(function() {
  var MIN_COLS  = 2;
  var COL_PAD   = 8;
  var COL_GAP   = 24;
  var TOOLBAR_H = 70;
  var DEBOUNCE  = 200;
  var PAGE_FILL = 0.90; // usar 90% de la capacidad por página (buffer anti-clip)

  // ── Mide ancho real del <pre> ──
  function measurePreWidth(pre) {
    var cs = window.getComputedStyle(pre);
    var clone = pre.cloneNode(true);
    clone.classList.remove('mc-hidden');
    clone.style.cssText = [
      'position:fixed','top:0','left:0','opacity:0','pointer-events:none',
      'white-space:pre','max-width:none','width:auto','overflow:visible','z-index:-1',
      'font-family:'+cs.fontFamily,'font-size:'+cs.fontSize,
      'line-height:'+cs.lineHeight,'letter-spacing:'+cs.letterSpacing,'tab-size:4'
    ].join(';');
    document.body.appendChild(clone);
    var w = clone.scrollWidth;
    document.body.removeChild(clone);
    return w;
  }

  // ── Mide alturas individuales de cada sección ──
  // Necesario para distribuir secciones en páginas sin cortar bloques.
  function measureSectionHeights(sections, colW, zoomFsEm) {
    var temp = document.createElement('div');
    temp.style.cssText = [
      'position:fixed','top:0','left:0','opacity:0','pointer-events:none',
      'width:'+colW+'px','z-index:-1'
    ].join(';');
    if (zoomFsEm) temp.style.fontSize = zoomFsEm;

    var divs = sections.map(function(html) {
      var d = document.createElement('div');
      d.className = 'chord-section';
      var p = document.createElement('pre');
      p.innerHTML = html;
      d.appendChild(p);
      temp.appendChild(d);
      return d;
    });

    document.body.appendChild(temp);
    var heights = divs.map(function(d) { return d.scrollHeight || 20; });
    document.body.removeChild(temp);
    return heights;
  }

  // ── Divide secciones en páginas ──
  // Cada página tiene capacidad = colCount × availH × PAGE_FILL.
  // Las secciones nunca se parten — van completas a la misma página.
  function paginateSections(sections, heights, colCount, availH) {
    var capacity = colCount * availH * PAGE_FILL;
    var pages = [];
    var cur = { secs: [], h: 0 };

    sections.forEach(function(sec, i) {
      var h = heights[i];
      // Si una sección es más grande que toda la capacidad, va sola en su página
      if (cur.h + h > capacity && cur.secs.length > 0) {
        pages.push(cur.secs);
        cur = { secs: [sec], h: h };
      } else {
        cur.secs.push(sec);
        cur.h += h;
      }
    });
    if (cur.secs.length > 0) pages.push(cur.secs);
    return pages;
  }

  // ── Construye el wrapper paginado ──
  // Genera un div.chords-pages-container con un div.chords-multicolumn por página.
  // Cada página tiene height fija = availH con column-fill: auto.
  function buildPagedWrapper(pages, colCount, availH, zoomFsEm) {
    var container = document.createElement('div');
    container.className = 'chords-pages-container';

    pages.forEach(function(pageSections) {
      var page = document.createElement('div');
      page.className = 'chords-multicolumn';
      page.style.columnCount = colCount;
      page.style.height = availH + 'px';
      if (zoomFsEm) page.style.fontSize = zoomFsEm;

      pageSections.forEach(function(html) {
        var d = document.createElement('div');
        d.className = 'chord-section';
        var p = document.createElement('pre');
        p.innerHTML = html;
        d.appendChild(p);
        page.appendChild(d);
      });

      container.appendChild(page);
    });

    return container;
  }

  function splitSections(html) {
    return html.split(/\n[ \t]*\n/).filter(function(s) { return s.trim(); });
  }

  // ── Toggle button ──
  function injectToggleBtn(block) {
    var bar = block.querySelector('.transpose-bar');
    if (!bar || bar.querySelector('.mc-toggle-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'mc-toggle-btn fullscreen-btn';
    btn.title = 'Activar/desactivar columnas';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">' +
      '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>Columnas';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      block._mcOff = !block._mcOff;
      btn.style.color       = block._mcOff ? '#888' : '#C8943C';
      btn.style.borderColor = block._mcOff ? 'rgba(136,136,136,0.3)' : 'rgba(200,148,60,0.5)';
      if (block._mcOff) { exitLayout(block); }
      else              { window.enterChordMultiColumn(block); }
    });
    bar.appendChild(btn);
    block._mcToggleBtn = btn;
  }

  function removeToggleBtn(block) {
    if (block._mcToggleBtn && block._mcToggleBtn.parentNode)
      block._mcToggleBtn.parentNode.removeChild(block._mcToggleBtn);
    block._mcToggleBtn = null;
  }

  // ── EXIT VISUAL ──
  function exitLayout(block) {
    if (block._mcWrapper && block._mcWrapper.parentNode) {
      block._mcWrapper.parentNode.removeChild(block._mcWrapper);
      block._mcWrapper = null;
    }
    if (block._mcPre) {
      block._mcPre.classList.remove('mc-hidden');
      if (block._zoomFsEm) block._mcPre.style.fontSize = block._zoomFsEm;
    }
  }

  // ── EXIT COMPLETO ──
  window.exitChordMultiColumn = function(block) {
    if (block._revalTimer) { clearTimeout(block._revalTimer); block._revalTimer = null; }
    if (block._mcRO)       { block._mcRO.disconnect(); block._mcRO = null; }
    exitLayout(block);
    if (block._mcPre) { block._mcPre.style.fontSize = ''; block._mcPre = null; }
    if (block._tapHandler) {
      block.removeEventListener('touchend', block._tapHandler);
      block._tapHandler = null;
    }
    block._mcOff = false; block._zoomFsEm = null;
    removeToggleBtn(block);
  };

  // ── RE-EVALUACIÓN con debounce ──
  function scheduleReeval(block) {
    if (block._mcOff) return;
    if (!block.classList.contains('fullscreen')) return;
    if (block._revalTimer) clearTimeout(block._revalTimer);
    block._revalTimer = setTimeout(function() {
      block._revalTimer = null;
      exitLayout(block);
      window.enterChordMultiColumn(block);
    }, DEBOUNCE);
  }
  window.scheduleChordReeval = scheduleReeval;

  // ── ACTIVAR MULTI-COLUMN ──
  window.enterChordMultiColumn = function(block) {
    if (block._mcWrapper || block._mcOff) return;

    var pre = block._mcPre || block.querySelector('pre:not(.mc-hidden)');
    if (!pre) return;
    pre.classList.remove('mc-hidden');
    if (block._zoomFsEm) pre.style.fontSize = block._zoomFsEm;
    block._mcPre = pre;

    var minColW  = measurePreWidth(pre) + COL_PAD;
    var blockW   = block.clientWidth  || window.innerWidth;
    var blockH   = block.clientHeight || window.innerHeight;
    var availH   = blockH - TOOLBAR_H;
    var sections = splitSections(pre.innerHTML);

    // ¿Caben al menos 2 columnas?
    var colCount = Math.floor((blockW + COL_GAP) / (minColW + COL_GAP));
    if (colCount < MIN_COLS) return;

    // Medir alturas de secciones y paginar
    var heights = measureSectionHeights(sections, minColW, block._zoomFsEm);
    var pages   = paginateSections(sections, heights, colCount, availH);

    // Construir el wrapper paginado
    var wrapper = buildPagedWrapper(pages, colCount, availH, block._zoomFsEm);
    pre.classList.add('mc-hidden');
    block.insertBefore(wrapper, pre);

    block._mcWrapper = wrapper;

    injectToggleBtn(block);

    if (window.ResizeObserver && !block._mcRO) {
      block._mcRO = new ResizeObserver(function() { scheduleReeval(block); });
      block._mcRO.observe(block);
    }

    // ── Triple-tap para pasar de página ──
    // 3 toques rápidos sobre el contenido → scroll al inicio de la siguiente página.
    // En la última página vuelve al principio.
    if (!block._tapHandler) {
      var tapCount = 0, tapTimer = null;
      block._tapHandler = function(e) {
        // Ignorar toques en botones, controles y la barra de transposición
        if (e.target.closest('button, a, .transpose-bar, .fs-zoom-bar')) return;

        tapCount++;
        if (tapTimer) clearTimeout(tapTimer);
        tapTimer = setTimeout(function() { tapCount = 0; }, 450);

        if (tapCount >= 3) {
          tapCount = 0;
          clearTimeout(tapTimer);
          if (!block.classList.contains('fullscreen')) return;

          var pageH   = block.clientHeight - TOOLBAR_H;
          var maxScroll = block.scrollHeight - block.clientHeight;

          if (block.scrollTop + pageH >= maxScroll - 4) {
            // Última página → volver al inicio
            block.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            block.scrollTo({ top: block.scrollTop + pageH, behavior: 'smooth' });
          }
        }
      };
      block.addEventListener('touchend', block._tapHandler);
    }
  };

})();
