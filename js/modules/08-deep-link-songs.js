/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/08-deep-link-songs.js
 *   @brief      Deep links a cantos específicos (#dXX) y scroll automático
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.37
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
  if (hash && /^d\d{2}$/.test(hash)) {
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

  // Toast
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

  // Make song numbers clickable
  document.querySelectorAll('.song-number').forEach(function(numEl) {
    numEl.addEventListener('click', function() {
      var card = numEl.closest('.song-card');
      if (!card) return;
      var backLink = card.previousElementSibling;
      while (backLink && !backLink.id) backLink = backLink.previousElementSibling;
      if (!backLink || !backLink.id) return;
      var url = window.location.origin + window.location.pathname + '#' + backLink.id;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(showToast);
      } else {
        var tmp = document.createElement('textarea');
        tmp.value = url;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
        showToast();
      }
    });
  });
})();
