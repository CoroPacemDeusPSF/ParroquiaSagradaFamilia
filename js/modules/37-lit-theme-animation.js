/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/37-lit-theme-animation.js
 *   @brief      Anima el tema del Evangelio: las letras caen del cielo una tras otra
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r22
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   37-lit-theme-animation.js
   ============================================================================
   La frase del Evangelio (.lit-theme) es lo que cambia cada semana, así que es
   lo que merece la atención al entrar. Se parte en letras y cada una cae desde
   arriba, escalonada, hasta componer la frase.

   ── DECISIONES QUE NO SON OBVIAS ──────────────────────────────────────────

   1. SE PARTE POR PALABRAS, NO SOLO POR LETRAS.
      Cada letra necesita ser inline-block para poder moverse, y un inline-block
      se comporta como una unidad de línea: partiendo solo por letras, el
      navegador cortaría las palabras por la mitad al final de cada renglón.
      Por eso cada palabra va envuelta en un contenedor inline-block con
      white-space:nowrap, y dentro van las letras. El índice del escalonado sí
      es continuo entre palabras, para que la caída se lea como una sola.

   2. ACCESIBILIDAD: el texto partido en nodos rompe los lectores de pantalla,
      que lo deletrean letra por letra. Se resuelve poniendo aria-label con la
      frase completa en el contenedor y aria-hidden en todo lo de dentro.
      El texto sigue siendo HTML real, seleccionable y buscable.

   3. prefers-reduced-motion: NI SIQUIERA SE PARTE EL DOM. Con esa preferencia
      activa la frase se queda tal cual estaba. Congelar la animación después
      de haber troceado el texto deja los mismos problemas de lectura sin
      ninguna de las ventajas.

   4. SE ESPERA A QUE LA TARJETA EXISTA. El módulo 21 pinta la lit-card, y en
      las fechas fuera del calendario local lo hace de forma asíncrona tras
      consultar a Gemini. Un MutationObserver cubre los dos caminos sin
      acoplarse a los tiempos del 21.

   5. TOPE DE LONGITUD. Animar carácter a carácter solo se sostiene en frases
      cortas; los temas del Evangelio rondan los 45 caracteres. Por encima de
      MAX_CHARS no se anima, para no llenar el DOM de nodos.

   ORDEN DE CARGA: después del módulo 21.
   ============================================================================ */

(function () {
  'use strict';

  /* Solo informativo: el ritmo real lo fija el CSS de lit-card.css.
     Se mantiene sincronizado a mano para que PdLitTheme.stepMs no mienta. */
  var STEP_MS   = 46;    // separación entre letra y letra
  var MAX_CHARS = 120;   // por encima de esto no se anima

  function prefersReducedMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animate(el) {
    if (!el || el.dataset.ltDone === '1') return;

    var text = el.textContent;
    if (!text || !text.trim()) return;

    el.dataset.ltDone = '1';

    if (prefersReducedMotion() || text.length > MAX_CHARS) return;

    /* La frase completa queda como etiqueta accesible ANTES de trocear. */
    el.setAttribute('aria-label', text.trim());

    var words = text.split(/(\s+)/);   // conserva los espacios como piezas
    var frag  = document.createDocumentFragment();
    var index = 0;

    words.forEach(function (chunk) {
      if (!chunk) return;

      /* Los espacios van como texto plano: envolverlos en inline-block
         impediría que la línea rompa por ahí. */
      if (/^\s+$/.test(chunk)) {
        frag.appendChild(document.createTextNode(chunk));
        return;
      }

      var word = document.createElement('span');
      word.className = 'lt-w';

      for (var i = 0; i < chunk.length; i++) {
        var ch = document.createElement('span');
        ch.className = 'lt-ch';
        ch.style.setProperty('--i', index++);
        ch.textContent = chunk[i];
        word.appendChild(ch);
      }
      frag.appendChild(word);
    });

    el.textContent = '';
    el.appendChild(frag);

    /* Una sola marca en el contenedor en vez de aria-hidden en cada nodo:
       aria-label ya gana sobre el contenido, y así el DOM queda limpio. */
    el.setAttribute('aria-hidden', 'false');
    el.classList.add('lt-split');
  }

  function scan() {
    var el = document.querySelector('#lit-card .lit-theme');
    if (el) animate(el);
    return !!el;
  }

  function init() {
    if (scan()) return;

    var card = document.getElementById('lit-card');
    if (!card) return;

    /* El 21 puede rellenar la tarjeta más tarde (camino de respaldo por red).
       El observador se desconecta en cuanto encuentra la frase. */
    var obs = new MutationObserver(function () {
      if (scan()) obs.disconnect();
    });
    obs.observe(card, { childList: true, subtree: true });

    /* Red de seguridad: si en 15 s no apareció, se deja de observar. */
    setTimeout(function () { obs.disconnect(); }, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PdLitTheme = {
    /* Rejugar la animación desde la consola, para ajustar tiempos sin recargar. */
    replay: function () {
      var el = document.querySelector('#lit-card .lit-theme');
      if (!el) return;
      var label = el.getAttribute('aria-label') || el.textContent;
      el.removeAttribute('data-lt-done');
      el.classList.remove('lt-split');
      el.textContent = label;
      animate(el);
    },
    stepMs: STEP_MS
  };

})();
