/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/31-setlist-novios.js
 *   @brief      Bridge entre Modo Novios y el panel SLB existente — FAB,
 *               flag pre-init, date picker rodillo y export/import borrador.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.6r5
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   31-setlist-novios.js — Bridge SetList Novios
   ============================================================================
   ROL EN LA ARQUITECTURA
     Este módulo NO duplica la lógica del setlist de bodas. Reutiliza el
     módulo 30-setlist-bodas.js (window.SLB) que ya tiene toda la
     infraestructura de slots, persistencia y UI. Lo que hace este módulo:

     1. ANTES que cargue el módulo 30: setear window.PD_NOVIOS_MODE = true
        si la URL tiene ?modo=novios&pin=CPD2026. El módulo 30 lee ese
        flag y selecciona el backend localStorage (en lugar de Firebase).

     2. Crear el FAB (Floating Action Button) rosa perla con icono de
        checklist. Aparece solo cuando body.novios-mode está activo.

     3. Click en el FAB → abrir el panel SLB existente. Si los novios no
        tienen fecha aún, abrir primero el date picker rodillo.

     4. Date picker tematizado tipo rodillo casino con restricciones:
        - Mínimo: mañana (hoy + 1 día)
        - Máximo: hoy + 18 meses

     5. Botón "Exportar PDF" que sustituye al botón "Grabar" del SLB en
        Modo Novios — porque la sincronización a localStorage es automática
        en cada cambio. El PDF generado embebe metadata JSON en el subject
        del documento para poder ser reimportado en Modo Dev (módulo 33).

   ORDEN DE CARGA EN HTML
     Este módulo (31) debe cargar ANTES que el módulo 30 para que el
     flag PD_NOVIOS_MODE esté seteado cuando el 30 selecciona su backend.
     Ver dominical.html sección de scripts.

   FLAG GLOBAL
     window.PD_NOVIOS_MODE: boolean
       true cuando ?modo=novios&pin=CPD2026 está en la URL.
       Hace que el módulo 30 use localStorage como backend.

   API GLOBAL
     window.SLN (SetList Novios)
       .openWithDateCheck()  → abre el panel; si no hay fecha pide picker
       .openDatePicker()     → abre el rodillo de fecha
       .exportPdf()          → genera PDF con metadata embebida y lo abre
   ============================================================================ */

