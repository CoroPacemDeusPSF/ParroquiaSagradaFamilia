/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/01-analytics-init.js
 *   @brief      Inicialización de Google Analytics (ejecutado en <head>)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.35
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   01-analytics-init.js
   ============================================================================
   Google Analytics — inicialización del dataLayer y gtag()

   Carga vía src=googletagmanager.com (en HTML), este bloque registra el ID.

   ORDEN DE CARGA: posición 1 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XCNZSLLBHQ');
