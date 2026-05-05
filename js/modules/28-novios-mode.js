/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/28-novios-mode.js
 *   @brief      Modo Novios: vista limpia para novios — activación vía URL
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.5.5
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   28-novios-mode.js  —  Modo Novios (vista pública limpia para novios)
   ============================================================================
   PROPÓSITO
     Permitir que Renzo comparta el cancionero con los novios de cada boda
     mediante un link especial. Los novios pueden navegar el cancionero,
     escuchar las referencias de YouTube y leer las letras/acordes — pero NO
     ven los controles de coro (setlist dominical, setlist bodas, edición de
     acordes, AI agent, modos de desarrollo, etc.).

   ACTIVACIÓN
     Vía URL params. Ejemplo:
       https://[host]/cancioneros/dominical.html?modo=novios&pin=CPD2026

     Si los parámetros son correctos, body recibe la clase 'novios-mode'
     y todos los controles de Renzo quedan ocultos (manejado por CSS).

     A diferencia de los otros modos (Coro, Bodas, Dev), Modo Novios NO usa
     localStorage 'pdMode'. Es deliberado:
       - Si el novio comparte la URL completa, el modo persiste para el otro.
       - Si el novio abre el sitio sin la URL especial, ve la versión pública
         normal (no el modo novios persistido).
       - Refrescar la página conserva el modo siempre que la URL siga teniendo
         los parámetros.
       - Esto evita el caso patológico donde un novio "se queda en modo novios"
         de manera persistente y no entiende por qué algunas cosas no aparecen.

   MUTUAMENTE EXCLUSIVO CON LOS OTROS MODOS
     Si por algún motivo Modo Novios se activa cuando ya había rehearsal-mode
     o wedding-mode persistidos en localStorage, este módulo limpia esa
     persistencia. Modo Novios NO debe coexistir con modos de Renzo — es para
     los novios, punto.

   BADGE VISIBLE
     Pequeño badge en esquina superior derecha con icono SVG de un anillo y
     label "Modo Novios". No es interactivo (no hace logout — los novios
     salen recargando sin parámetros). Coherente con el estilo visual de los
     otros badges del proyecto, en una paleta neutra dorada.

   SALIDA DEL MODO
     Los novios salen recargando el sitio sin parámetros (decisión simple,
     confirmada con Renzo). Si llegan a la URL pública sin parámetros, ven
     el cancionero normal sin Modo Novios activo.

   ORDEN DE CARGA: posición 28 — antes de 29-wedding-mode y 30-setlist-bodas,
   porque debe activarse PRIMERO para limpiar persistencia de otros modos
   antes de que esos módulos restauren su estado desde localStorage.
   ============================================================================ */

