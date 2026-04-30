/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/25-event-delegation.js
 *   @brief      Sistema centralizado de event delegation (data-action, data-keydown)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r5
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   25-event-delegation.js
   ============================================================================
   Sistema centralizado de listeners delegados para reemplazar TODOS los
   atributos onclick="..." inline del HTML.

   FILOSOFÍA:
     • Un solo listener de click a nivel del document
     • Cada elemento interactivo lleva un atributo data-action="..."
     • Datos adicionales se pasan via data-target="..." u otros data-*
     • La lógica de cada acción está aislada en su propio handler

   VENTAJAS sobre onclick inline:
     • XSS-safe: no hay strings ejecutados como JavaScript
     • CSP-friendly: permite Content-Security-Policy estricto sin 'unsafe-inline'
     • Mantenible: un solo lugar para encontrar TODOS los handlers
     • Funciona con elementos generados dinámicamente (no hace falta re-bindear)
     • Debug: un solo breakpoint cubre todos los clicks

   ORDEN DE CARGA: posición 25 de 25 (último, después de todos los módulos
   que definen las funciones globales que aquí invocamos).
   ============================================================================ */

(function () {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────
  // ACTION HANDLERS
  // Cada clave es un valor de data-action; cada valor es la función que
  // se ejecuta cuando se hace click en un elemento con ese data-action.
  // El handler recibe (element, event) — element ya es el closest match.
  // ───────────────────────────────────────────────────────────────────────

  const HANDLERS = {

    // ══ Cancionero ══════════════════════════════════════════════════════

    /**
     * Abre el bloque de acordes de un canto y hace scroll hasta él.
     * Reemplaza: onclick="toggleChords('dXX',true);setTimeout(...);return false;"
     * Requiere: data-target="dXX" (el ID del canto).
     */
    'open-chords': (el, event) => {
      event.preventDefault();
      const did = el.dataset.target;
      if (!did) return;
      if (typeof window.toggleChords !== 'function') return;
      window.toggleChords(did, true);
      // Scroll suave después de la apertura para evitar saltos abruptos
      setTimeout(() => {
        const block = document.getElementById('chords-block-' + did);
        if (block) block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    },


    /**
     * Abre/cierra el bloque de acordes (sin scroll automático).
     * Reemplaza: onclick="toggleChords('dXX')"
     * Diferente de 'open-chords' (que también scrollea hasta el bloque).
     * Requiere: data-target="dXX".
     */
    'toggle-chords': (el) => {
      const did = el.dataset.target;
      if (!did) return;
      if (typeof window.toggleChords === 'function') {
        window.toggleChords(did);
      }
    },

    /**
     * Abre/cierra el bloque de contexto litúrgico de un canto.
     * Reemplaza: onclick="toggleContext('dXX')"
     * Requiere: data-target="dXX".
     */
    'toggle-context': (el) => {
      const did = el.dataset.target;
      if (!did) return;
      if (typeof window.toggleContext === 'function') {
        window.toggleContext(did);
      }
    },

    /**
     * Expande/colapsa todos los bloques de acordes (Modo Dev).
     * Reemplaza: onclick="expandAllChords(this)"
     */
    'expand-all-chords': (el) => {
      if (typeof window.expandAllChords === 'function') {
        window.expandAllChords(el);
      }
    },

    // ══ Compartir ═══════════════════════════════════════════════════════

    /** Despliega el menú "Compartir" en la back-bar. */
    'pd-share': (el) => {
      if (typeof window.pdShare === 'function') window.pdShare(el);
    },

    /** Copia la URL actual al portapapeles y muestra toast. */
    'pd-copy-url': (el) => {
      if (typeof window.pdCopyUrl === 'function') window.pdCopyUrl(el);
    },

    /**
     * Copia el deep link directo a una canción al portapapeles.
     * El elemento debe llevar data-target="dXX" con el did del canto.
     * Reutiliza la función expuesta por el módulo 08-deep-link-songs.js.
     */
    'share-song': (el) => {
      const did = el.getAttribute('data-target');
      if (typeof window.pdCopySongLink === 'function') {
        window.pdCopySongLink(did);
      }
    },

    /**
     * Agrega una canción al SetList desde el botón "+" del título.
     * El elemento debe llevar data-target="cpd-XXX" con el id del canto.
     * Invoca window.SL.addSong() que abre el diálogo de selección de slot.
     */
    'add-to-setlist': (el) => {
      const cpd = el.getAttribute('data-target');
      if (window.SL && typeof window.SL.addSong === 'function') {
        window.SL.addSong(cpd);
      }
    },

    // ══ Búsqueda ════════════════════════════════════════════════════════

    /** Abre/cierra el modal de búsqueda. */
    'search-toggle': () => {
      if (window.PDSearch && typeof window.PDSearch.toggle === 'function') {
        window.PDSearch.toggle();
      }
    },

    /** Cierra el modal de búsqueda. */
    'search-close': () => {
      if (window.PDSearch && typeof window.PDSearch.close === 'function') {
        window.PDSearch.close();
      }
    },

    // ══ Navegación móvil (hamburguesa) ══════════════════════════════════

    /**
     * Cierra el overlay de navegación móvil.
     * Reemplaza un onclick que hacía 3 operaciones DOM seguidas.
     */
    'nav-close': () => {
      const overlay = document.getElementById('pd-nav-overlay');
      const hamburger = document.getElementById('pd-hamburger');
      if (overlay) overlay.classList.remove('open');
      if (hamburger) hamburger.classList.remove('open');
      document.body.style.overflow = '';
    },

    // ══ SetList (panel del próximo domingo) ═════════════════════════════

    /** Toggle del panel SetList. */
    'sl-toggle': () => {
      if (window.SL && typeof window.SL.toggle === 'function') window.SL.toggle();
    },

    /** Pin/unpin del panel para mantenerlo abierto. */
    'sl-toggle-pin': () => {
      if (window.SL && typeof window.SL.togglePin === 'function') window.SL.togglePin();
    },

    /** Limpia todos los slots del setlist. */
    'sl-clear-all': () => {
      if (window.SL && typeof window.SL.clearAll === 'function') window.SL.clearAll();
    },

    /** Abre el diálogo "Imprimir SetList" con opciones Con/Sin Acordes. */
    'sl-print': () => {
      if (window.PdSetlistPrint && typeof window.PdSetlistPrint.open === 'function') {
        window.PdSetlistPrint.open();
      }
    },

    /** Imprime el SetList incluyendo bloques de acordes en cada canto. */
    'sl-print-with-chords': () => {
      if (window.PdSetlistPrint && typeof window.PdSetlistPrint.printWithChords === 'function') {
        window.PdSetlistPrint.printWithChords();
      }
    },

    /** Imprime el SetList solo con letras (sin acordes). */
    'sl-print-no-chords': () => {
      if (window.PdSetlistPrint && typeof window.PdSetlistPrint.printNoChords === 'function') {
        window.PdSetlistPrint.printNoChords();
      }
    },

    /** Cancela el diálogo de impresión. */
    'sl-print-cancel': () => {
      if (window.PdSetlistPrint && typeof window.PdSetlistPrint.close === 'function') {
        window.PdSetlistPrint.close();
      }
    },

    /** Cierra el diálogo "Add to Setlist". */
    'sl-close-dialog': () => {
      if (window.SL && typeof window.SL.closeDialog === 'function') window.SL.closeDialog();
    },

    /**
     * Click en el overlay del SetList — cierra solo si no está pinned.
     * Reemplaza: onclick="if (window.SL && !window.SL.isPinned()) window.SL.close();"
     */
    'sl-overlay-click': () => {
      if (window.SL && !window.SL.isPinned()) window.SL.close();
    },

    // ══ Asistente AI ═════════════════════════════════════════════════════

    /** Abre/cierra el panel del asistente AI. */
    'ai-panel-toggle': () => {
      if (typeof window.toggleAIPanel === 'function') window.toggleAIPanel();
    },

    /**
     * Click en una sugerencia del AI — usa el textContent del botón.
     * Reemplaza: onclick="aiSuggest(this.textContent)"
     */
    'ai-suggest': (el) => {
      if (typeof window.aiSuggest === 'function') {
        window.aiSuggest(el.textContent);
      }
    },

    /** Envía el mensaje del input del AI. */
    'ai-send': () => {
      if (typeof window.aiSend === 'function') window.aiSend();
    },
  };

  // ───────────────────────────────────────────────────────────────────────
  // KEYBOARD HANDLERS
  // Para reemplazar onkeydown="..." inline.
  // ───────────────────────────────────────────────────────────────────────

  const KEYDOWN_HANDLERS = {

    /**
     * En el textarea del AI: Enter envía, Shift+Enter es nueva línea.
     * Reemplaza: onkeydown="if(event.key==='Enter'&&!event.shiftKey){...}"
     */
    'ai-input-submit': (el, event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (typeof window.aiSend === 'function') window.aiSend();
      }
    },
  };

  // ───────────────────────────────────────────────────────────────────────
  // DELEGACIÓN GLOBAL
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Listener único de click. Busca el ancestor más cercano con data-action
   * y dispara el handler correspondiente. Si no existe handler, no hace nada
   * (permite coexistir con otros click listeners del proyecto).
   */
  document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    const handler = HANDLERS[action];
    if (handler) {
      handler(trigger, event);
    }
  });

  /**
   * Listener único de keydown delegado para inputs/textareas.
   * Solo dispara si hay un data-keydown="..." en el elemento.
   */
  document.addEventListener('keydown', function (event) {
    const target = event.target;
    if (!target || !target.dataset || !target.dataset.keydown) return;
    const handler = KEYDOWN_HANDLERS[target.dataset.keydown];
    if (handler) {
      handler(target, event);
    }
  });

})();
