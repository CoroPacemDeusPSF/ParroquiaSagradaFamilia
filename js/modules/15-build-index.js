/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/15-build-index.js
 *   @brief      Construye el índice dinámicamente desde el DOM (agrupa por sección)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r5
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   15-build-index.js
   ============================================================================
   Construcción dinámica del índice alfabético

   buildIndex() — lee el DOM y genera el índice agrupado por momento litúrgico.

   ORDEN DE CARGA: posición 15 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ══════════════════════════════════════════════════════════════════
// buildIndex() — Genera el índice dinámicamente desde el DOM.
// Fuente de verdad: los .song-card en el body.
// También actualiza: song-number en cards, idx-num en índice,
// badge ✦ Nuevo (60 días), contador de cantos por sección.
// ══════════════════════════════════════════════════════════════════
(function() {

  // ── SVGs inline ──────────────────────────────────────────────
  var SVG_SCORES = '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><line x1="10" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="12" x2="30" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="16" x2="30" y2="16" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="20" x2="30" y2="20" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="24" x2="30" y2="24" stroke="currentColor" stroke-width="1.5"/><text x="3" y="27" font-size="24" fill="currentColor" font-family="serif" font-weight="bold">\u{1D11E}</text></svg>';
  var SVG_YT     = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"\/><\/svg>';
  var SVG_SPARK  = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1 L8.9 6.1 L14 7 L8.9 7.9 L8 13 L7.1 7.9 L2 7 L7.1 6.1 Z" fill="#C8943C" stroke="#C8943C" stroke-width="0.5"\/><path d="M13 1 L13.5 3.5 L16 4 L13.5 4.5 L13 7 L12.5 4.5 L10 4 L12.5 3.5 Z" fill="#e8b84b" opacity="0.8"\/><\/svg>';

  // ── buildIndex: función principal ────────────────────────────
  function buildIndex() {
    var ol = document.getElementById('index-list-ol');
    if (!ol) return;

    // 1. Mapa sección → id del moment-header (para los links de sección)
    var sectionMap = {};
    document.querySelectorAll('.moment-header').forEach(function(h) {
      var label = h.querySelector('.moment-label');
      if (label && h.id) {
        sectionMap[label.textContent.trim()] = h.id;
      }
    });

    // 2. Recorrer todas las cards y agrupar por sección (preservando orden DOM)
    var sections    = [];   // orden de aparición
    var sectionData = {};   // sección → array de cards

    document.querySelectorAll('.song-card').forEach(function(card) {
      var momentEl = card.querySelector('.song-moment-label');
      var section  = momentEl ? momentEl.textContent.trim() : '—';
      if (!sectionData[section]) {
        sections.push(section);
        sectionData[section] = [];
      }
      sectionData[section].push(card);
    });

    // 3. Construir el ol vacío con fragment (una sola inserción al DOM)
    var frag    = document.createDocumentFragment();
    var today   = new Date();
    var globalN = 0;

    sections.forEach(function(section) {
      var cards     = sectionData[section];
      var sectionId = sectionMap[section] || '';
      var count     = cards.length;

      // ── Header de sección ──
      var headerLi  = document.createElement('li');
      headerLi.className = 'index-moment-header';
      headerLi.setAttribute('data-section', sectionId); /* para SL.scrollToIndex */
      headerLi.innerHTML =
        '<a class="idx-section-link" href="#' + sectionId + '">' + section + '<\/a>' +
        '<span class="idx-section-count">(' + count + ')<\/span>';
      frag.appendChild(headerLi);

      // ── Entradas de cantos ──
      cards.forEach(function(card) {
        globalN++;

        // Actualizar song-number en la card
        var numEl = card.querySelector('.song-number');
        if (numEl) numEl.textContent = String(globalN).padStart(2, '0');

        // Recuperar el id del ancla (back-link anterior a la card)
        var anchor = card.previousElementSibling;
        while (anchor && !anchor.id) anchor = anchor.previousElementSibling;
        var d = anchor ? anchor.id : '';

        // Título limpio (solo el texto del título, sin SVGs ni botones)
        // Estrategia de extracción en 3 niveles, de más robusto a menos:
        //   1. card.dataset.title (v3.2.42r5+): atributo data-title en la card,
        //      inmune a cambios futuros en la estructura interna del título.
        //   2. .song-title-text span (v3.2.39-v3.2.42r5): título envuelto.
        //   3. Text nodes directos (legacy): título como texto suelto.
        // El triple fallback evita que cambios futuros en el renderer
        // rompan silenciosamente el índice.
        var titleTxt = '';
        if (card.dataset && card.dataset.title) {
          titleTxt = card.dataset.title;
        } else {
          var titleEl = card.querySelector('.song-title');
          if (titleEl) {
            var titleTextEl = titleEl.querySelector('.song-title-text');
            if (titleTextEl) {
              titleTxt = titleTextEl.textContent;
            } else {
              titleEl.childNodes.forEach(function(node) {
                if (node.nodeType === 3) titleTxt += node.textContent;
              });
            }
          }
        }
        titleTxt = titleTxt.trim();

        // Badge ✦ Nuevo (60 días desde data-added)
        var sparkleHtml = '';
        var added = card.dataset.added;
        if (added) {
          var addedDate = new Date(added);
          var diffDays  = (today - addedDate) / 86400000;
          if (diffDays >= 0 && diffDays <= 60) {
            sparkleHtml = '<span class="new-sparkle">' + SVG_SPARK + '<\/span>';
          }
        }

        // Botón de acordes — solo si la card tiene acordes reales
        var hasChords = !!card.querySelector('.chords-block pre .chord');
        var chordBtn = (d && hasChords)
          ? '<a class="yt-play-btn" href="#chords-block-' + d + '"' +
            ' onclick="toggleChords(\'' + d + '\',true);' +
            'setTimeout(function(){document.getElementById(\'chords-block-' + d + '\').scrollIntoView({behavior:\'smooth\',block:\'nearest\'});},100);return false;"' +
            ' title="Ver acordes" style="color:#43A047;">' + SVG_SCORES + '<\/a>'
          : '';

        // Botón YouTube (si la card tiene link de YouTube)
        // Copia las CLASES CSS del botón original — no los inline styles —
        // para preservar los colores por posición (--ref-1 rojo, --ref-2
        // verde, --ref-3 morado) que ahora viven en css/pages/dominical.css.
        // Antes leíamos `el.style.color`, pero como los colores migraron a
        // clases CSS al refactorizar el sistema multi-URL, ese campo siempre
        // quedaba vacío y todos los íconos terminaban heredando el rojo
        // default → de ahí el bug de "3 íconos rojos en el índice".
        var ytEls = titleEl ? titleEl.querySelectorAll('.yt-play-btn[href*="youtu"]') : [];
        var ytBtn = '';
        ytEls.forEach(function (el) {
          var classes = el.className; // mantiene .yt-play-btn--ref-N intactas
          var titleAttr = el.getAttribute('title') || 'Ver referencia en YouTube';
          ytBtn +=
            '<a class="' + classes + '"' +
            ' href="' + el.getAttribute('href') + '"' +
            ' target="_blank"' +
            ' title="' + titleAttr + '">' + SVG_YT + '<\/a>';
        });

        // Construir el <li>
        var li = document.createElement('li');
        var cpdId = card.dataset.chordId || '';
        li.innerHTML =
          '<span class="idx-num">' + String(globalN).padStart(2, '0') + '<\/span>' +
          '<a href="#' + d + '">' + titleTxt + '<\/a>' +
          sparkleHtml + chordBtn + ytBtn +
          '<button class="idx-add-btn" title="Agregar al setlist" onclick="window.SL&&window.SL.addSong(\'' + cpdId + '\')">+<\/button>';
        frag.appendChild(li);
      });
    });

    // 4. Insertar todo de una vez
    ol.innerHTML = '';
    ol.appendChild(frag);

    // 5. Actualizar contador total
    var counterEl = document.getElementById('index-song-counter');
    if (counterEl) {
      counterEl.innerHTML =
        '<span class="counter-number">' + globalN + '<\/span>' +
        '<span class="counter-divider"><\/span>' +
        'cantos en el repertorio' +
        '<span class="counter-divider"><\/span>';
    }
  }

  // ── Ejecutar al cargar el DOM ────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildIndex);
  } else {
    buildIndex();
  }

})();
