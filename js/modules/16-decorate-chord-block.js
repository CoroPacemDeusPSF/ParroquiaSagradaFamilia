/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/16-decorate-chord-block.js
 *   @brief      Decora bloques de acordes recién renderizados (parsing de spans)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.46
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   16-decorate-chord-block.js
   ============================================================================
   Decoración visual de bloques de acordes

   decorateChordBlock() — agrega clases para títulos, secciones, capo, dinámica.

   ORDEN DE CARGA: posición 16 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── DECORACIÓN DE BLOQUES DE ACORDES ─────────────────────────────────
// Clasifica los <b> dentro de <pre> según su contenido:
//   • Contiene ♫  → clase chord-title  (título de la canción)
//   • Contiene ═  → clase chord-section (encabezado de sección)
// Se llama al abrir un bloque (toggleChords) y al cargar la página.
// ─────────────────────────────────────────────────────────────────────
window.decorateChordBlock = function(block) {
  if (!block) return;
  var pre = block.querySelector('pre');
  if (!pre) return;
  pre.querySelectorAll('b').forEach(function(b) {
    var txt = b.textContent.trim();
    if (txt.indexOf('♫') !== -1) {
      b.classList.add('chord-title');
    } else if (/^\*\s.+\s\*$/.test(txt)) {
      b.classList.add('chord-capo');
      // Quitar los asteriscos del texto visible, conservar solo el contenido
      b.childNodes.forEach(function(node) {
        if (node.nodeType === 3) {
          node.nodeValue = node.nodeValue.replace(/^\*\s*/, '').replace(/\s*\*$/, '');
        }
      });
    } else if (/^#{1,2}\s.+\s#{1,2}$/.test(txt)) {
      b.classList.add('chord-dynamic');
      // Quitar los # o ## del texto visible, conservar solo el contenido
      b.childNodes.forEach(function(node) {
        if (node.nodeType === 3) {
          node.nodeValue = node.nodeValue.replace(/^#{1,2}\s*/, '').replace(/\s*#{1,2}$/, '');
        }
      });
    } else if (txt.indexOf('═') !== -1) {
      b.classList.add('chord-section');
    }
  });
};

// Decorar todos los bloques abiertos al cargar (por si acaso)
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.chords-block.open').forEach(function(block) {
    window.decorateChordBlock(block);
  });
});
