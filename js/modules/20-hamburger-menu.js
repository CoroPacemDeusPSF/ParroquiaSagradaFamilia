/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/20-hamburger-menu.js
 *   @brief      Menú hamburguesa móvil
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.33
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   20-hamburger-menu.js
   ============================================================================
   Menú hamburguesa móvil

   openMenu/closeMenu del overlay de navegación en móvil.

   ORDEN DE CARGA: posición 20 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── HAMBURGER MENU ──
(function() {
  var btn     = document.getElementById('pd-hamburger');
  var overlay = document.getElementById('pd-nav-overlay');
  var closeBtn = document.getElementById('pd-nav-close');

  if (!btn || !overlay || !closeBtn) return;

  function openMenu() {
    btn.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    btn.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeMenu();
  });
})();
