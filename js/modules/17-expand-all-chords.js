/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/17-expand-all-chords.js
 *   @brief      Expandir/colapsar todos los bloques de acordes (Modo Dev)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.40r4
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   17-expand-all-chords.js
   ============================================================================
   Expandir/colapsar todos los acordes (Modo Dev)

   Botón 'Exp. Acordes' / 'Col. Acordes' que abre o cierra todos los bloques de acordes.

   ORDEN DE CARGA: posición 17 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── EXPANDIR / COLAPSAR TODOS LOS ACORDES (Dev Mode) ────────────────────────
function expandAllChords(btn) {
  var allBlocks = document.querySelectorAll('.chords-block');
  // Detectar estado actual: si alguno está cerrado, expandir todos; si todos abiertos, colapsar
  var anyClose = Array.prototype.some.call(allBlocks, function(b) {
    return !b.classList.contains('open');
  });

  allBlocks.forEach(function(block) {
    var id = block.id.replace('chords-block-', '');
    if (anyClose) {
      // Abrir: usar toggleChords para respetar injectTransposeBar y decoración
      if (!block.classList.contains('open')) toggleChords(id, true);
    } else {
      // Colapsar
      block.classList.remove('open');
      var tBtn = document.getElementById('chords-toggle-' + id);
      if (tBtn) tBtn.textContent = 'Ver acordes ▾';
    }
  });

  // Actualizar label del botón
  btn.textContent = anyClose ? 'Col. Acordes' : 'Exp. Acordes';
}