(function() {
  'use strict';

  // ── PRE-INIT (se ejecuta INMEDIATAMENTE al parsear el script) ─────────
  // Este bloque va antes de cualquier definición de función para que el
  // flag PD_NOVIOS_MODE esté seteado lo antes posible. El módulo 30
  // (que carga después en el HTML) lee este flag al elegir su backend.
  function detectNoviosMode() {
    try {
      var params = new URLSearchParams(window.location.search);
      var modo = params.get('modo');
      var pin  = params.get('pin');
      return modo === 'novios' && pin === 'CPD2026';
    } catch (e) {
      return false;
    }
  }

  if (detectNoviosMode()) {
    window.PD_NOVIOS_MODE = true;
    console.log('[SLN] Modo Novios detectado — flag PD_NOVIOS_MODE=true');
  }

  // ── CONSTANTES DE FECHA ───────────────────────────────────────────────
  // Restricciones según requerimiento del usuario:
  //   - Fecha mínima: hoy + 1 día (no permitir fechas pasadas ni hoy)
  //   - Fecha máxima: hoy + 18 meses (límite razonable para planificación)
  var MAX_MONTHS_AHEAD = 18;
  var DATE_KEY_FOR_NOVIOS = 'pdNoviosWeddingDate';  // localStorage key para la fecha activa

  // ── HELPERS DE FECHA ──────────────────────────────────────────────────

  /**
   * Devuelve hoy a las 00:00:00 (sin componente de hora).
   * Útil para comparaciones de fecha sin que la hora del día confunda.
   */
  function todayMidnight() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Devuelve mañana (hoy + 1 día) a las 00:00:00.
   * Es la fecha mínima permitida para una boda.
   */
  function tomorrowMidnight() {
    var d = todayMidnight();
    d.setDate(d.getDate() + 1);
    return d;
  }

  /**
   * Devuelve hoy + 18 meses a las 00:00:00.
   * Es la fecha máxima permitida para una boda.
   * Defensivo con cambios de mes (ej. 31 enero + 1 mes = 28/29 febrero).
   */
  function maxAllowedDate() {
    var d = todayMidnight();
    d.setMonth(d.getMonth() + MAX_MONTHS_AHEAD);
    return d;
  }

  /**
   * Convierte una Date a formato YYYY-MM-DD (formato de SLB).
   */
  function toDateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  // ── DATE PICKER (flatpickr en modo inline + overlay modal propio) ─────
  // v3.6.0r4: refactor completo del picker para resolver dos bugs:
  //
  //   1. La versión anterior usaba flatpickr en "modo dropdown" sobre un
  //      input oculto — flatpickr posiciona el calendar relativo al input,
  //      con un input invisible el posicionamiento era errático.
  //
  //   2. Tras destroy(), el input quedaba en estado inconsistente y la
  //      siguiente apertura fallaba silenciosamente.
  //
  // La solución es usar flatpickr en MODO INLINE: en lugar de ser un
  // dropdown que aparece junto a un input, flatpickr se renderiza
  // directamente dentro de un container que yo controlo. Yo creo el
  // overlay/modal completo, meto un div container adentro, y le digo
  // a flatpickr "renderiza el calendar acá dentro como componente
  // estático". El calendar es entonces parte natural del DOM, no un
  // popup flotante.
  //
  // Beneficios:
  //   · Posicionamiento 100% controlado por mí (overlay full-screen
  //     centrado con backdrop blur).
  //   · Cierre limpio: yo elimino el overlay → todo el calendar se va
  //     con él. Sin DOM huérfano ni instancias zombies.
  //   · Cada apertura es completamente fresca: nuevo overlay, nueva
  //     instancia de flatpickr, sin estado residual entre aperturas.
  //   · Mis botones "Cancelar" y "Confirmar" tienen control total del
  //     flujo (cancelar = no llamar callback; confirmar = llamar callback
  //     con la fecha seleccionada actual).

  // Estado interno del picker activo. SOLO existe mientras el picker está
  // abierto. Al cerrar, ambas referencias se ponen a null.
  var pickerOverlay  = null;  // el div overlay full-screen
  var pickerInstance = null;  // la instancia flatpickr
  var pickerSelectedDate = null;  // fecha actualmente seleccionada (Date object)

  /**
   * Abre el date picker. Crea un overlay modal completo con flatpickr
   * embedido en modo inline. Si callback se proporciona, se llama con la
   * fecha seleccionada en formato YYYY-MM-DD al confirmar (no al cancelar).
   */
  function openDatePicker(callback) {
    if (typeof window.flatpickr !== 'function') {
      console.error('[SLN] flatpickr no está cargado. Verificar el <script> en HTML.');
      window.alert('Error al cargar el selector de fecha. Intenta refrescar la página.');
      return;
    }

    // Si ya hay un picker abierto (por algún motivo), cerrarlo primero
    if (pickerOverlay) closeDatePicker();

    // Fecha inicial: si los novios ya eligieron antes, esa. Si no, 6 meses
    // al futuro como punto de partida razonable dentro del rango permitido.
    var initialDateStr;
    var savedKey = localStorage.getItem(DATE_KEY_FOR_NOVIOS);
    if (savedKey && /^\d{4}-\d{2}-\d{2}$/.test(savedKey)) {
      initialDateStr = savedKey;
    } else {
      var d = todayMidnight();
      d.setMonth(d.getMonth() + 6);
      initialDateStr = toDateKey(d);
    }

    // Construir overlay + modal usando DOM API (no innerHTML con strings
    // largos para evitar problemas de escaping).
    pickerOverlay = document.createElement('div');
    pickerOverlay.className = 'sln-picker-overlay';
    pickerOverlay.setAttribute('role', 'dialog');
    pickerOverlay.setAttribute('aria-modal', 'true');
    pickerOverlay.setAttribute('aria-label', 'Seleccionar fecha de la boda');

    var modal = document.createElement('div');
    modal.className = 'sln-picker-modal';

    // Header: título y subtítulo
    var header = document.createElement('div');
    header.className = 'sln-picker-header';

    var title = document.createElement('div');
    title.className = 'sln-picker-title';
    title.textContent = '¿Cuándo es su boda?';

    var subtitle = document.createElement('div');
    subtitle.className = 'sln-picker-subtitle';
    subtitle.textContent = 'Seleccione la fecha del enlace nupcial';

    header.appendChild(title);
    header.appendChild(subtitle);

    // Container para el calendar inline de flatpickr
    var calendarContainer = document.createElement('div');
    calendarContainer.className = 'sln-picker-calendar-container';

    // Footer: botones Cancelar y Confirmar
    var footer = document.createElement('div');
    footer.className = 'sln-picker-footer';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sln-picker-btn sln-picker-cancel';
    cancelBtn.textContent = 'Cancelar';

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'sln-picker-btn sln-picker-confirm';
    confirmBtn.textContent = 'Confirmar';

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(calendarContainer);
    modal.appendChild(footer);
    pickerOverlay.appendChild(modal);
    document.body.appendChild(pickerOverlay);

    // Inicializar flatpickr en MODO INLINE dentro del container.
    // En modo inline, flatpickr renderiza el calendar como componente
    // embedido dentro del div pasado, no como popup flotante.
    pickerInstance = window.flatpickr(calendarContainer, {
      // Modo inline: el calendar es parte del DOM permanente del modal,
      // no un dropdown flotante que aparece/desaparece.
      inline: true,

      // Formato interno (lo que recibimos en onChange)
      dateFormat: 'Y-m-d',

      // Restricciones temporales: mañana → hoy + 18 meses
      minDate: tomorrowMidnight(),
      maxDate: maxAllowedDate(),

      // Fecha inicial mostrada/preseleccionada al abrir
      defaultDate: initialDateStr,

      // En modo inline, disableMobile NO aplica (no hay popup que
      // reemplazar). El calendar se ve igual en desktop y móvil.
      // Esto es OK porque el calendar de flatpickr es responsive.
      disableMobile: true,

      // No queremos hora, solo fecha
      enableTime: false,

      /* v3.6.6r5: Forzar domingo como primer día de la semana.
         flatpickr respeta firstDayOfWeek por encima del locale.firstDayOfWeek.
         El locale 'es' default usa lunes (norma ISO 8601 / europea), pero
         los usuarios latinoamericanos están más acostumbrados al formato
         D-L-M-M-J-V-S de calendarios impresos y apps móviles. Este
         override no afecta los nombres de los días (que siguen en español),
         solo el orden. */
      locale: Object.assign({}, (window.flatpickr.l10ns && window.flatpickr.l10ns.es) || {}, {
        firstDayOfWeek: 0
      }),

      // Callback al cambiar selección. NO cerramos automáticamente —
      // el usuario debe confirmar con el botón "Confirmar".
      onChange: function(selectedDates) {
        pickerSelectedDate = selectedDates && selectedDates[0] ? selectedDates[0] : null;
      },

      // Callback al inicializarse: capturar la fecha por defecto
      onReady: function(selectedDates) {
        pickerSelectedDate = selectedDates && selectedDates[0] ? selectedDates[0] : null;
      }
    });

    // Botones — al confirmar, validamos y llamamos callback. Al cancelar,
    // simplemente cerramos sin llamar callback.
    confirmBtn.addEventListener('click', function() {
      if (!pickerSelectedDate) {
        // Si por algún motivo no hay fecha seleccionada (no debería pasar
        // porque defaultDate la pone), no hacer nada.
        return;
      }
      var dateKey = toDateKey(pickerSelectedDate);

      // Defensa en profundidad: validar que la fecha esté en rango aunque
      // las restricciones de flatpickr ya lo prevengan.
      var d = new Date(pickerSelectedDate.getTime());
      d.setHours(0, 0, 0, 0);
      if (d < tomorrowMidnight() || d > maxAllowedDate()) {
        window.alert('La fecha seleccionada está fuera del rango permitido.');
        return;
      }

      localStorage.setItem(DATE_KEY_FOR_NOVIOS, dateKey);
      console.log('[SLN] Fecha confirmada:', dateKey);

      // Capturar callback antes de cerrar (closeDatePicker pone null)
      var cb = pickerCallback;
      closeDatePicker();
      if (typeof cb === 'function') cb(dateKey);
    });

    cancelBtn.addEventListener('click', function() {
      closeDatePicker();
      // No llamamos callback al cancelar
    });

    // Click en el fondo del overlay (fuera del modal) = cancelar
    pickerOverlay.addEventListener('click', function(e) {
      if (e.target === pickerOverlay) {
        closeDatePicker();
      }
    });

    // Tecla Escape = cancelar (accesibilidad)
    function onEscape(e) {
      if (e.key === 'Escape') {
        closeDatePicker();
        document.removeEventListener('keydown', onEscape);
      }
    }
    document.addEventListener('keydown', onEscape);

    // Guardar callback para confirmDatePicker
    pickerCallback = callback || null;

    // Activar fade-in animado en el siguiente frame (CSS detecta esta clase)
    requestAnimationFrame(function() {
      if (pickerOverlay) pickerOverlay.classList.add('sln-picker-visible');
    });
  }

  /**
   * Cierra el picker. Destruye flatpickr, remueve el overlay del DOM y
   * resetea todo el estado interno. Después de llamar a esta función, no
   * queda DOM ni JavaScript residual del picker — la siguiente apertura
   * empieza desde cero limpiamente.
   */
  function closeDatePicker() {
    // Destruir instancia flatpickr (libera sus event listeners y referencias)
    if (pickerInstance) {
      try {
        pickerInstance.destroy();
      } catch (e) {
        console.warn('[SLN] Error destruyendo flatpickr:', e.message);
      }
      pickerInstance = null;
    }

    // Animación de salida + remoción del DOM
    if (pickerOverlay) {
      var overlayToRemove = pickerOverlay;
      pickerOverlay.classList.remove('sln-picker-visible');
      pickerOverlay = null;  // permitir nueva apertura inmediata

      setTimeout(function() {
        if (overlayToRemove && overlayToRemove.parentNode) {
          overlayToRemove.parentNode.removeChild(overlayToRemove);
        }
      }, 250);
    }

    pickerSelectedDate = null;
    pickerCallback = null;
  }

  // Variable global para el callback (usada por confirmBtn dentro del modal)
  var pickerCallback = null;

  // ── FAB (Floating Action Button) ──────────────────────────────────────

  /**
   * Crea el edge-tab vertical pegado al borde izquierdo de la pantalla.
   * Mismo patrón visual que .slb-tab del Modo Bodas pero con paleta
   * propia y emanaciones decorativas (notas musicales y corazones).
   *
   * Visible solo cuando body.novios-mode está activo (el CSS controla
   * la visibilidad). Se inserta una sola vez al cargar el módulo.
   *
   * Estructura DOM:
   *   <button#sln-edge>
   *     <svg.sln-edge-icon> ← icono de checklist (función)
   *     <span.sln-emanation>♪</span> × N ← notas musicales y corazones
   *                                        flotantes con animación CSS
   *   </button>
   */
  function createFAB() {
    // Idempotencia: si ya existe, no duplicar
    if (document.getElementById('sln-edge')) return;

    var edge = document.createElement('button');
    edge.id = 'sln-edge';
    edge.className = 'sln-edge';
    edge.setAttribute('type', 'button');
    edge.setAttribute('aria-label', 'Abrir mi setlist de boda');
    edge.setAttribute('title', 'Mi SetList');

    // SVG checklist principal (función del botón)
    edge.innerHTML =
      '<svg class="sln-edge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polyline points="3 7 5 9 9 5"></polyline>' +
        '<polyline points="3 13 5 15 9 11"></polyline>' +
        '<polyline points="3 19 5 21 9 17"></polyline>' +
        '<line x1="13" y1="7" x2="21" y2="7"></line>' +
        '<line x1="13" y1="13" x2="21" y2="13"></line>' +
        '<line x1="13" y1="19" x2="21" y2="19"></line>' +
      '</svg>' +
      // Emanaciones: 6 partículas (3 notas musicales + 3 corazones)
      // que flotan hacia arriba con animación CSS escalonada. Cada una
      // tiene su propio delay para que no salgan todas al mismo tiempo.
      '<span class="sln-emanation sln-em-1" aria-hidden="true">♪</span>' +
      '<span class="sln-emanation sln-em-2" aria-hidden="true">♥</span>' +
      '<span class="sln-emanation sln-em-3" aria-hidden="true">♫</span>' +
      '<span class="sln-emanation sln-em-4" aria-hidden="true">♥</span>' +
      '<span class="sln-emanation sln-em-5" aria-hidden="true">♪</span>' +
      '<span class="sln-emanation sln-em-6" aria-hidden="true">♥</span>';

    edge.addEventListener('click', openWithDateCheck);

    document.body.appendChild(edge);
  }

  // ── APERTURA DEL PANEL SLB ────────────────────────────────────────────

  /**
   * Abre el panel SLB. Si los novios todavía no eligieron fecha, abrir
   * primero el date picker; al confirmar la fecha, se abre el panel.
   */
  function openWithDateCheck() {
    var savedDate = localStorage.getItem(DATE_KEY_FOR_NOVIOS);
    if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
      openSLBPanel(savedDate);
    } else {
      openDatePicker(function(dateKey) {
        openSLBPanel(dateKey);
      });
    }
  }

  /**
   * Abre el panel SLB existente con la fecha indicada. Aprovecha la API
   * pública de window.SLB. Si SLB todavía no inicializó, espera.
   */
  function openSLBPanel(dateKey) {
    if (!window.SLB) {
      console.warn('[SLN] window.SLB no disponible aún, reintentando...');
      setTimeout(function() { openSLBPanel(dateKey); }, 100);
      return;
    }
    // Cargar la fecha en el SLB (selectDate dispara loadFromFirebase
    // internamente — que ahora pasa por la capa storage y usa localStorage).
    if (typeof window.SLB.selectDate === 'function') {
      window.SLB.selectDate(dateKey);
    }
    // Abrir el panel
    if (typeof window.SLB.open === 'function') {
      window.SLB.open();
    }
    // Inyectar botones export/import (después de un breve delay para que
    // el panel haya terminado de renderizarse)
    setTimeout(injectDraftActions, 100);
  }

  /**
   * Inyecta el botón "Exportar PDF" en el footer del panel SLB. Idempotente —
   * si ya existe, no se duplica.
   *
   * v3.6.6: antes inyectaba dos botones (Exportar/Importar borrador JSON).
   * Ahora solo inyecta "Exportar PDF" porque:
   *   - El export genera un PDF imprimible CON metadata JSON embebida en el
   *     subject del PDF — ese mismo PDF puede ser reimportado en Modo Dev
   *     para reconstruir el SetList en Firebase.
   *   - El import fue movido a Modo Dev (donde escribe a Firebase). En Modo
   *     Novios no tendría sentido importar (no escribe a Firebase).
   *
   * Se busca el footer del panel SLB (donde estaba el botón "Grabar" en
   * Modo Bodas). El CSS de novios-mode.css oculta el botón "Grabar" en
   * Modo Novios, así que este botón lo reemplaza visualmente.
   */
  function injectDraftActions() {
    // Idempotencia: si ya existen, no duplicar
    if (document.querySelector('.sln-draft-actions')) return;

    // Buscar el footer del panel SLB. Probamos varios selectores
    // posibles (la clase exacta puede variar según versión del SLB).
    var slbPanel = document.querySelector('.slb-panel') ||
                   document.querySelector('#slb-panel') ||
                   document.querySelector('.setlist-panel');
    if (!slbPanel) {
      console.warn('[SLN] No se encontró el panel SLB para inyectar botón Exportar PDF');
      return;
    }

    var footer = slbPanel.querySelector('.slb-footer') ||
                 slbPanel.querySelector('.slb-actions') ||
                 slbPanel.querySelector('footer');
    if (!footer) {
      // Fallback: agregar al final del panel
      footer = slbPanel;
    }

    // Crear contenedor con el botón "Exportar PDF"
    var actions = document.createElement('div');
    actions.className = 'sln-draft-actions';

    var exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'sln-draft-btn sln-draft-export';
    exportBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
        '<polyline points="14 2 14 8 20 8"></polyline>' +
      '</svg>' +
      '<span>Exportar PDF</span>';
    exportBtn.addEventListener('click', exportPdfFromNovios);

    actions.appendChild(exportBtn);
    footer.appendChild(actions);
  }

  // ── EXPORT/IMPORT BORRADOR ────────────────────────────────────────────

  /**
   * Descarga el borrador actual como archivo .json. El nombre del archivo
   * incluye los nombres de los novios (si existen) y la fecha de la boda
   * para identificación rápida.
   */
  /**
   * v3.6.6: Exporta el SetList actual como PDF imprimible CON metadata
   * JSON embebida en el subject del PDF. Ese PDF puede ser reimportado
   * después en Modo Dev (módulo 33) para reconstruir el SetList en
   * Firebase.
   *
   * En Modo Novios el backend es localStorage (no Firebase), así que el
   * "borrador" del SetList vive en localStorage['pdNoviosSetlistDraft'].
   * Lo leemos aquí, lo pasamos al builder PDF (módulo 32) que lo procesa
   * igual que un setlist de Firebase.
   *
   * El builder genera el PDF, lo abre en una nueva pestaña, y queda
   * disponible para que los novios:
   *   - Lo impriman
   *   - Lo guarden en su celular
   *   - Lo envíen al sacerdote por WhatsApp / email
   *   - Lo lleven a la parroquia para que Renzo lo importe en Modo Dev
   */
  function exportPdfFromNovios() {
    try {
      var raw = localStorage.getItem('pdNoviosSetlistDraft');
      if (!raw) {
        window.alert('No hay cantos en el borrador todavía. Selecciona algunos cantos primero.');
        return;
      }
      var data = JSON.parse(raw);

      if (!data.fecha) {
        window.alert('El borrador no tiene fecha de boda. Selecciona la fecha primero.');
        return;
      }

      // Verificar que el módulo 32 esté disponible (orquestador del PDF)
      if (!window.SLBPdf || typeof window.SLBPdf.generateAndOpen !== 'function') {
        window.alert('El generador PDF no está disponible. Contacta al equipo del coro.');
        console.error('[SLN] window.SLBPdf no disponible — verificar que módulo 32 esté cargado');
        return;
      }

      // Delegar al módulo 32 con el draft de localStorage como fuente de datos
      window.SLBPdf.generateAndOpen({
        fecha:      data.fecha,
        novios:     (data._meta && data._meta.novios) || '',
        slotsData:  data,           // objeto con slotId → { cpd, title } / instrumental
        optionals:  (data._meta && data._meta.optionals) || []
      });

      console.log('[SLN] PDF generado para fecha:', data.fecha);
    } catch (e) {
      console.error('[SLN] Export PDF error:', e.message);
      window.alert('Error al generar PDF: ' + e.message);
    }
  }

  // ── API GLOBAL ────────────────────────────────────────────────────────
  window.SLN = {
    openWithDateCheck: openWithDateCheck,
    openDatePicker:    openDatePicker,
    exportPdf:         exportPdfFromNovios
  };

  // ── INICIALIZACIÓN ────────────────────────────────────────────────────
  // Solo activamos el FAB y los listeners si estamos en Modo Novios.
  // Si no, el módulo no inyecta nada al DOM (cero impacto en otros modos).
  if (window.PD_NOVIOS_MODE === true) {
    // Esperar al DOMContentLoaded antes de tocar el body
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createFAB);
    } else {
      createFAB();
    }
    console.log('[SLN] Bridge SetList Novios inicializado');
  }

})();
