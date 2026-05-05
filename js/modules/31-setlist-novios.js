/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/31-setlist-novios.js
 *   @brief      Bridge entre Modo Novios y el panel SLB existente — FAB,
 *               flag pre-init, date picker rodillo y export/import borrador.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.0r3
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

     5. Botones "Exportar borrador (.json)" / "Importar borrador" que
        sustituyen al botón "Grabar" del SLB en Modo Novios — porque la
        sincronización a localStorage es automática en cada cambio.

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
       .exportDraft()        → descarga el borrador como .json
       .importDraft()        → abre input file para cargar un .json
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

  // ── DATE PICKER (flatpickr) ───────────────────────────────────────────
  // v3.6.0r3: el rodillo custom anterior tenía bugs de comportamiento
  // (scroll impreciso, race conditions con scrollend, click-fuera dejaba
  // estado inconsistente). Reemplazado por flatpickr — librería madura
  // (~30KB), MIT, sin dependencias, usada en producción por GitHub,
  // Shopify, Adobe.
  //
  // En desktop muestra calendario en grid 7×6 (estándar UX, lo que la
  // gente espera). En móvil usa el `<input type="date">` nativo del
  // sistema operativo, que sí muestra el rodillo de iOS/Android.
  // flatpickr hace esa detección automáticamente con `disableMobile: false`.
  //
  // Restricciones aplicadas:
  //   minDate: 'today + 1 day'           (mañana)
  //   maxDate: 'today + 18 months'        (límite del rango planificable)
  //   locale:  Spanish (cargado desde CDN)
  //
  // El input está oculto visualmente — solo abrimos el calendario en
  // modo modal sobre toda la pantalla.

  var pickerInstance = null;     // referencia a la instancia activa de flatpickr
  var pickerCallback = null;     // callback a invocar tras confirmar fecha
  var pickerInputEl  = null;     // input oculto que usa flatpickr internamente

  /**
   * Abre el date picker (flatpickr). Si callback se proporciona, se llama
   * con la fecha seleccionada en formato YYYY-MM-DD al confirmar.
   *
   * Internamente:
   *   1. Crea (si no existe) un input hidden adjunto al body.
   *   2. Inicializa flatpickr sobre ese input con las restricciones.
   *   3. Abre el calendario inmediatamente.
   *   4. Al elegir fecha (onChange), guardamos en localStorage y llamamos
   *      al callback. Cerramos la instancia limpiamente.
   */
  function openDatePicker(callback) {
    if (typeof window.flatpickr !== 'function') {
      console.error('[SLN] flatpickr no está cargado. Verificar el <script> en HTML.');
      window.alert('Error al cargar el selector de fecha. Intenta refrescar la página.');
      return;
    }

    // Si ya hay un picker abierto, cerrarlo limpiamente primero
    if (pickerInstance) closeDatePicker();

    pickerCallback = callback || null;

    // Crear (o reutilizar) input hidden — flatpickr necesita un input
    // como ancla. No lo mostramos al usuario; solo abrimos el calendar.
    if (!pickerInputEl) {
      pickerInputEl = document.createElement('input');
      pickerInputEl.type = 'text';
      pickerInputEl.id = 'sln-date-input';
      pickerInputEl.className = 'sln-date-input';
      pickerInputEl.setAttribute('aria-hidden', 'true');
      pickerInputEl.style.position = 'fixed';
      pickerInputEl.style.opacity = '0';
      pickerInputEl.style.pointerEvents = 'none';
      pickerInputEl.style.left = '50%';
      pickerInputEl.style.top  = '50%';
      pickerInputEl.style.width = '1px';
      pickerInputEl.style.height = '1px';
      document.body.appendChild(pickerInputEl);
    }

    // Fecha inicial: si ya eligieron antes, esa. Si no, 6 meses al futuro.
    var initialDateStr;
    var savedKey = localStorage.getItem(DATE_KEY_FOR_NOVIOS);
    if (savedKey && /^\d{4}-\d{2}-\d{2}$/.test(savedKey)) {
      initialDateStr = savedKey;
    } else {
      var d = todayMidnight();
      d.setMonth(d.getMonth() + 6);
      initialDateStr = toDateKey(d);
    }

    // Inicializar flatpickr con las restricciones
    pickerInstance = window.flatpickr(pickerInputEl, {
      // Localización español (debe estar cargada antes vía CDN)
      locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.es) ? 'es' : 'default',

      // Formato interno (lo que recibimos en onChange)
      dateFormat: 'Y-m-d',

      // Restricciones: mañana → hoy + 18 meses
      minDate: tomorrowMidnight(),
      maxDate: maxAllowedDate(),

      // Fecha inicial
      defaultDate: initialDateStr,

      // Modo inline en desktop, picker móvil nativo en mobile.
      // disableMobile: false → en mobile usa <input type="date"> nativo
      //   que muestra el rodillo del SO (iOS/Android).
      disableMobile: false,

      // Estética: sin tiempo, mes y año navegables, semana inicia lunes
      enableTime: false,
      time_24hr: false,

      // Posicionamiento del calendario: centrado en pantalla como modal
      static: false,
      position: 'auto center',

      // Eventos
      onChange: function(selectedDates, dateStr) {
        if (!dateStr) return;
        localStorage.setItem(DATE_KEY_FOR_NOVIOS, dateStr);
        console.log('[SLN] Fecha confirmada:', dateStr);
        var cb = pickerCallback;
        closeDatePicker();
        if (typeof cb === 'function') cb(dateStr);
      },

      onOpen: function() {
        // Agregar clase al body para tematizar (CSS detecta esta clase
        // y aplica paleta rosa perla al calendar de flatpickr).
        document.body.classList.add('sln-picker-active');
      },

      onClose: function() {
        document.body.classList.remove('sln-picker-active');
      }
    });

    // Abrir el calendario
    pickerInstance.open();
  }

  /**
   * Cierra el picker limpiamente. Destruye la instancia para evitar
   * múltiples calendarios huérfanos en el DOM.
   */
  function closeDatePicker() {
    if (pickerInstance) {
      try {
        pickerInstance.close();
        pickerInstance.destroy();
      } catch (e) {
        console.warn('[SLN] Error cerrando picker:', e.message);
      }
      pickerInstance = null;
    }
    pickerCallback = null;
    document.body.classList.remove('sln-picker-active');
  }

  // ── FAB (Floating Action Button) ──────────────────────────────────────

  /**
   * Crea el FAB rosa perla con icono de checklist. Solo visible cuando
   * body.novios-mode está activo (el CSS controla la visibilidad).
   * Se inserta una sola vez al cargar el módulo.
   */
  function createFAB() {
    // Idempotencia: si ya existe, no duplicar
    if (document.getElementById('sln-fab')) return;

    var fab = document.createElement('button');
    fab.id = 'sln-fab';
    fab.className = 'sln-fab';
    fab.setAttribute('type', 'button');
    fab.setAttribute('aria-label', 'Abrir mi setlist de boda');
    fab.setAttribute('title', 'Mi SetList');

    // SVG checklist: 3 líneas con checks. Trazo limpio, sin fills, para
    // que se vea profesional sobre el fondo perlado del FAB.
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polyline points="3 7 5 9 9 5"></polyline>' +
        '<polyline points="3 13 5 15 9 11"></polyline>' +
        '<polyline points="3 19 5 21 9 17"></polyline>' +
        '<line x1="13" y1="7" x2="21" y2="7"></line>' +
        '<line x1="13" y1="13" x2="21" y2="13"></line>' +
        '<line x1="13" y1="19" x2="21" y2="19"></line>' +
      '</svg>';

    fab.addEventListener('click', openWithDateCheck);

    document.body.appendChild(fab);
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
   * Inyecta los botones "Exportar borrador" e "Importar borrador" en el
   * footer del panel SLB. Idempotente — si ya existen, no se duplican.
   *
   * Se busca el footer del panel SLB (donde estaba el botón "Grabar" en
   * Modo Bodas). El CSS de novios-mode.css oculta el botón "Grabar" en
   * Modo Novios, así que estos botones lo reemplazan visualmente.
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
      console.warn('[SLN] No se encontró el panel SLB para inyectar botones export/import');
      return;
    }

    var footer = slbPanel.querySelector('.slb-footer') ||
                 slbPanel.querySelector('.slb-actions') ||
                 slbPanel.querySelector('footer');
    if (!footer) {
      // Fallback: agregar al final del panel
      footer = slbPanel;
    }

    // Crear contenedor con los 2 botones
    var actions = document.createElement('div');
    actions.className = 'sln-draft-actions';

    var exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'sln-draft-btn sln-draft-export';
    exportBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
        '<polyline points="7 10 12 15 17 10"></polyline>' +
        '<line x1="12" y1="15" x2="12" y2="3"></line>' +
      '</svg>' +
      '<span>Exportar borrador</span>';
    exportBtn.addEventListener('click', exportDraft);

    var importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'sln-draft-btn sln-draft-import';
    importBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
        '<polyline points="17 8 12 3 7 8"></polyline>' +
        '<line x1="12" y1="3" x2="12" y2="15"></line>' +
      '</svg>' +
      '<span>Importar borrador</span>';
    importBtn.addEventListener('click', importDraft);

    actions.appendChild(exportBtn);
    actions.appendChild(importBtn);
    footer.appendChild(actions);
  }

  // ── EXPORT/IMPORT BORRADOR ────────────────────────────────────────────

  /**
   * Descarga el borrador actual como archivo .json. El nombre del archivo
   * incluye los nombres de los novios (si existen) y la fecha de la boda
   * para identificación rápida.
   */
  function exportDraft() {
    try {
      var raw = localStorage.getItem('pdNoviosSetlistDraft');
      if (!raw) {
        window.alert('No hay borrador para exportar todavía. Selecciona algunos cantos primero.');
        return;
      }
      var data = JSON.parse(raw);

      // Construir nombre de archivo descriptivo
      var noviosName = (data._meta && data._meta.novios) ? data._meta.novios : 'borrador';
      var fecha = data.fecha || 'sin-fecha';
      var safeName = noviosName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s&]/g, '').replace(/\s+/g, '-');
      var filename = 'CPD-Setlist-Boda-' + safeName + '-' + fecha + '.json';

      // Construir blob y disparar descarga
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 100);
      console.log('[SLN] Borrador exportado:', filename);
    } catch (e) {
      console.error('[SLN] Export error:', e.message);
      window.alert('Error al exportar borrador: ' + e.message);
    }
  }

  /**
   * Abre un input file para que los novios suban un .json previamente
   * exportado. Valida la estructura y carga al localStorage. Recarga el
   * panel SLB después para mostrar los datos cargados.
   */
  function importDraft() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.addEventListener('change', function() {
      var file = input.files && input.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          // Validación básica del schema
          if (typeof data !== 'object' || data === null) {
            throw new Error('El archivo no contiene un objeto JSON válido.');
          }
          if (!data.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) {
            throw new Error('El borrador no tiene una fecha válida.');
          }

          // Confirmar sobrescritura si ya hay borrador
          if (localStorage.getItem('pdNoviosSetlistDraft')) {
            if (!window.confirm('Ya hay un borrador en este dispositivo. ¿Reemplazarlo con el archivo cargado?')) {
              return;
            }
          }

          // Guardar en localStorage
          localStorage.setItem('pdNoviosSetlistDraft', JSON.stringify(data));
          localStorage.setItem(DATE_KEY_FOR_NOVIOS, data.fecha);
          console.log('[SLN] Borrador importado:', data.fecha);

          // Recargar el panel SLB con la nueva fecha
          if (window.SLB && typeof window.SLB.loadDate === 'function') {
            window.SLB.loadDate(data.fecha);
          }
          window.alert('Borrador cargado correctamente. La fecha de la boda es ' + data.fecha + '.');
        } catch (err) {
          console.error('[SLN] Import error:', err.message);
          window.alert('No se pudo cargar el archivo: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    input.click();
  }

  // ── API GLOBAL ────────────────────────────────────────────────────────
  window.SLN = {
    openWithDateCheck: openWithDateCheck,
    openDatePicker:    openDatePicker,
    exportDraft:       exportDraft,
    importDraft:       importDraft
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