(function() {
  'use strict';

  // ── CONFIGURACIÓN ─────────────────────────────────────────────────────
  // PIN común para todas las bodas. Si en el futuro Renzo quiere PINs por
  // boda, este es el único punto a modificar. (Por ahora un PIN único es
  // más simple de gestionar.)
  var EXPECTED_PIN = 'CPD2026';

  // ── HELPERS ───────────────────────────────────────────────────────────

  /**
   * Lee parámetros de la URL actual. Devuelve {modo, pin} o null si la URL
   * no tiene los parámetros o el navegador no soporta URLSearchParams (caso
   * extremadamente raro, pero defensivo igual).
   */
  function getUrlParams() {
    if (typeof URLSearchParams === 'undefined') return null;
    try {
      var params = new URLSearchParams(window.location.search);
      return {
        modo: params.get('modo'),
        pin:  params.get('pin')
      };
    } catch (e) {
      // Si por alguna razón URLSearchParams falla, fail-safe a null
      return null;
    }
  }

  /**
   * Verifica si la URL actual activa el Modo Novios. Estricto: ambos
   * parámetros deben estar presentes y exactos.
   */
  function shouldActivate() {
    var p = getUrlParams();
    if (!p) return false;
    return p.modo === 'novios' && p.pin === EXPECTED_PIN;
  }

  /**
   * Limpia cualquier persistencia de modos de Renzo (Coro, Bodas, Dev) que
   * pudiera estar en localStorage. Modo Novios es excluyente con los otros.
   * Esto evita el caso donde un novio recibe el link y, por algún motivo
   * (PC compartida, etc.), localStorage trae 'pdMode' previo.
   *
   * IMPORTANTE: este módulo carga en posición 28, DESPUÉS de que los módulos
   * 05 (rehearsal-mode) y 29 (wedding-mode) ya pudieron haber restaurado su
   * estado desde localStorage. Por eso, además de limpiar la persistencia,
   * removemos activamente cualquier clase de modo previo que esté en el body.
   * Es defensivo y garantiza un estado limpio para el novio.
   */
  function clearOtherModesPersistence() {
    try {
      // pdMode es la clave principal usada por módulos 05 (rehearsal-mode)
      // y 29 (wedding-mode) para persistir el modo activo entre sesiones.
      // Eliminarla impide que esos módulos activen sus modos en futuros
      // refresh (aunque en este refresh ya pudieron haber actuado).
      localStorage.removeItem('pdMode');
    } catch (e) {
      // localStorage puede fallar en modo privado de algunos navegadores;
      // no es bloqueante, solo loguear silenciosamente.
    }

    // Revertir activamente cualquier clase de modo previo que ya esté
    // aplicada al body por los módulos anteriores. Esto cubre el caso donde
    // localStorage tenía 'pdMode' al cargar la página y los módulos 05/29
    // ya activaron sus modos antes de que llegáramos aquí.
    var classesToRemove = [
      'rehearsal-mode',  // Modo Coro (módulo 05)
      'wedding-mode',    // Modo Bodas (módulo 29)
      'dev-mode'         // Modo Dev (módulo 11)
    ];
    classesToRemove.forEach(function(cls) {
      document.body.classList.remove(cls);
    });

    // También desactivar visualmente los badges de los otros modos. Los
    // módulos 05 y 29 agregan la clase 'active' a sus respectivos badges
    // al restaurar el modo desde localStorage. Si no removemos esa clase,
    // los badges seguirían visibles encima de nuestro Modo Novios.
    var badgeIds = ['rehearsal-badge', 'wedding-badge'];
    badgeIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('active', 'entrance');
    });
  }

  /**
   * Personaliza los textos de la portada para Modo Novios.
   *
   * Reemplaza tres elementos del .ceremony-cover con textos pertinentes al
   * carisma nupcial:
   *
   *   .ceremony-eyebrow ("Coro Pacem Deus")     — se mantiene el texto pero
   *                                                el CSS lo oscurece y le
   *                                                da más protagonismo.
   *   .ceremony-title  ("Cancionero Dominical") → "Cancionero Litúrgico & Bodas"
   *   .ceremony-date   ("Parroquia de la …")     → "Cantamos al Amor de los Amores"
   *
   * Solo cambia los textos visibles (cover de portada). Los metadatos SEO
   * (<title>, og:title, etc.) NO se tocan — el sitio sigue siendo el
   * Cancionero Dominical de cara a buscadores y redes sociales. Modo Novios
   * es una vista de cara al usuario, no un sitio diferente.
   *
   * Defensivo: si por algún motivo los elementos no existen en el DOM
   * (rediseño futuro, error de parseo), no falla — solo no aplica el cambio
   * en ese elemento concreto.
   */
  function customizeCover() {
    var titleEl = document.querySelector('.ceremony.dominical .ceremony-title');
    var dateEl  = document.querySelector('.ceremony.dominical .ceremony-date');

    if (titleEl) titleEl.textContent = 'Cancionero Litúrgico & Bodas';
    if (dateEl)  dateEl.textContent  = 'Cantamos al Amor de los Amores';
    // .ceremony-eyebrow ("Coro Pacem Deus") no se modifica en texto, solo
    // visualmente vía CSS — su contenido permanece igual.
  }

  /**
   * Activa el modo: dispara la misma animación del sello del Modo Bodas
   * (overlay #wedding-intro con anillos animados, texto rotante "Coro Pacem
   * Deus", paleta perlada) pero con label central "Modo Novios" en vez de
   * "Modo Bodas".
   *
   * Reutilizamos window.playWeddingIntro que el módulo 29 expone globalmente
   * — esa función acepta el label como parámetro, así que solo cambiamos el
   * texto. Cero duplicación de código y cero CSS extra: misma animación
   * exacta, mismo overlay, misma paleta. Lo único que difiere es el label.
   *
   * Tras la animación, body recibe la clase 'novios-mode' y el badge se
   * muestra (CSS lo controla).
   */
  function activate() {
    // Personalizar textos de portada ANTES de activar el modo. Se hace
    // antes para que cuando termine la animación y el cancionero aparezca,
    // ya muestre los textos correctos sin un flash del texto original.
    customizeCover();

    // Si por alguna razón la función global de animación no existe (módulo
    // 29 no cargó por algún error de red), aplicamos el modo igual sin
    // animación — fail-safe: prefiero que el novio vea el cancionero
    // limpio sin animación, antes que ver una página rota.
    if (typeof window.playWeddingIntro !== 'function') {
      document.body.classList.add('novios-mode');
      return;
    }

    // Disparar animación con label "Modo Novios" (mismo formato HTML que
    // usa el módulo 29 con "Modo<br>Bodas" — el <br> separa las dos líneas
    // del sello central).
    window.playWeddingIntro('Modo<br>Novios', function onAnimationDone() {
      // Al terminar la animación, activamos visualmente el modo. Hacerlo
      // DESPUÉS del fade-out del overlay produce una transición suave: el
      // sello desaparece y debajo aparece el cancionero ya en modo novios.
      document.body.classList.add('novios-mode');
    });
  }

  // ── ACTIVACIÓN AL CARGAR ──────────────────────────────────────────────
  // Esto se ejecuta al parsear el script (DOM ya disponible al estar al
  // final del HTML). Es importante que ocurra ANTES de que los módulos 05
  // y 29 restauren su estado desde localStorage — por eso este módulo se
  // carga en posición 28, antes que ellos en el HTML.
  if (shouldActivate()) {
    clearOtherModesPersistence();
    activate();
  }
})();
