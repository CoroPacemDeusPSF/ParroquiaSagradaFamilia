/* ============================================================================
   02-fix-all.js
   ============================================================================
   Bootstrap mínimo — fixes globales aplicados al cargar

   IIFE que ajusta detalles de DOM al inicio (clases, atributos defaults).

   ORDEN DE CARGA: posición 2 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

(function() {
  function fixAll() {
    var bar    = document.getElementById('pd-back-bar');
    var nav    = document.querySelector('.tab-nav');
    var offset = (bar ? bar.offsetHeight : 0) + (nav ? nav.offsetHeight : 0);
    // Position tab-nav below back-bar
    if (bar && nav) nav.style.top = bar.offsetHeight + 'px';
    // Set scroll-margin-top on all anchor targets dynamically
    document.querySelectorAll('[id]').forEach(function(el) {
      el.style.scrollMarginTop = offset + 'px';
    });
  }
  fixAll();
  window.addEventListener('resize', fixAll);
  window.addEventListener('load', fixAll);
})();
