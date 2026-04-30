/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/03-share-buttons.js
 *   @brief      Lógica de los botones de compartir (WhatsApp, copiar URL, toast)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.40r6
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   03-share-buttons.js
   ============================================================================
   Botones de compartir (back-bar)

   Funciones globales: pdShare(), pdCopyUrl(). Toast de feedback al copiar.

   ORDEN DE CARGA: posición 3 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

(function() {
  var url = window.location.href;
  var title = document.title;

  function pdShare(btn) {
    if (navigator.share) {
      navigator.share({ title: title, url: url });
      return;
    }
    var wrap = btn.closest('.pd-share-wrap');
    var dd = wrap.querySelector('.pd-share-dd');
    wrap.querySelector('.pd-share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + url);
    wrap.querySelector('.pd-share-email').href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(url);
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  }

  function pdCopyUrl(el) {
    navigator.clipboard.writeText(url).then(function() {
      var orig = el.innerHTML;
      el.innerHTML = el.innerHTML.replace('Copiar enlace', '✓ Copiado');
      setTimeout(function() { el.innerHTML = orig; }, 2000);
    });
  }

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.pd-share-wrap')) {
      document.querySelectorAll('.pd-share-dd').forEach(function(d){ d.style.display='none'; });
    }
  });

  window.pdShare = pdShare;
  window.pdCopyUrl = pdCopyUrl;
})();
