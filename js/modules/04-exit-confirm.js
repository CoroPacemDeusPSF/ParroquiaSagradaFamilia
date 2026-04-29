/* ============================================================================
   04-exit-confirm.js
   ============================================================================
   Diálogo de confirmación al salir del Modo Coro

   Maneja el click en el badge de Modo Coro y la confirmación SÍ/Cancelar.

   ORDEN DE CARGA: posición 4 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

(function() {
  function run() {
    var list = document.querySelector('.index-list, .toc-list');
    if (!list) return;
    var firstA = list.querySelector('a');
    if (!firstA) return;

    var el = document.createElement('span');
    el.id = 'pd-finger';
    el.style.cssText = 'display:inline-block;opacity:0;transition:opacity 0.5s;vertical-align:middle;margin-left:0.4rem;font-size:' + (window.innerWidth >= 768 ? '1.4rem' : '0.9rem') + ';animation:pdFB 0.8s ease infinite alternate;';
    el.innerHTML = '&#128070;';

    // Insert directly before the link text
    firstA.appendChild(el);

    // Fade in
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ el.style.opacity = '1'; });
    });

    // Remove after 5 seconds or on any link click
    function bye() {
      el.style.opacity = '0';
      setTimeout(function(){ if(el.parentNode) el.remove(); }, 500);
    }
    setTimeout(bye, 5000);
    list.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', bye, {once:true});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(run, 800); });
  } else {
    setTimeout(run, 800);
  }
})();
