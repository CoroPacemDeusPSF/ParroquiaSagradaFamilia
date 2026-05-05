/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/31-setlist-novios.js
 *   @brief      Bridge entre Modo Novios y el panel SLB existente — FAB,
 *               flag pre-init, date picker rodillo y export/import borrador.
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.0r2
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
  var MES_NOMBRES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

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

  /**
   * Cuántos días tiene un mes específico (1-12).
   * Maneja años bisiestos correctamente.
   */
  function daysInMonth(year, month1based) {
    return new Date(year, month1based, 0).getDate();
  }

  /**
   * Genera array de años permitidos según las restricciones.
   * Típicamente serán 1 o 2 años.
   */
  function allowedYears() {
    var minDate = tomorrowMidnight();
    var maxDate = maxAllowedDate();
    var years = [];
    for (var y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) {
      years.push(y);
    }
    return years;
  }

  /**
   * Genera array de meses permitidos para un año dado.
   * Filtra por las restricciones de fecha mínima/máxima.
   */
  function allowedMonths(year) {
    var minDate = tomorrowMidnight();
    var maxDate = maxAllowedDate();
    var months = [];
    var startMonth = (year === minDate.getFullYear()) ? minDate.getMonth() + 1 : 1;
    var endMonth   = (year === maxDate.getFullYear()) ? maxDate.getMonth() + 1 : 12;
    for (var m = startMonth; m <= endMonth; m++) {
      months.push(m);
    }
    return months;
  }

  /**
   * Genera array de días permitidos para un año/mes dado.
   * Filtra por las restricciones de fecha mínima/máxima.
   */
  function allowedDays(year, month1based) {
    var minDate = tomorrowMidnight();
    var maxDate = maxAllowedDate();
    var days = [];
    var startDay = 1;
    var endDay   = daysInMonth(year, month1based);
    if (year === minDate.getFullYear() && month1based === minDate.getMonth() + 1) {
      startDay = minDate.getDate();
    }
    if (year === maxDate.getFullYear() && month1based === maxDate.getMonth() + 1) {
      endDay = Math.min(endDay, maxDate.getDate());
    }
    for (var d = startDay; d <= endDay; d++) {
      days.push(d);
    }
    return days;
  }

  // ── ESTADO INTERNO ────────────────────────────────────────────────────
  var pickerOverlay = null;  // referencia al overlay del picker (para cerrarlo)
  var pickerState = null;    // estado interno del rodillo activo

  // ── DATE PICKER RODILLO ───────────────────────────────────────────────

  /**
   * Abre el date picker rodillo. Si callback se proporciona, se llama
   * con la fecha seleccionada en formato YYYY-MM-DD al confirmar.
   */
  function openDatePicker(callback) {
    // Si ya hay un picker abierto, cerrarlo primero
    if (pickerOverlay) closeDatePicker();

    // Estado inicial: si los novios ya eligieron una fecha antes,
    // arrancar con esa. Si no, arrancar con una fecha 6 meses al futuro
    // (un valor razonable para el medio del rango permitido).
    var initialDate;
    var savedKey = localStorage.getItem(DATE_KEY_FOR_NOVIOS);
    if (savedKey && /^\d{4}-\d{2}-\d{2}$/.test(savedKey)) {
      var parts = savedKey.split('-');
      initialDate = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    } else {
      initialDate = todayMidnight();
      initialDate.setMonth(initialDate.getMonth() + 6);
    }

    // Asegurar que la fecha inicial esté en rango válido
    var minDate = tomorrowMidnight();
    var maxDate = maxAllowedDate();
    if (initialDate < minDate) initialDate = minDate;
    if (initialDate > maxDate) initialDate = maxDate;

    pickerState = {
      year:  initialDate.getFullYear(),
      month: initialDate.getMonth() + 1,
      day:   initialDate.getDate(),
      callback: callback || null
    };

    buildPickerUI();
  }

  /**
   * Construye la UI del picker rodillo. 3 columnas (día, mes, año) con
   * scroll snap CSS. La columna del medio (mes) lleva el nombre del mes
   * en lugar del número para mejor legibilidad.
   */
  function buildPickerUI() {
    pickerOverlay = document.createElement('div');
    pickerOverlay.className = 'sln-picker-overlay';
    pickerOverlay.innerHTML =
      '<div class="sln-picker-modal" role="dialog" aria-modal="true" aria-label="Elegir fecha de la boda">' +
        '<div class="sln-picker-header">' +
          '<div class="sln-picker-title">¿Cuándo es su boda?</div>' +
          '<div class="sln-picker-subtitle">Seleccione la fecha del enlace nupcial</div>' +
        '</div>' +
        '<div class="sln-picker-body">' +
          '<div class="sln-picker-wheel" data-col="day">' +
            '<div class="sln-wheel-overlay sln-wheel-top"></div>' +
            '<div class="sln-wheel-overlay sln-wheel-bottom"></div>' +
            '<div class="sln-wheel-selection"></div>' +
            '<ul class="sln-wheel-list" id="sln-wheel-day"></ul>' +
          '</div>' +
          '<div class="sln-picker-wheel" data-col="month">' +
            '<div class="sln-wheel-overlay sln-wheel-top"></div>' +
            '<div class="sln-wheel-overlay sln-wheel-bottom"></div>' +
            '<div class="sln-wheel-selection"></div>' +
            '<ul class="sln-wheel-list" id="sln-wheel-month"></ul>' +
          '</div>' +
          '<div class="sln-picker-wheel" data-col="year">' +
            '<div class="sln-wheel-overlay sln-wheel-top"></div>' +
            '<div class="sln-wheel-overlay sln-wheel-bottom"></div>' +
            '<div class="sln-wheel-selection"></div>' +
            '<ul class="sln-wheel-list" id="sln-wheel-year"></ul>' +
          '</div>' +
        '</div>' +
        '<div class="sln-picker-footer">' +
          '<button class="sln-picker-btn sln-picker-cancel" type="button">Cancelar</button>' +
          '<button class="sln-picker-btn sln-picker-confirm" type="button">Confirmar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(pickerOverlay);

    // Cancelar al hacer click en el fondo del overlay (fuera del modal)
    pickerOverlay.addEventListener('click', function(e) {
      if (e.target === pickerOverlay) closeDatePicker();
    });

    // Botones de acción
    var cancelBtn  = pickerOverlay.querySelector('.sln-picker-cancel');
    var confirmBtn = pickerOverlay.querySelector('.sln-picker-confirm');
    cancelBtn.addEventListener('click', closeDatePicker);
    confirmBtn.addEventListener('click', confirmDatePicker);

    // Renderizar las 3 ruedas con valores iniciales
    renderWheel('year',  allowedYears(),                         pickerState.year,  function(v) { return v; });
    renderWheel('month', allowedMonths(pickerState.year),        pickerState.month, function(v) { return MES_NOMBRES[v - 1]; });
    renderWheel('day',   allowedDays(pickerState.year, pickerState.month), pickerState.day, function(v) { return v; });

    // Activar fade-in
    requestAnimationFrame(function() {
      pickerOverlay.classList.add('sln-picker-visible');
    });
  }

  /**
   * Renderiza una rueda (columna). Genera los <li> con los valores y
   * configura el scroll para que el valor seleccionado quede centrado.
   * El scroll-snap CSS asegura que al soltar el dedo, un valor concreto
   * quede al medio. Un listener 'scrollend' actualiza pickerState.
   */
  function renderWheel(colName, values, currentValue, formatFn) {
    var ul = document.getElementById('sln-wheel-' + colName);
    if (!ul) return;

    // Items "fantasma" arriba y abajo para que el primer y último valor
    // real puedan posicionarse en el centro (no quedan pegados a los bordes).
    // 2 items fantasma por lado son suficientes para la altura típica de la
    // ventana del rodillo (5 items visibles, valor central + 2 arriba + 2 abajo).
    var html = '<li class="sln-wheel-item sln-wheel-pad"></li>';
    html    += '<li class="sln-wheel-item sln-wheel-pad"></li>';
    values.forEach(function(v) {
      html += '<li class="sln-wheel-item" data-value="' + v + '">' + formatFn(v) + '</li>';
    });
    html += '<li class="sln-wheel-item sln-wheel-pad"></li>';
    html += '<li class="sln-wheel-item sln-wheel-pad"></li>';
    ul.innerHTML = html;

    // Posicionar la rueda con el valor actual centrado
    var idx = values.indexOf(currentValue);
    if (idx < 0) idx = 0;
    centerWheelOnIndex(ul, idx);

    // Listener de scroll para actualizar pickerState al hacer scroll
    var scrollTimer = null;
    ul.addEventListener('scroll', function() {
      // Debounce: esperar a que el scroll termine para detectar el valor centrado
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() {
        var newIdx = getCenteredIndex(ul);
        var newVal = values[newIdx];
        if (newVal !== undefined && newVal !== pickerState[colName]) {
          pickerState[colName] = newVal;
          // Si cambió el año o el mes, las opciones del mes/día cambian → re-renderizar
          if (colName === 'year') {
            var newMonths = allowedMonths(newVal);
            // Asegurar que el mes actual esté en el nuevo rango
            if (newMonths.indexOf(pickerState.month) < 0) {
              pickerState.month = newMonths[0];
            }
            renderWheel('month', newMonths, pickerState.month, function(v) { return MES_NOMBRES[v - 1]; });
            // Y los días
            var newDaysY = allowedDays(newVal, pickerState.month);
            if (newDaysY.indexOf(pickerState.day) < 0) {
              pickerState.day = newDaysY[0];
            }
            renderWheel('day', newDaysY, pickerState.day, function(v) { return v; });
          } else if (colName === 'month') {
            var newDaysM = allowedDays(pickerState.year, newVal);
            if (newDaysM.indexOf(pickerState.day) < 0) {
              pickerState.day = newDaysM[0];
            }
            renderWheel('day', newDaysM, pickerState.day, function(v) { return v; });
          }
        }
      }, 100);
    });
  }

  /**
   * Centra la rueda en un índice específico. Cada item tiene altura fija
   * (definida en CSS — 3rem). El primer ítem real está en posición 2
   * (después de los 2 fantasma de padding).
   */
  function centerWheelOnIndex(ul, realIdx) {
    var itemHeight = 48; // px — debe coincidir con .sln-wheel-item height en CSS
    ul.scrollTop = realIdx * itemHeight;
  }

  /**
   * Devuelve el índice del ítem REAL (sin contar fantasmas) que está
   * actualmente centrado en la rueda.
   */
  function getCenteredIndex(ul) {
    var itemHeight = 48;
    return Math.round(ul.scrollTop / itemHeight);
  }

  /**
   * Confirma la selección actual. Valida que la fecha esté en rango
   * (defensa en profundidad — el rodillo ya solo permite fechas válidas)
   * y guarda en localStorage. Llama al callback pasado a openDatePicker.
   */
  function confirmDatePicker() {
    if (!pickerState) return;

    var selected = new Date(pickerState.year, pickerState.month - 1, pickerState.day);
    var minDate  = tomorrowMidnight();
    var maxDate  = maxAllowedDate();

    if (selected < minDate || selected > maxDate) {
      window.alert('La fecha seleccionada está fuera del rango permitido.');
      return;
    }

    var dateKey = toDateKey(selected);
    localStorage.setItem(DATE_KEY_FOR_NOVIOS, dateKey);
    console.log('[SLN] Fecha confirmada:', dateKey);

    var cb = pickerState.callback;
    closeDatePicker();
    if (typeof cb === 'function') cb(dateKey);
  }

  /**
   * Cierra el picker con animación de salida.
   */
  function closeDatePicker() {
    if (!pickerOverlay) return;
    pickerOverlay.classList.remove('sln-picker-visible');
    setTimeout(function() {
      if (pickerOverlay && pickerOverlay.parentNode) {
        pickerOverlay.parentNode.removeChild(pickerOverlay);
      }
      pickerOverlay = null;
      pickerState = null;
    }, 250);
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
