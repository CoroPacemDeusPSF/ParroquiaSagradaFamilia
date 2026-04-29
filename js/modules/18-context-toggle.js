/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/18-context-toggle.js
 *   @brief      Toggle del bloque de contexto litúrgico de cada canto
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.36
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   18-context-toggle.js
   ============================================================================
   Toggle del bloque de contexto litúrgico

   toggleContext(d) — abre/cierra el bloque de compositor + fundamento + tags.

   ORDEN DE CARGA: posición 18 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

function toggleContext(d){var b=document.getElementById("context-block-"+d),t=document.getElementById("context-toggle-"+d);if(b&&t){var o=b.classList.toggle("open");t.textContent=o?"Ocultar contexto lit\u00FArgico \u25B4":"Ver contexto lit\u00FArgico \u25BE";}}
