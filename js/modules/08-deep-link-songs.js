/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/08-deep-link-songs.js
 *   @brief      Deep links a cantos específicos (#dXX) y scroll automático
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.9
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   08-deep-link-songs.js
   ============================================================================
   Deep link a canciones específicas

   Maneja URLs con #dXX para hacer scroll automático al canto correspondiente.

   ORDEN DE CARGA: posición 8 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── DEEP LINK TO SONGS ────────────────────────────
(function() {
  var hash = window.location.hash.replace('#', '');
  // Aceptar tanto IDs de 2 dígitos (d01-d99) como de 3 dígitos (d100+).
  // El cancionero superó los 99 cantos cuando se agregó cpd-100, momento en
  // el que la regex anterior /^d\d{2}$/ dejó de matchear los nuevos IDs y
  // los deep links de esos cantos quedaban silenciosamente rotos.
  //
  // v3.6.9: antes se calculaba la posición una sola vez, a los 300 ms, y se
  // hacía un scroll suave hasta ahí. Pero la página sigue creciendo por
  // encima del canto después de ese momento (el índice lateral, módulo 15,
  // mide unos 8.000 px y se arma más tarde; luego fuentes e imágenes), así
  // que el enlace dejaba a la persona miles de píxeles antes del canto, en
  // otro canto. Ahora el canto se vuelve a fijar bajo la barra superior
  // mientras la página se acomoda, hasta que la posición se mantiene quieta
  // un momento, o hasta que la persona toca, desliza o usa el teclado: desde
  // ahí manda ella.
  if (hash && /^d\d{2,3}$/.test(hash)) {
    var MAX_MS = 6000;       // nunca más que esto, aunque algo siga creciendo
    var QUIETO_MS = 800;     // posición estable este tiempo = listo
    var inicio = Date.now();
    var ultimoMovimiento = Date.now();
    var soltado = false;

    // El sitio tiene scroll-behavior: smooth; mientras se fija el canto se
    // anula para que cada corrección sea instantánea y no una animación que
    // la siguiente corrección interrumpe.
    var raiz = document.documentElement;
    var comportamientoPrevio = raiz.style.scrollBehavior;
    raiz.style.scrollBehavior = 'auto';
    var terminar = function() { raiz.style.scrollBehavior = comportamientoPrevio; };

    var soltar = function() { soltado = true; terminar(); };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function(ev) {
      window.addEventListener(ev, soltar, { passive: true, once: true });
    });

    var fijar = function() {
      if (soltado) return;
      var el = document.getElementById(hash);
      if (el) {
        var backBar = document.getElementById('pd-back-bar');
        var offset = backBar ? backBar.offsetHeight + 10 : 10;
        var desvio = el.getBoundingClientRect().top - offset;
        if (Math.abs(desvio) > 2) {
          window.scrollTo(0, window.pageYOffset + desvio);
          ultimoMovimiento = Date.now();
        }
      }
      var ahora = Date.now();
      if (ahora - inicio < MAX_MS && ahora - ultimoMovimiento < QUIETO_MS) {
        setTimeout(fijar, 100);
      } else {
        terminar();
      }
    };
    setTimeout(fijar, 100);
  }

  // ── Toast de confirmación ─────────────────────────────────────────────
  // Único nodo reutilizado por todas las acciones de copia (número de canto,
  // botón de compartir junto al título, etc.).
  var toast = document.createElement('div');
  toast.className = 'link-toast';
  toast.textContent = '\u2713 Link copiado';
  document.body.appendChild(toast);
  var toastTimer;
  function showToast() {
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toast.classList.remove('show'); }, 1800);
  }

  // ── Lógica unificada de compartir canción ─────────────────────────────
  // Recibe el `did` de la canción (ej. "d114") y copia su enlace para
  // compartir al portapapeles. Si el navegador no soporta navigator.clipboard
  // (HTTP no seguro o navegadores antiguos), cae en el fallback con execCommand.
  //
  // v3.6.9: el enlace ya no es dominical.html#d114 sino c/cpd-XXX.html. Con
  // el # la vista previa de WhatsApp salía siempre genérica: lo que va tras el
  // # no llega al servidor y el robot de la vista previa no ejecuta JS, así que
  // todos los cantos eran la misma página. c/cpd-XXX.html tiene sus propias
  // etiquetas og: con el título del canto y lleva a la persona al canto (ver
  // scripts/generar-enlaces-cantos.py). Los enlaces #dXX viejos siguen
  // funcionando. Si no se encuentra el cpd, se copia el enlace de siempre.
  function shareUrlFor(did) {
    var hashUrl = window.location.origin + window.location.pathname + '#' + did;
    var link = document.getElementById(did);
    var card = link && link.nextElementSibling;
    var cpd = card && card.getAttribute('data-chord-id');
    var base = window.location.pathname.match(/^(.*)\/cancioneros\/[^\/]*$/);
    if (!cpd || !/^cpd-\d{3}$/.test(cpd) || !base) return hashUrl;
    return window.location.origin + base[1] + '/c/' + cpd + '.html';
  }

  function copySongLink(did) {
    if (!did) return;
    var url = shareUrlFor(did);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(showToast, function() {
        // Si falla por permisos, usar fallback.
        copySongLinkFallback(url);
      });
    } else {
      copySongLinkFallback(url);
    }
  }
  function copySongLinkFallback(url) {
    var tmp = document.createElement('textarea');
    tmp.value = url;
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    document.body.appendChild(tmp);
    tmp.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    document.body.removeChild(tmp);
    showToast();
  }

  // Exponer para que otros módulos (event-delegation, share-song-btn,
  // etc.) puedan invocar esta lógica sin duplicarla.
  window.pdCopySongLink = copySongLink;

  // ── Hacer que el número de canto siga siendo clickable ────────────────
  // (comportamiento legado; el nuevo botón junto al título es la vía
  // recomendada, pero mantenemos esta para no romper la UX existente).
  document.querySelectorAll('.song-number').forEach(function(numEl) {
    numEl.addEventListener('click', function() {
      var card = numEl.closest('.song-card');
      if (!card) return;
      var backLink = card.previousElementSibling;
      while (backLink && !backLink.id) backLink = backLink.previousElementSibling;
      if (!backLink || !backLink.id) return;
      copySongLink(backLink.id);
    });
  });
})();
