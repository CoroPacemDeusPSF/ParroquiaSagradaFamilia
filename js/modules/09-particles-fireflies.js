/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/09-particles-fireflies.js
 *   @brief      Partículas doradas animadas en el fondo (canvas)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.40r2
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   09-particles-fireflies.js
   ============================================================================
   Canvas de partículas — fireflies dorados sobre fondo verde

   Animación de fondo continua con 45 partículas. Adapta tamaño en resize.

   ORDEN DE CARGA: posición 9 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── DOMINICAL PARTICLES (golden fireflies on dark green) ──
(function() {
  var canvas = document.getElementById('pd-dominical-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function createParticle() {
    var type = Math.random();
    // Mix of warm gold, soft green, and white
    var palette = Math.random();
    var r, g, b;
    if (palette < 0.5) {
      // Warm gold
      r = 200 + Math.floor(Math.random() * 40);
      g = 170 + Math.floor(Math.random() * 50);
      b = 40 + Math.floor(Math.random() * 40);
    } else if (palette < 0.8) {
      // Soft green
      r = 120 + Math.floor(Math.random() * 40);
      g = 180 + Math.floor(Math.random() * 40);
      b = 80 + Math.floor(Math.random() * 30);
    } else {
      // Pale white-green
      r = 200 + Math.floor(Math.random() * 30);
      g = 220 + Math.floor(Math.random() * 20);
      b = 180 + Math.floor(Math.random() * 30);
    }
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: type > 0.9 ? (Math.random() * 15 + 10) : (Math.random() * 2.5 + 0.8),
      isOrb: type > 0.9,
      speedY: -(Math.random() * 0.2 + 0.05),
      speedX: (Math.random() - 0.5) * 0.15,
      phase: Math.random() * Math.PI * 2,
      r: r, g: g, b: b,
      baseOpacity: type > 0.9 ? (Math.random() * 0.08 + 0.03) : (Math.random() * 0.4 + 0.15)
    };
  }

  for (var i = 0; i < 45; i++) particles.push(createParticle());

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.y += p.speedY;
      p.x += p.speedX + Math.sin(p.y * 0.004 + p.phase) * 0.2;
      var pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.0008 + p.phase);
      var opacity = p.baseOpacity * pulse;

      if (p.y < -20) { particles[i] = createParticle(); particles[i].y = canvas.height + 10; continue; }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      if (p.isOrb) {
        var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (opacity) + ')');
        grad.addColorStop(0.4, 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (opacity * 0.3) + ')');
        grad.addColorStop(1, 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',0)');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + opacity + ')';
      }
      ctx.fill();
    }
    requestAnimationFrame(animate);
  }
  animate();
})();
