/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/22-effects-emanation.js
 *   @brief      Efecto de emanación de halo en cruces y elementos sagrados
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r3
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   22-effects-emanation.js
   ============================================================================
   EmanationFX — notas musicales sincronizadas con latidos

   Sistema reusable de bursts de notas (♪ ♫ ♩ ♬) emanando del edge tab y del salmo player.

   ORDEN DE CARGA: posición 22 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

/* ═══════════════════════════════════════════════════════════════════════
   EmanationFX — efectos mágicos para elementos interactivos clave:
     • Edge tab: emisión espontánea de notas musicales doradas
     • Salmo button: emisión espontánea de notas verdes + entrada whirlwind
   La card litúrgica (Evangelio) NO emite notas (por elección de diseño:
   solo halo de luz para preservar el carácter sacro). El halo es 100% CSS.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  /* Repertorio de glifos: caracteres unicode (no emojis) renderizados en
     fuente serif/symbol del sistema, monocromáticos y livianos. */
  var GLYPHS = ['\u266A','\u266B','\u2669','\u266C']; // ♪ ♫ ♩ ♬

  /* Si el usuario prefiere movimiento reducido, omitimos por completo
     la emisión de notas (la respiración del halo y el latido se desactivan
     vía CSS @media prefers-reduced-motion). */
  var prm = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (prm.matches) return;

  /* Spawn helper interno: ejecuta inmediatamente o tras un delay */
  function _doSpawn(opts) {
    var n = document.createElement('span');
    n.className = 'fx-note ' + (opts.cls || '');
    n.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    n.style.left = opts.x + 'px';
    n.style.top  = opts.y + 'px';
    /* Variación por nota: deriva horizontal ±15px, vertical -50 a -75px,
       rotación final ±20°. Da el carácter "espontáneo" requerido. */
    n.style.setProperty('--fx-dx',  (Math.random() * 30 - 8) + 'px');
    n.style.setProperty('--fx-dy',  (-50 - Math.random() * 25) + 'px');
    n.style.setProperty('--fx-rot', (Math.random() * 40 - 20) + 'deg');
    opts.parent.appendChild(n);
    setTimeout(function(){
      if (n.parentNode) n.parentNode.removeChild(n);
    }, opts.lifetime || 2800);
  }

  /* ── Spawner público: si opts.delay > 0 difiere la creación.
     Útil para escalonar 2-3 notas saliendo del mismo elemento por pulso. */
  function spawnNote(opts) {
    if (opts.delay) {
      setTimeout(function(){ _doSpawn(opts); }, opts.delay);
    } else {
      _doSpawn(opts);
    }
  }

  /* Emite un "burst" de notas escalonadas desde un elemento.
     count: número de notas (default 2-3 aleatorio)
     stagger: ms entre notas (default 90ms) */
  function spawnBurst(target, cls, count, stagger) {
    count = count || (2 + Math.floor(Math.random() * 2));
    stagger = stagger || 90;
    var rect = target.getBoundingClientRect();
    var isFixed = (cls === 'fx-tab-note'); /* tab usa coordenadas viewport */
    for (var i = 0; i < count; i++) {
      var x, y, parent;
      if (isFixed) {
        parent = document.body;
        x = rect.right + 2;
        y = rect.top + 8 + Math.random() * Math.max(0, rect.height - 16);
      } else {
        parent = target;
        x = 10 + Math.random() * Math.max(20, target.offsetWidth - 20);
        y = 4 + Math.random() * 14;
      }
      spawnNote({ parent: parent, cls: cls, x: x, y: y, delay: i * stagger });
    }
  }

  /* ── Sincronización notas ↔ pulsos ──
     En lugar de usar setInterval (que se desfasaría con respecto a la
     animación CSS), nos enganchamos al evento `animationiteration` que
     dispara EXACTAMENTE al completar cada loop. Como los keyframes están
     diseñados para palpitar al inicio del ciclo (0-16%), las notas que
     emitimos en cada iteration coinciden con el momento visual del pulso. */
  function bindSyncedNotes() {
    var tab = document.getElementById('sl-tab');
    if (tab) {
      tab.addEventListener('animationiteration', function(e) {
        if (e.animationName !== 'sl-tab-heartbeat') return;
        if (!document.body.classList.contains('rehearsal-mode')) return;
        if (tab.classList.contains('sl-tab-hidden')) return;
        spawnBurst(tab, 'fx-tab-note');
      });
    }

    var btn = document.getElementById('lit-psalm-btn');
    if (btn) {
      btn.addEventListener('animationiteration', function(e) {
        if (e.animationName !== 'salmo-bounce') return;
        if (!btn.style.display || btn.style.display === 'none') return;
        spawnBurst(btn, 'fx-salmo-note');
      });
    }
  }

  /* ── Hook de entrada whirlwind para el salmo ──
     Detectamos el cambio inline display:none → flex mediante MutationObserver
     y disparamos la animación añadiendo .fx-visible (con reflow forzado para
     que la animación se reinicie aunque la clase ya estuviera presente). */
  function watchSalmoVisibility() {
    var btn = document.getElementById('lit-psalm-btn');
    if (!btn) return;
    var lastDisplay = btn.style.display;
    function trigger() {
      btn.classList.remove('fx-visible');
      /* Force reflow para reiniciar animación si la clase ya existía */
      void btn.offsetWidth;
      btn.classList.add('fx-visible');
    }
    new MutationObserver(function(){
      var d = btn.style.display;
      if (d !== lastDisplay) {
        lastDisplay = d;
        if (d && d !== 'none') trigger();
      }
    }).observe(btn, { attributes: true, attributeFilter: ['style'] });
    /* Caso defensivo: si por timing el botón ya está visible al cargar el módulo */
    if (btn.style.display && btn.style.display !== 'none') trigger();
  }

  function init() {
    bindSyncedNotes();
    watchSalmoVisibility();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
