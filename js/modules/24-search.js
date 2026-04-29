/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/24-search.js
 *   @brief      Modal de búsqueda con índice invertido del cancionero
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.35
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   24-search.js
   ============================================================================
   Búsqueda — modal con autocompletado de cantos

   window.PDSearch — abre modal con input, busca en títulos y momentos.

   ORDEN DE CARGA: posición 24 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

/* ═══════════════════════════════════════
   SONG SEARCH — Coro Pacem Deus
   Available in all modes.
═══════════════════════════════════════ */
(function() {
  'use strict';
  var overlay = document.getElementById('pd-search-overlay');
  var input   = document.getElementById('pd-search-input');
  var results = document.getElementById('pd-search-results');
  var isOpen  = false;

  /* ── Build song index (once) ── */
  var songs = [];
  document.querySelectorAll('.song-card').forEach(function(card) {
    var titleEl = card.querySelector('.song-title');
    var title = '';
    if (titleEl) {
      titleEl.childNodes.forEach(function(n) {
        if (n.nodeType === 3) title += n.textContent;
      });
    }
    title = title.trim();
    if (!title) return;

    var momentEl = card.querySelector('.song-moment-label');
    var moment = momentEl ? momentEl.textContent.trim() : '';
    var cpd = card.dataset.chordId || '';

    /* Find anchor before card */
    var anchor = card.previousElementSibling;
    while (anchor && !anchor.id) anchor = anchor.previousElementSibling;
    var anchorId = anchor ? anchor.id : '';

    songs.push({ title: title, moment: moment, cpd: cpd, anchorId: anchorId, card: card });
  });

  /* ── Normalize for search (remove accents) ── */
  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* ── Render results ── */
  function render(query) {
    var q = norm(query);
    var filtered = q ? songs.filter(function(s) {
      return norm(s.title).indexOf(q) !== -1;
    }) : songs;

    var html = '';
    filtered.forEach(function(s) {
      html += '<div style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 1.2rem;' +
        'cursor:pointer;border-bottom:1px solid rgba(120,160,70,0.08);transition:background 0.15s;"' +
        ' onmouseover="this.style.background=\'rgba(200,148,60,0.1)\'"' +
        ' onmouseout="this.style.background=\'none\'"' +
        ' onclick="window.PDSearch.goTo(\'' + s.anchorId + '\',\'' + s.cpd + '\')">' +
        '<span style="font-family:\'Cinzel\',serif;font-size:0.45rem;letter-spacing:0.12em;' +
        'text-transform:uppercase;color:rgba(168,200,120,0.5);width:5rem;flex-shrink:0;">' + s.moment + '<\/span>' +
        '<span style="font-family:\'EB Garamond\',serif;font-size:1rem;color:#E8D8B8;">' + s.title + '<\/span>' +
        '<\/div>';
    });

    if (q && !filtered.length) {
      html = '<div style="text-align:center;padding:2rem;color:rgba(168,200,120,0.4);' +
        'font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:1rem;">' +
        'Sin resultados para \u00ab' + query + '\u00bb<\/div>';
    }
    results.innerHTML = html;
  }

  /* ── Open / Close ── */
  function open() {
    isOpen = true;
    overlay.style.display = 'flex';
    input.value = '';
    render('');
    setTimeout(function() { input.focus(); }, 50);
  }

  function close() {
    isOpen = false;
    overlay.style.display = 'none';
    input.value = '';
  }

  function toggle() { isOpen ? close() : open(); }

  /* ── Go to song ── */
  function goTo(anchorId, cpd) {
    close();
    var target = anchorId ? document.getElementById(anchorId) : null;
    var card = cpd ? document.querySelector('[data-chord-id="' + cpd + '"]') : null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    /* Flash */
    if (card) {
      card.style.transition = 'box-shadow 0.3s';
      card.style.boxShadow = '0 0 0 3px #C8943C, 0 4px 20px rgba(200,148,60,0.4)';
      setTimeout(function() { card.style.boxShadow = ''; }, 1500);
    }
  }

  /* ── Input handler ── */
  input.addEventListener('input', function() { render(input.value); });

  /* ── Keyboard ── */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) close();
  });

  /* ── Public API ── */
  window.PDSearch = { open: open, close: close, toggle: toggle, goTo: goTo };
})();
