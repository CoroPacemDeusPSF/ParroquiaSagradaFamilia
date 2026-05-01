/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/08-deep-link-songs.js
 *   @brief      Deep links a cantos específicos (#dXX) y scroll automático
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46
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
  if (hash && /^d\d{2,3}$/.test(hash)) {
    setTimeout(function() {
      var el = document.getElementById(hash);
      if (el) {
        var backBar = document.getElementById('pd-back-bar');
        var offset = backBar ? backBar.offsetHeight + 10 : 10;
        var top = el.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    }, 300);
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
  // Recibe el `did` de la canción (ej. "d114") y copia el deep link al
  // portapapeles. Si el navegador no soporta navigator.clipboard (HTTP no
  // seguro o navegadores antiguos), cae en el fallback con execCommand.
  function copySongLink(did) {
    if (!did) return;
    var url = window.location.origin + window.location.pathname + '#' + did;
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
