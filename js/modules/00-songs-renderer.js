/* ============================================================================
   00-songs-renderer.js
   ============================================================================
   Renderiza dinámicamente las 111 song-cards del cancionero leyendo data/songs.json
   y construyendo el HTML idéntico al que antes estaba hardcodeado en el
   dominical.html.

   ORDEN DE CARGA: posición 0 — DEBE ejecutarse ANTES que cualquier otro módulo,
   porque todos los demás (toggle de acordes, editor, índice dinámico, etc.)
   asumen que las cards ya existen en el DOM.

   ARQUITECTURA:
     • Carga sincronizada vía XMLHttpRequest síncrono al cargar la página.
       Esto garantiza que el DOM esté listo antes que se ejecuten otros scripts.
       (No bloquea la UX porque GitHub Pages sirve JSON con caché HTTP estándar.)
     • Genera el HTML usando templates literales JavaScript.
     • Inserta dentro del contenedor <section id="dominical-songs"> (creado en
       el HTML como placeholder).

   COEXISTENCIA CON FIREBASE:
     • Los acordes y letras del JSON son los valores POR DEFECTO.
     • El módulo 10-chord-editor.js y el 14-lyrics-editor.js sobreescriben
       desde Firebase DESPUÉS de que las cards están en el DOM.
     • El flujo es: JSON → DOM → Firebase override → estado final visible.
   ============================================================================ */

