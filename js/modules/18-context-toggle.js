/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/18-context-toggle.js
 *   @brief      Toggle del bloque de contexto de cada canto
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.4.1
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   18-context-toggle.js
   ============================================================================
   Toggle del bloque de contexto del canto.

   toggleContext(d) — abre/cierra el bloque de compositor + fundamento + tags.

   v3.4.1: el texto del botón ya no es hardcoded "Ver/Ocultar contexto
   litúrgico". Ahora se lee de los atributos data-open-label y
   data-close-label del propio botón. El módulo 00-songs-renderer.js setea
   estos atributos según el moment del canto:
     - Cantos litúrgicos: "Ver contexto litúrgico" / "Ocultar contexto litúrgico"
     - Cantos del moment "Bodas": "Ver sobre este canto" / "Ocultar"
   Esto permite que cantos no-litúrgicos (nupciales) tengan un label
   apropiado a su carácter pastoral, sin pretender ser análisis litúrgico.

   ORDEN DE CARGA: posición 18 de 24 (orden DOM original).
   ============================================================================ */

function toggleContext(d) {
  var block  = document.getElementById('context-block-'  + d);
  var toggle = document.getElementById('context-toggle-' + d);
  if (!block || !toggle) return;

  // Leer labels desde data-attributes (con fallback a texto litúrgico
  // por si algún canto antiguo no tiene los data-attrs seteados).
  var openLabel  = toggle.getAttribute('data-open-label')  || 'Ver contexto litúrgico';
  var closeLabel = toggle.getAttribute('data-close-label') || 'Ocultar contexto litúrgico';

  var isOpen = block.classList.toggle('open');
  // \u25B4 = ▴ (triángulo arriba, contexto abierto)
  // \u25BE = ▾ (triángulo abajo, contexto cerrado — invitación a abrir)
  toggle.innerHTML = (isOpen ? closeLabel + ' \u25B4' : openLabel + ' \u25BE');
}