(function () {
  'use strict';

  // ── Configuración ──────────────────────────────────────────────────────
  const SONGS_JSON_URL = '../data/songs.json';
  const CONTAINER_ID   = 'dominical-songs';

  // ── Templates HTML ─────────────────────────────────────────────────────

  /**
   * Genera el HTML de un botón yt-play-btn (icono de acordes o de YouTube).
   * Reproduce exactamente el SVG inline que estaba en el HTML original.
   */
  function renderYtBtn(kind, did, youtubeUrl) {
    if (kind === 'chords') {
      return (
        '<a class="yt-play-btn yt-play-btn--chords"' +
        ' href="#chords-block-' + did + '"' +
        ' data-action="open-chords" data-target="' + did + '"' +
        ' title="Ver acordes">' +
        '<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">' +
        '<line x1="10" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="1.5"/>' +
        '<line x1="10" y1="12" x2="30" y2="12" stroke="currentColor" stroke-width="1.5"/>' +
        '<line x1="10" y1="16" x2="30" y2="16" stroke="currentColor" stroke-width="1.5"/>' +
        '<line x1="10" y1="20" x2="30" y2="20" stroke="currentColor" stroke-width="1.5"/>' +
        '<line x1="10" y1="24" x2="30" y2="24" stroke="currentColor" stroke-width="1.5"/>' +
        '<text x="3" y="27" font-size="24" fill="currentColor" font-family="serif" font-weight="bold">𝄞</text>' +
        '</svg></a>'
      );
    }
    if (kind === 'youtube') {
      return (
        '<a class="yt-play-btn yt-play-btn--youtube"' +
        ' href="' + youtubeUrl + '"' +
        ' target="_blank"' +
        ' title="Ver referencia en YouTube">' +
        '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>' +
        '</svg></a>'
      );
    }
    return '';
  }

  /**
   * Genera el HTML del song-title con sus botones (acordes / YouTube).
   * Solo aparece el botón de acordes si la canción tiene chords_html.
   * Solo aparece el botón YouTube si la canción tiene youtube.
   */
  function renderTitle(song) {
    let html = song.title;
    if (song.chords_html) {
      html += renderYtBtn('chords', song.did, null);
    }
    if (song.youtube) {
      html += renderYtBtn('youtube', song.did, song.youtube);
    }
    return html;
  }

  /**
   * Genera el HTML del bloque de acordes (chords-toggle + chords-block).
   * Solo se incluye si el canto tiene chords_html.
   */
  function renderChordsBlock(song) {
    if (!song.chords_html) return '';
    const did = song.did;
    return (
      '<button class="chords-toggle" id="chords-toggle-' + did + '"' +
      ' data-action="toggle-chords" data-target="' + did + '">Ver acordes &#9662;</button>\n' +
      '        <div class="chords-block" id="chords-block-' + did + '">\n' +
      '          <pre>' + song.chords_html + '</pre>\n' +
      '        </div>\n      '
    );
  }

  /**
   * Genera el HTML completo del bloque de un canto (back-link + card + context-block).
   * Reproduce exactamente la estructura que estaba hardcodeada en dominical.html.
   */
  function renderSong(song) {
    const did = song.did;
    const cpd = song.cpd;
    const dataAdded = song.added ? ' data-added="' + song.added + '"' : '';

    // Body — usar HTML literal del JSON (preserva fidelidad)
    const bodyHtml = song.body_html;

    // Chords block — opcional, según si tiene chords_html
    const chordsBlock = renderChordsBlock(song);

    return (
      '    <a class="back-link" id="' + did + '" href="#dominical-index">Volver al índice</a>\n' +
      '    <div class="song-card" data-chord-id="' + cpd + '"' + dataAdded + '>\n' +
      '      <div class="song-header"><div class="song-header-bar"></div>\n' +
      '        <div class="song-number">00</div>\n' +
      '        <div class="song-header-text">\n' +
      '          <div class="song-moment-label">' + song.moment + '</div>\n' +
      '          <div class="song-title">' + renderTitle(song) + '</div>\n' +
      '        </div>\n' +
      '      </div>\n' +
      '      <div class="song-body">' + bodyHtml +
      (chordsBlock ? '\n        ' + chordsBlock : '') +
      '\n      </div>\n' +
      '    </div>\n' +
      '    <button class="context-toggle" id="context-toggle-' + did + '"' +
      ' data-action="toggle-context" data-target="' + did + '">Ver contexto lit&uacute;rgico &#9662;</button>\n' +
      '    <div class="context-block" id="context-block-' + did + '">\n      ' +
      song.context_html +
      '\n    </div>\n'
    );
  }

  // ── Carga e inyección ──────────────────────────────────────────────────

  /**
   * Carga el JSON de canciones de forma sincronizada.
   * Usar XHR síncrono garantiza que las cards estén en el DOM antes de que
   * otros módulos se ejecuten — sin necesidad de coordinar con DOMContentLoaded.
   */
  function loadSongsSync() {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', SONGS_JSON_URL, false);  // false = synchronous
    try {
      xhr.send(null);
      if (xhr.status === 200 || xhr.status === 0) {
        return JSON.parse(xhr.responseText);
      }
      console.error('[Renderer] Error HTTP cargando songs.json:', xhr.status);
      return null;
    } catch (e) {
      console.error('[Renderer] Excepción cargando songs.json:', e);
      return null;
    }
  }

  // ── Mapeo Moment → ID de section ──────────────────────────────────────
  /**
   * IDs estables que el módulo 23 (SetList) y 15 (build-index) usan para
   * navegar entre secciones del cancionero. Los IDs no incluidos en este
   * mapa caen al fallback 'sec-other'.
   *
   * Los primeros 9 mapeos coinciden con LABEL_TO_SECTION en el módulo 23
   * — modificarlos rompería la navegación del SetList.
   */
  const MOMENT_TO_SECTION_ID = {
    'Entrada':                                  'sec-entrada',
    'Piedad':                                   'sec-piedad',
    'Gloria':                                   'sec-gloria',
    'Aleluya':                                  'sec-aleluya',
    'Aclamación del Evangelio':                 'sec-aclamacion-evangelio',
    'Ofertorio':                                'sec-ofertorio',
    'Santo':                                    'sec-santo',
    'Cordero de Dios':                          'sec-cordero',
    'Comunión':                                 'sec-comunion',
    'Salida':                                   'sec-salida',
    'Exposición del Santísimo':                 'sec-exposicion',
    '✦ Momentos Especiales ✦':                  'sec-momentos',
    'Adoración/Reflexión — Acción de Gracias':  'sec-adoracion-reflexion',
    'Animación':                                'sec-animacion'
  };

  /**
   * Genera el HTML del `<div class="moment-header">` que separa cada sección
   * litúrgica en el cancionero. Estos headers son críticos para:
   *   • La navegación desde el SetList (módulo 23 hace scrollToIndex(sectionId))
   *   • La construcción del índice (módulo 15 mapea section→id desde aquí)
   */
  function renderMomentHeader(moment) {
    const sectionId = MOMENT_TO_SECTION_ID[moment] || 'sec-other';
    return (
      '    <div class="moment-header" id="' + sectionId + '">' +
      '<span class="moment-label">' + moment + '</span>' +
      '</div>\n'
    );
  }

  /** Inyecta todas las cards renderizadas en el contenedor placeholder. */
  function renderAll(songs) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) {
      console.error('[Renderer] No se encontró el contenedor #' + CONTAINER_ID);
      return;
    }
    // Recorrer cantos en orden: insertar moment-header cuando cambia el moment
    const parts = [];
    let lastMoment = null;
    songs.forEach(function (song) {
      if (song.moment !== lastMoment) {
        parts.push(renderMomentHeader(song.moment));
        lastMoment = song.moment;
      }
      parts.push(renderSong(song));
    });
    container.innerHTML = parts.join('\n');

    const sectionCount = parts.filter(function (p) {
      return p.indexOf('moment-header') >= 0;
    }).length;
    console.log('[Renderer] ' + songs.length + ' cantos renderizados desde JSON' +
                ' (' + sectionCount + ' secciones)');
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────
  const songs = loadSongsSync();
  if (songs) {
    renderAll(songs);
  }

})();
