/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/30-setlist-bodas.js
 *   @brief      Panel SetList lateral para Bodas — picker de fecha, slots opcionales, Firebase
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r10
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   30-setlist-bodas.js  —  Setlist Bodas (paralelo al módulo 23)
   ============================================================================
   ARQUITECTURA
     Módulo independiente del 23-setlist-edge-panel.js — comparte CSS pero
     NO comparte estado, ni Firebase path, ni slots. Convive en paralelo.

     CSS class prefix: .slb-* (vs .sl-* del dominical).
     API global: window.SLB (vs window.SL).
     Firebase: /setlist-bodas/{YYYY-MM-DD}/{slot-id}
     Activación visual: body.wedding-mode (vs body.rehearsal-mode).

   SLOTS DE BODA
     14 slots fijos en orden litúrgico de boda católica:
       Ingreso del Novio → Entrada de la Novia → Piedad → Gloria →
       Evangelio → Ofertorio → Santo → Cordero →
       Comunión → Firma del Pliego →
       Foto 1, 2, 3 → (Foto 4, 5 opcionales) →
       Salida de Novios.

     Los slots opcionales (Foto 4, Foto 5) NO se muestran por defecto.
     Se agregan vía botón "+ agregar momento" en el footer del panel.
     Se quitan vía botón "X" inline.

     v3.6.4: eliminados de los slots los siguientes momentos por
     decisión litúrgica/operativa:
       - Rito Matrimonial: el rito es proclamado por el sacerdote, no
         requiere canto del coro.
       - Canto a María: el coro de la parroquia no lo realiza
         habitualmente; cuando se requiere se puede acomodar en la
         Firma del Pliego.
       - Salmo: en bodas el salmo lo maneja el coro fuera del cancionero
         o lo proclama el lector; no se programa desde aquí.

   FECHAS DE BODA
     A diferencia del setlist dominical (próximo domingo automático), las
     bodas se identifican por fecha manual. El usuario:
       1. Crea una fecha nueva → input date nativo → guarda → fecha pasa a
          estar disponible en el picker.
       2. Navega entre fechas guardadas con un picker visual de calendario.

     Solo se muestra una fecha activa a la vez en el panel; los slots
     reflejan el contenido de esa fecha en Firebase.

   NOMBRES DE NOVIOS
     Campo opcional en el header del panel — al tap, abre input nativo
     para escribir. Si está vacío, no ocupa espacio (no muestra línea).
     Persiste en Firebase como /setlist-bodas/{fecha}/_meta/novios.

   ORDEN DE CARGA: posición 30 — después del módulo 29-wedding-mode.js
   ============================================================================ */

(function() {
  'use strict';

  // ── CONSTANTES ────────────────────────────────────────────────────────
  var FIREBASE_URL = 'https://coropacemdeusdominical-default-rtdb.firebaseio.com';
  var FB_BASE      = '/setlist-bodas';
  var PIN_KEY      = 'pdSlbPinned'; // localStorage del estado pinned del panel

  // ── CAPA DE ABSTRACCIÓN DE STORAGE (v3.6.0) ───────────────────────────
  // El módulo SLB soporta dos backends de almacenamiento, transparentes
  // para el resto del código:
  //
  //   · Modo Bodas (default): Firebase Realtime DB → /setlist-bodas/{fecha}
  //     Comportamiento histórico, sin cambios funcionales.
  //
  //   · Modo Novios: localStorage → 'pdNoviosSetlistDraft'
  //     Activado cuando window.PD_NOVIOS_MODE === true al inicializar.
  //     El flag lo setea el módulo 31-setlist-novios.js antes de que
  //     este módulo (30) se ejecute.
  //
  // API uniforme (todas retornan Promise):
  //   storage.loadAll(dateKey) → Promise<{ _meta?, slot1?, slot2?, ... }>
  //   storage.saveSlot(dateKey, slotId, data) → Promise<void>
  //   storage.removeSlot(dateKey, slotId) → Promise<void>
  //   storage.saveMeta(dateKey, key, value) → Promise<void>  ('novios'|'optionals')
  //   storage.saveAll(dateKey, fullObject) → Promise<void>
  //   storage.listDates() → Promise<string[]>
  //
  // En el backend localStorage, `dateKey` se ignora — solo existe UN
  // borrador por dispositivo (los novios planean SU boda, no varias).

  function isNoviosMode() {
    // Lee el flag global que el módulo 31 setea antes de cargar este 30.
    // Defensivo: si por algún motivo no existe, asume Modo Bodas (default).
    return window.PD_NOVIOS_MODE === true;
  }

  /**
   * Backend Firebase — comportamiento histórico de SLB.
   * Cada método retorna una Promise con el resultado de la operación
   * Firebase Realtime DB vía fetch + REST API.
   */
  function createFirebaseStorage() {
    return {
      mode: 'firebase',

      loadAll: function(dateKey) {
        return fetch(FIREBASE_URL + FB_BASE + '/' + dateKey + '.json')
          .then(function(r) { return r.json(); });
      },

      saveSlot: function(dateKey, slotId, data) {
        return fetch(FIREBASE_URL + FB_BASE + '/' + dateKey + '/' + slotId + '.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      },

      removeSlot: function(dateKey, slotId) {
        return fetch(FIREBASE_URL + FB_BASE + '/' + dateKey + '/' + slotId + '.json', {
          method: 'DELETE'
        });
      },

      saveMeta: function(dateKey, key, value) {
        return fetch(FIREBASE_URL + FB_BASE + '/' + dateKey + '/_meta/' + key + '.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value)
        });
      },

      saveAll: function(dateKey, fullObject) {
        return fetch(FIREBASE_URL + FB_BASE + '/' + dateKey + '.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullObject)
        });
      },

      /* v3.6.6r6: borra el evento completo de Firebase. Útil para
         "Eliminar Evento" — libera la fecha por completo (no queda
         registro en el shallow listDates). */
      deleteAll: function(dateKey) {
        return fetch(FIREBASE_URL + FB_BASE + '/' + dateKey + '.json', {
          method: 'DELETE'
        });
      },

      listDates: function() {
        return fetch(FIREBASE_URL + FB_BASE + '.json?shallow=true')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            return data ? Object.keys(data) : [];
          });
      }
    };
  }

  /**
   * Backend localStorage — para Modo Novios.
   * Solo existe UN setlist (no múltiples fechas). Estructura:
   *   {
   *     fecha: 'YYYY-MM-DD',
   *     _meta: { novios: '...', optionals: [...] },
   *     [slotId]: { cpd?, instrumental?, title }
   *   }
   * El `dateKey` se ignora — siempre lee/escribe el mismo borrador.
   * Las Promises son síncronas internamente (Promise.resolve) para
   * mantener la firma compatible con el backend Firebase.
   */
  function createLocalStorage() {
    var KEY = 'pdNoviosSetlistDraft';

    function read() {
      try {
        var raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        console.warn('[SLB/local] read error:', e.message);
        return {};
      }
    }

    function write(obj) {
      try {
        obj._actualizado = new Date().toISOString();
        localStorage.setItem(KEY, JSON.stringify(obj));
      } catch (e) {
        console.warn('[SLB/local] write error:', e.message);
      }
    }

    return {
      mode: 'localStorage',

      loadAll: function(/* dateKey */) {
        // Devolver objeto sin la marca interna _actualizado
        var data = read();
        var copy = {};
        Object.keys(data).forEach(function(k) {
          if (k !== '_actualizado') copy[k] = data[k];
        });
        return Promise.resolve(copy);
      },

      saveSlot: function(dateKey, slotId, data) {
        var current = read();
        current[slotId] = data;
        // Guardar también la fecha activa (para reconstruir el panel)
        if (dateKey) current.fecha = dateKey;
        write(current);
        return Promise.resolve();
      },

      removeSlot: function(dateKey, slotId) {
        var current = read();
        delete current[slotId];
        write(current);
        return Promise.resolve();
      },

      saveMeta: function(dateKey, key, value) {
        var current = read();
        if (!current._meta) current._meta = {};
        current._meta[key] = value;
        if (dateKey) current.fecha = dateKey;
        write(current);
        return Promise.resolve();
      },

      saveAll: function(dateKey, fullObject) {
        var copy = {};
        Object.keys(fullObject).forEach(function(k) { copy[k] = fullObject[k]; });
        if (dateKey) copy.fecha = dateKey;
        write(copy);
        return Promise.resolve();
      },

      /* v3.6.6r6: en localStorage solo existe UN borrador, así que
         deleteAll simplemente borra la key. Mantiene compatibilidad
         con la firma de Firebase backend (mismo nombre, mismo Promise). */
      deleteAll: function(/* dateKey */) {
        try {
          localStorage.removeItem(KEY);
        } catch (e) {
          console.warn('[SLB/local] deleteAll error:', e.message);
        }
        return Promise.resolve();
      },

      listDates: function() {
        // Solo hay una fecha activa: la del borrador (si existe).
        var data = read();
        return Promise.resolve(data.fecha ? [data.fecha] : []);
      }
    };
  }

  /**
   * Selección del backend al iniciar el módulo. Se hace UNA sola vez
   * y se usa durante toda la vida del módulo. No cambia en runtime.
   */
  var storage = isNoviosMode() ? createLocalStorage() : createFirebaseStorage();
  console.log('[SLB] storage backend:', storage.mode);

  // ── DEFINICIÓN DE SLOTS ───────────────────────────────────────────────
  // SLOTS_FIJOS: siempre visibles en el panel (defaultEmpty implícito).
  // SLOTS_OPCIONALES: solo visibles si están en el array `enabledOptionals`
  // del setlist actual. Se habilitan/deshabilitan vía botón "+".
  //
  // El orden en SLOTS_FIJOS determina el orden de display. Los opcionales
  // se insertan en su `insertAfter` (id del slot fijo después del cual van).
  //
  // FLAG `instrumentable`:
  //   Slots donde es común que el momento sea cubierto con música
  //   instrumental (sin canto del cancionero). Para esos slots aparece
  //   un botón "violín" (SVG) adicional que abre un mini-dialog para
  //   libre (ej. "Marcha del Príncipe de Dinamarca", "Canon de Pachelbel").
  //   Los datos guardan { instrumental: true, title: "..." } en lugar
  //   del { cpd, title } de un canto del cancionero.
  var SLOTS_FIJOS = [
    { id: 'ingreso-novio',    label: 'Ingreso del Novio',   instrumentable: true },
    { id: 'entrada-novia',    label: 'Entrada de la Novia', instrumentable: true },
    { id: 'piedad',           label: 'Piedad'              },
    { id: 'gloria',           label: 'Gloria'              },
    { id: 'evangelio',        label: 'Evangelio'           },
    /* v3.6.4: 'rito-matrimonial' eliminado. El rito es proclamado por
       el sacerdote y no requiere canto del coro. Si en alguna ceremonia
       se necesita acompañamiento, se programa fuera del SetList. */
    { id: 'ofertorio',        label: 'Ofertorio'           },
    { id: 'santo',            label: 'Santo'               },
    { id: 'cordero',          label: 'Cordero de Dios'     },
    { id: 'comunion',         label: 'Comunión'            },
    { id: 'firma-pliego',     label: 'Firma del Pliego'    },
    { id: 'foto-1',           label: 'Fotografía',  sub: '1' },
    { id: 'foto-2',           label: 'Fotografía',  sub: '2' },
    { id: 'foto-3',           label: 'Fotografía',  sub: '3' },
    /* v3.6.6r1: foto-4 ahora es slot fijo (antes era opcional con +botón).
       El SetList se considera completo con o sin canto en este slot —
       solo está listo para que los novios agreguen una 4ta canción si
       quieren, sin tener que clickear "+" antes. La 5ta fotografía y
       posteriores quedaron eliminadas; en la práctica nunca se usaron. */
    { id: 'foto-4',           label: 'Fotografía',  sub: '4' },
    { id: 'salida',           label: 'Salida de Novios',    instrumentable: true }
  ];

  // v3.6.6r1: SLOTS_OPCIONALES quedó vacío. Antes contenía 'foto-4' y
  // 'foto-5' como slots con +botón en el footer. Renzo decidió que un
  // 4to slot de Fotografía siempre debe estar visible (aunque opcional
  // para llenar) y que un 5to slot ya no es necesario. Mantenemos el
  // array como [] para no romper la lógica de computeDisplaySlots y
  // saveAll que iteran sobre SLOTS_OPCIONALES — un array vacío resuelve
  // como "no hay opcionales que insertar/persistir".
  var SLOTS_OPCIONALES = [];

  // Mapa de label → id de sección del cancionero (clic en label navega).
  // Para bodas, los moments litúrgicos del cancionero son los mismos que
  // los dominicales, así que reusamos los mismos targets.
  var LABEL_TO_SECTION = {
    /* v3.6.5: 'Ingreso del Novio' y 'Entrada de la Novia' navegan a
       la sección 'sec-instrumentales' del cancionero. Antes el primer
       slot no era clickable (no tenía mapeo) y el segundo iba a
       'sec-entrada' (entrada litúrgica), inconsistente. Ahora ambos
       caen al moment 'Instrumentales' donde están las piezas sin letra
       (Pachelbel, Mendelssohn, etc.) que el coro usa para el ingreso. */
    'Ingreso del Novio':  'sec-instrumentales',
    'Entrada de la Novia':'sec-instrumentales',
    'Piedad':           'sec-piedad',
    'Gloria':           'sec-gloria',
    'Evangelio':        'sec-aleluya',
    'Ofertorio':        'sec-ofertorio',
    'Santo':            'sec-santo',
    'Cordero de Dios':  'sec-cordero',
    'Comunión':         'sec-comunion',
    'Salida de Novios': 'sec-salida'
  };

  // Mapeo de moment del cancionero → slot de boda sugerido (para
  // resaltar opciones en el dialog "Agregar al setlist de boda").
  var TAG_MAP = {
    /* v3.6.5: 'Instrumentales' sugieren ingresos. Cuando el usuario
       hace click en + sobre un canto instrumental, el dialog
       resalta los slots 'ingreso-novio' y 'entrada-novia' como
       destinos sugeridos (ambos son slots instrumentables). */
    'Instrumentales':           'entrada-novia',
    'Entrada':                  'entrada-novia',
    'Piedad':                   'piedad',
    'Gloria':                   'gloria',
    'Aleluya':                  'evangelio',
    'Aclamación del Evangelio': 'evangelio',
    'Ofertorio':                'ofertorio',
    'Santo':                    'santo',
    'Cordero de Dios':          'cordero',
    'Comunión':                 'comunion',
    'Acción de Gracias':        'comunion',
    'Salida':                   'salida',
    'Animación':                'foto-1'  // animación → fotos como tendencia
  };

  // ── ESTADO INTERNO ────────────────────────────────────────────────────
  var setlistData       = {};   // slot-id → { cpd, title }
  var enabledOptionals  = [];   // ids de slots opcionales activados
  var noviosNombres     = '';   // texto libre (puede estar vacío)
  var currentDate       = null; // YYYY-MM-DD de la fecha activa
  var availableDates    = [];   // array de fechas con setlist guardado
  var isOpen            = false;
  var isPinned          = false; // panel fijo (no se cierra al click outside / swipe / Esc)
  var pendingAdd        = null;
  var touchStartX       = 0;

  // Vistas del panel: 'main' (slots) | 'date-picker' | 'novios-edit'
  var currentView = 'main';

  // ── ELEMENTOS DEL DOM ─────────────────────────────────────────────────
  var panel, overlay, tab, slotsEl, headerEl, footerEl;
  var dialogOverlay, dialogSongEl, dialogSlotsEl;

  function bindElements() {
    panel         = document.getElementById('slb-panel');
    overlay       = document.getElementById('slb-overlay');
    tab           = document.getElementById('slb-tab');
    slotsEl       = document.getElementById('slb-slots');
    headerEl      = document.getElementById('slb-header');
    footerEl      = document.getElementById('slb-footer');
    dialogOverlay = document.getElementById('slb-dialog-overlay');
    dialogSongEl  = document.getElementById('slb-dialog-song');
    dialogSlotsEl = document.getElementById('slb-dialog-slots');
  }

  // ── HELPERS DE FECHA ──────────────────────────────────────────────────
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDateKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseDateKey(key) {
    var parts = key.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }

  function formatDateDisplay(key) {
    if (!key) return '';
    var d = parseDateKey(key);
    var months = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return d.getDate() + ' de ' + months[d.getMonth()] + ' de ' + d.getFullYear();
  }

  // ── HTML ESCAPE ───────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── COMPUTAR LISTA DE SLOTS A MOSTRAR ─────────────────────────────────
  // Combina SLOTS_FIJOS con los SLOTS_OPCIONALES habilitados, manteniendo
  // el orden litúrgico definido por `insertAfter`.
  function computeDisplaySlots() {
    var result = SLOTS_FIJOS.slice(); // copia
    SLOTS_OPCIONALES.forEach(function(opt) {
      if (enabledOptionals.indexOf(opt.id) === -1) return;
      // Encontrar la posición tras `insertAfter`
      var idx = -1;
      for (var i = 0; i < result.length; i++) {
        if (result[i].id === opt.insertAfter) { idx = i; break; }
      }
      if (idx === -1) {
        // Si no encuentra el ancla (ej. foto-5 sin foto-4), va al final
        // del bloque de fotos. Buscamos la última foto.
        for (var j = result.length - 1; j >= 0; j--) {
          if (result[j].id.indexOf('foto-') === 0) { idx = j; break; }
        }
        if (idx === -1) idx = result.length - 1;
      }
      // Insertar inmediatamente después
      var inserted = Object.assign({}, opt, { optional: true });
      result.splice(idx + 1, 0, inserted);
    });
    return result;
  }

  // ── RENDER DEL HEADER ─────────────────────────────────────────────────
  function renderHeader() {
    if (!headerEl) return;

    // Botón pin SVG (chinche) — mismo SVG que el setlist dominical para
    // coherencia visual. Posicionado absoluto en la esquina (CSS).
    // El estado .pinned se sincroniza vía updatePinUI() después del render.
    var pinBtn =
      '<button class="slb-pin-btn" id="slb-pin-btn" onclick="window.SLB.togglePin()" ' +
        'title="Mantener panel abierto" aria-label="Fijar panel">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M12 17v5"/>' +
          '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>' +
        '</svg>' +
      '</button>';

    if (!currentDate) {
      // Sin fecha seleccionada: mostrar invitación a elegir/crear
      headerEl.innerHTML =
        pinBtn +
        '<div class="slb-header-title">Setlist de Boda</div>' +
        '<div class="slb-header-empty">Selecciona una fecha para empezar</div>' +
        '<button class="slb-header-action" onclick="window.SLB.openDatePicker()">Elegir fecha</button>';
      updatePinUI();
      return;
    }

    // Con fecha activa: título + selector + nombres novios (si hay)
    var noviosLine = noviosNombres
      ? '<div class="slb-header-novios" data-action="edit-novios" title="Tap para editar">' +
        escapeHtml(noviosNombres) + '</div>'
      : '<button class="slb-header-novios-empty" data-action="edit-novios" ' +
        'title="Agregar nombres de los novios">+ Nombres de los novios</button>';

    headerEl.innerHTML =
      pinBtn +
      '<div class="slb-header-title">Setlist de Boda</div>' +
      '<button class="slb-header-date" onclick="window.SLB.openDatePicker()" title="Cambiar fecha">' +
        '<span class="slb-date-text">' + formatDateDisplay(currentDate) + '</span>' +
        '<span class="slb-date-chev">▾</span>' +
      '</button>' +
      noviosLine;

    // Listener para edición inline de nombres
    var noviosEl = headerEl.querySelector('[data-action="edit-novios"]');
    if (noviosEl) {
      noviosEl.addEventListener('click', editNovios);
    }

    // Sincronizar estado visual del pin tras el re-render
    updatePinUI();
  }

  // ── EDICIÓN INLINE DE NOMBRES DE NOVIOS ───────────────────────────────
  // Reemplaza el div/button por un input nativo. Al perder foco o presionar
  // Enter, guarda en Firebase. Tap fuera = cancelar (igual que blur).
  function editNovios() {
    if (!currentDate) return;
    var container = headerEl.querySelector('.slb-header-novios, .slb-header-novios-empty');
    if (!container) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'slb-header-novios-input';
    input.value = noviosNombres;
    input.placeholder = 'Ej: Carlos & María';
    input.maxLength = 60;

    container.replaceWith(input);
    input.focus();
    input.select();

    function commit() {
      var val = input.value.trim();
      noviosNombres = val;
      saveNovios(val);
      renderHeader();
    }
    function cancel() {
      renderHeader();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter')   { input.removeEventListener('blur', commit); commit(); }
      if (e.key === 'Escape')  { input.removeEventListener('blur', commit); cancel(); }
    });
  }

  // ── RENDER DE SLOTS ───────────────────────────────────────────────────
  function renderSlots() {
    if (!slotsEl) return;
    if (!currentDate) {
      // Sin fecha: panel vacío con mensaje (el header se encarga del CTA)
      slotsEl.innerHTML = '';
      if (footerEl) footerEl.innerHTML = '';
      return;
    }

    var displaySlots = computeDisplaySlots();
    var html = '';
    displaySlots.forEach(function(slot) {
      var label = slot.label + (slot.sub ? ' ' + slot.sub : '');
      var data  = setlistData[slot.id];
      var hasContent = !!data;
      var isInstrumental = hasContent && data.instrumental === true;

      var labelClickable = LABEL_TO_SECTION[slot.label]
        ? ' clickable" onclick="window.SLB.scrollToIndex(\'' + LABEL_TO_SECTION[slot.label] + '\')" title="Ir al índice'
        : '"';

      // Botón quitar slot opcional: aparece siempre en slots opcionales.
      var removeOptionalBtn = slot.optional
        ? '<button class="slb-remove-optional" onclick="window.SLB.removeOptional(\'' + slot.id + '\')" title="Quitar momento">&times;</button>'
        : '';

      // Botón "+ instrumental" — solo en slots marcados instrumentables Y vacíos.
      // Cuando ya hay contenido, el botón no aparece (para asignar otro,
      // primero hay que quitar el actual con la X).
      // Ícono: violín estilizado (SVG inline) — minimalista, line-based,
      // coherente con la estética del cancionero. NO usar emojis.
      var violinSvg =
        '<svg class="slb-inst-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          // Cuerpo del violín (forma "8" estilizada)
          '<path d="M9 13c0-2 1-3 3-3s3 1 3 3-1 3-3 3-3-1-3-3z"/>' +
          '<path d="M10 16c-.5.6-.5 1.5 0 2s1.5.5 2 0 .5-1.5 0-2"/>' +
          // Mástil
          '<path d="M13 10l4-7"/>' +
          '<path d="M16.5 3.5l1 1"/>' +
          // Cuerdas (líneas finas paralelas)
          '<line x1="11.5" y1="11.5" x2="14" y2="6.5" stroke-width="0.8"/>' +
          '<line x1="12.5" y1="12" x2="15" y2="7" stroke-width="0.8"/>' +
        '</svg>';

      var instBtn = (slot.instrumentable && !hasContent)
        ? '<button class="slb-inst-btn" onclick="window.SLB.promptInstrumental(\'' + slot.id + '\')" title="Marcar como instrumental">' +
          violinSvg +
          '<span class="slb-inst-text">inst.</span>' +
          '</button>'
        : '';

      if (hasContent && isInstrumental) {
        // Slot con instrumental asignado: render distinto (italic, sin link)
        // El violín aparece inline a la izquierda del título para señalar
        // visualmente que el momento es instrumental sin necesidad de leer.
        var inlineViolinSvg =
          '<svg class="slb-inst-icon-inline" viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
          'stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M9 13c0-2 1-3 3-3s3 1 3 3-1 3-3 3-3-1-3-3z"/>' +
            '<path d="M10 16c-.5.6-.5 1.5 0 2s1.5.5 2 0 .5-1.5 0-2"/>' +
            '<path d="M13 10l4-7"/>' +
            '<path d="M16.5 3.5l1 1"/>' +
            '<line x1="11.5" y1="11.5" x2="14" y2="6.5" stroke-width="0.8"/>' +
            '<line x1="12.5" y1="12" x2="15" y2="7" stroke-width="0.8"/>' +
          '</svg>';
        var clearBtn = '<button class="slb-remove" onclick="window.SLB.remove(\'' + slot.id + '\')" title="Quitar instrumental">&times;</button>';
        html += '<div class="slb-slot slb-slot-instrumental" data-moment="' + slot.label + '" data-title="' + escapeHtml(data.title) + '">' +
          '<span class="slb-moment' + labelClickable + '">' + label + '</span>' +
          '<span class="slb-song slb-song-instrumental" title="Instrumental">' +
            inlineViolinSvg + ' ' + escapeHtml(data.title) +
          '</span>' +
          clearBtn + removeOptionalBtn +
          '</div>';
      } else if (hasContent) {
        // Slot con canto del cancionero asignado (caso normal)
        var clearBtn2 = '<button class="slb-remove" onclick="window.SLB.remove(\'' + slot.id + '\')" title="Quitar canto">&times;</button>';
        html += '<div class="slb-slot" data-cpd="' + data.cpd + '" data-moment="' + slot.label + '" data-title="' + escapeHtml(data.title) + '">' +
          '<span class="slb-moment' + labelClickable + '">' + label + '</span>' +
          '<span class="slb-song" onclick="window.SLB.goTo(\'' + data.cpd + '\')">' + escapeHtml(data.title) + '</span>' +
          clearBtn2 + removeOptionalBtn +
          '</div>';
      } else {
        // Slot vacío. Si es instrumentable, agregamos el botón violín a la derecha.
        html += '<div class="slb-slot slb-slot-empty" data-moment="' + slot.label + '">' +
          '<span class="slb-moment' + labelClickable + '">' + label + '</span>' +
          '<span class="slb-song empty">— vacío —</span>' +
          instBtn + removeOptionalBtn +
          '</div>';
      }
    });
    slotsEl.innerHTML = html;

    // Footer: botón "+ agregar momento" solo si hay opcionales aún no agregados
    renderFooter();
  }

  // ── RENDER DEL FOOTER ─────────────────────────────────────────────────
  // Layout del footer (cuando hay fecha activa):
  //   ┌─ acciones del setlist ────────────────────────────────────┐
  //   │ [Borrar todo*]   [Exportar PDF**]   [💾 Grabar]            │
  //   │  *oculto en novios-mode (CSS, ver novios-mode.css)         │
  //   │  **solo visible en wedding-mode estricto (no novios-mode)  │
  //   └────────────────────────────────────────────────────────────┘
  //
  // El botón "Grabar" reenvía TODA la fecha activa a Firebase de una sola
  // vez, sirve como red de seguridad si por alguna razón un save individual
  // falló (ej. red intermitente). Muestra confirmación visual al terminar.
  // El botón "Grabar" reenvía TODA la fecha activa a Firebase de una sola
  // vez, sirve como red de seguridad si por alguna razón un save individual
  // falló (ej. red intermitente). Muestra confirmación visual al terminar.
  function renderFooter() {
    if (!footerEl) return;
    if (!currentDate) { footerEl.innerHTML = ''; return; }

    /* v3.6.6r1: SLOTS_OPCIONALES quedó vacío. La lógica que sigue se
       conserva por si en el futuro se vuelven a agregar slots opcionales,
       pero como `available` siempre será `[]` con el array vacío, en la
       práctica `optionalsHtml` queda como string vacío. La condición
       `if (available.length > 0)` evita renderizar el contenedor vacío. */
    var available = SLOTS_OPCIONALES.filter(function(opt) {
      return enabledOptionals.indexOf(opt.id) === -1;
    });

    var optionalsHtml = '';
    if (available.length > 0) {
      var optionsHtml = available.map(function(opt) {
        var label = opt.label + (opt.sub ? ' ' + opt.sub : '');
        return '<button class="slb-add-optional-btn" onclick="window.SLB.addOptional(\'' + opt.id + '\')">+ ' + label + '</button>';
      }).join('');
      optionalsHtml = '<div class="slb-footer-optionals">' + optionsHtml + '</div>';
    }

    // Acciones del setlist: Borrar todo (oculto en novios-mode via CSS)
    //                      + Exportar PDF (solo wedding-mode estricto)
    //                      + Grabar (oculto en novios-mode via CSS).
    // v3.6.6: el botón "Exportar PDF" se muestra en wedding-mode y novios-mode.
    // En novios-mode, el módulo 31 inyecta SU PROPIO botón "Exportar PDF" como
    // reemplazo del "Grabar" (que se oculta en CSS), así que aquí solo lo
    // mostramos cuando estamos en wedding-mode estricto y NO novios-mode.
    var isPureBodas = document.body.classList.contains('wedding-mode') &&
                      !document.body.classList.contains('novios-mode');
    var exportPdfBtnHtml = '';
    if (isPureBodas) {
      /* v3.6.6r6: ícono unificado con Importar (misma bandeja con flecha)
         pero con flecha hacia abajo para exportar. Texto compacto
         "Exp. PDF" para que los 3 botones quepan en una línea junto
         a "Borrar todo". */
      exportPdfBtnHtml =
        '<button class="slb-export-pdf" id="slb-export-pdf-btn" ' +
                'onclick="window.SLBPdf && window.SLBPdf.generateAndOpen({fecha: \'' + currentDate + '\'})" ' +
                'title="Generar PDF imprimible con metadata embebida">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true">' +
            '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
            '<polyline points="7 10 12 15 17 10"></polyline>' +
            '<line x1="12" y1="15" x2="12" y2="3"></line>' +
          '</svg>' +
          '<span>Exp. PDF</span>' +
        '</button>';
    }

    /* v3.6.6r3: Botón "Importar PDF" en Modo Bodas.
       Antes solo aparecía en Modo Dev, pero el flujo natural de uso es:
       los novios envían el PDF que generaron con sus selecciones, Renzo
       lo importa para tener el SetList en Firebase. Ese flujo no requiere
       Modo Dev — es trabajo regular del director de coro armando bodas
       futuras desde el panel de Bodas.

       Solo aparece si:
       - Modo Bodas activo (wedding-mode)
       - NO Modo Novios (los novios no importan PDFs, solo exportan)

       window.PDFImport debe estar disponible (módulo 33 cargado).
       Si no, el botón no se muestra. */
    var importPdfBtnHtml = '';
    if (isPureBodas) {
      importPdfBtnHtml =
        '<button class="pdfi-import-btn" id="pdfi-import-btn" ' +
                'onclick="window.PDFImport && window.PDFImport.importPdfFromFile()" ' +
                'title="Importar SetList desde un PDF generado por el sistema">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true">' +
            '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
            '<polyline points="17 8 12 3 7 8"></polyline>' +
            '<line x1="12" y1="3" x2="12" y2="15"></line>' +
          '</svg>' +
          '<span>Imp. PDF</span>' +
        '</button>';
    }

    var actionsHtml =
      '<div class="slb-footer-actions">' +
        '<button class="slb-clear" onclick="window.SLB.clearAll()">Borrar todo</button>' +
        exportPdfBtnHtml +
        importPdfBtnHtml +
        '<button class="slb-save" id="slb-save-btn" onclick="window.SLB.saveAll()" title="Forzar guardado en Firebase">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">' +
            '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>' +
            '<polyline points="17 21 17 13 7 13 7 21"/>' +
            '<polyline points="7 3 7 8 15 8"/>' +
          '</svg>' +
          '<span class="slb-save-label">Grabar</span>' +
        '</button>' +
      '</div>';

    /* v3.6.6r6: Botón "Eliminar Evento" — barra ancha al fondo del footer.
       Acción más destructiva que "Borrar todo": no solo limpia los slots,
       sino que elimina la entrada COMPLETA de Firebase (incluyendo _meta,
       novios, optionals). Casos de uso:
       - La pareja canceló la boda → liberar la fecha
       - Pruebas / testing
       - Eventos creados por error
       Solo aparece en wedding-mode estricto (no novios-mode) y cuando hay
       una fecha activa. Pide confirmación antes de ejecutar. */
    var deleteEventHtml = '';
    if (isPureBodas && currentDate) {
      deleteEventHtml =
        '<button class="slb-delete-event" onclick="window.SLB.deleteEvent()" ' +
                'title="Elimina por completo este evento de Firebase (libera la fecha)">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true">' +
            '<polyline points="3 6 5 6 21 6"></polyline>' +
            '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
            '<path d="M10 11v6"></path>' +
            '<path d="M14 11v6"></path>' +
            '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>' +
          '</svg>' +
          '<span>Eliminar Evento</span>' +
        '</button>';
    }

    footerEl.innerHTML = optionalsHtml + actionsHtml + deleteEventHtml;
  }

  // ── SLOTS OPCIONALES: AGREGAR / QUITAR ────────────────────────────────
  function addOptional(slotId) {
    if (enabledOptionals.indexOf(slotId) !== -1) return;
    enabledOptionals.push(slotId);
    saveOptionals();
    renderSlots();
  }

  function removeOptional(slotId) {
    var idx = enabledOptionals.indexOf(slotId);
    if (idx === -1) return;

    // Si el slot tiene canto asignado, confirmar antes de quitar
    if (setlistData[slotId]) {
      if (!window.confirm('Este momento tiene un canto asignado. ¿Quitarlo del setlist?')) {
        return;
      }
      removeSlot(slotId, true); // true = no rerender, lo hacemos abajo
    }

    enabledOptionals.splice(idx, 1);

    // Si era foto-4 y foto-5 está habilitada, también quitarla (cascada)
    if (slotId === 'foto-4' && enabledOptionals.indexOf('foto-5') !== -1) {
      var i5 = enabledOptionals.indexOf('foto-5');
      enabledOptionals.splice(i5, 1);
      if (setlistData['foto-5']) removeSlot('foto-5', true);
    }

    saveOptionals();
    renderSlots();
  }

  // ── LOAD (vía capa storage) ───────────────────────────────────────────
  // El nombre 'loadFromFirebase' se mantiene por compatibilidad histórica,
  // pero ahora delega en la capa storage que puede ser Firebase o
  // localStorage según el modo de operación.
  function loadFromFirebase(dateKey) {
    if (!dateKey) {
      setlistData = {};
      enabledOptionals = [];
      noviosNombres = '';
      renderHeader();
      renderSlots();
      return;
    }
    storage.loadAll(dateKey)
      .then(function(data) {
        setlistData = {};
        enabledOptionals = [];
        noviosNombres = '';

        if (data) {
          // _meta contiene novios y opcionales habilitados; los demás keys
          // son slot-ids con { cpd, title } o { instrumental: true, title }.
          if (data._meta) {
            if (typeof data._meta.novios === 'string') {
              noviosNombres = data._meta.novios;
            }
            if (Array.isArray(data._meta.optionals)) {
              enabledOptionals = data._meta.optionals.slice();
            }
          }

          // v3.6.4: filtramos slot-ids eliminados de versiones previas para
          // que los datos huérfanos en Firebase no se reescriban al guardar.
          // Cuando renderSlots() itera sólo sobre SLOTS_FIJOS+opcionales
          // habilitados, los huérfanos serían invisibles pero seguirían en
          // Firebase. Al filtrarlos aquí y al guardar (saveAll), eventualmente
          // desaparecen de Firebase la próxima vez que el usuario edite la fecha.
          var SLOTS_REMOVED_V364 = ['rito-matrimonial', 'salmo', 'canto-maria'];

          // También filtramos enabledOptionals si tenía 'salmo' o 'canto-maria'.
          enabledOptionals = enabledOptionals.filter(function(id) {
            return SLOTS_REMOVED_V364.indexOf(id) === -1;
          });

          Object.keys(data).forEach(function(slotId) {
            if (slotId === '_meta') return;
            if (SLOTS_REMOVED_V364.indexOf(slotId) !== -1) return; // ignorar huérfanos
            // Aceptar dos formatos válidos:
            //   { cpd: 'cpd-XXX', title: '...' }            → canto del cancionero
            //   { instrumental: true, title: '...' }        → pieza instrumental
            var entry = data[slotId];
            if (entry && (entry.cpd || entry.instrumental === true)) {
              setlistData[slotId] = entry;
            }
          });
        }
        renderHeader();
        renderSlots();
        console.log('[SLB] Cargado:', dateKey, '—', Object.keys(setlistData).length, 'cantos');
      })
      .catch(function(err) {
        console.warn('[SLB] Firebase load error:', err.message);
        renderHeader();
        renderSlots();
      });
  }

  // ── SAVE/REMOVE (vía capa storage) ────────────────────────────────────
  function saveSlot(slotId, cpd, title) {
    if (!currentDate) return;
    var data = { cpd: cpd, title: title };
    setlistData[slotId] = data;
    renderSlots();
    storage.saveSlot(currentDate, slotId, data).then(function() {
      console.log('[SLB] Guardado:', slotId, '→', title);
      // Asegurar que la fecha entró a availableDates
      if (availableDates.indexOf(currentDate) === -1) {
        availableDates.push(currentDate);
        availableDates.sort();
      }
    }).catch(function(err) {
      console.warn('[SLB] Save error:', err.message);
    });
  }

  // ── INSTRUMENTAL: prompt + save ─────────────────────────────────────
  // Para slots como Ingreso del Novio o Salida de Novios donde es común
  // tener una pieza instrumental sin canto del cancionero (ej. Marcha
  // Nupcial, Canon de Pachelbel). El usuario escribe el título manual.
  // Persiste en Firebase con flag `instrumental: true` para distinguirlo
  // de un canto regular del cancionero.
  function promptInstrumental(slotId) {
    if (!currentDate) return;
    var slot = SLOTS_FIJOS.concat(SLOTS_OPCIONALES).find(function(s) { return s.id === slotId; });
    if (!slot || !slot.instrumentable) return;

    // Pre-rellenar con título existente si ya había uno para este slot.
    var existing = setlistData[slotId];
    var initialValue = existing && existing.instrumental ? existing.title : '';

    // Prompt nativo — simple y consistente con la edición de nombres novios.
    // En r22+ podemos pasar a un dialog custom si el feedback lo amerita.
    var label = slot.label + (slot.sub ? ' ' + slot.sub : '');
    var title = window.prompt(
      '🎼 Instrumental para "' + label + '"\nEscribe el nombre (ej. Marcha Nupcial, Canon de Pachelbel):',
      initialValue
    );
    if (title === null) return; // cancel
    title = title.trim();
    if (!title) return; // vacío = no hacer nada

    saveInstrumental(slotId, title);
  }

  function saveInstrumental(slotId, title) {
    if (!currentDate) return;
    var data = { instrumental: true, title: title };
    setlistData[slotId] = data;
    renderSlots();
    storage.saveSlot(currentDate, slotId, data).then(function() {
      console.log('[SLB] Instrumental guardado:', slotId, '→', title);
      if (availableDates.indexOf(currentDate) === -1) {
        availableDates.push(currentDate);
        availableDates.sort();
      }
    }).catch(function(err) {
      console.warn('[SLB] Instrumental save error:', err.message);
    });
  }

  function removeSlot(slotId, skipRerender) {
    if (!currentDate) return;
    delete setlistData[slotId];
    if (!skipRerender) renderSlots();
    storage.removeSlot(currentDate, slotId).catch(function(err) {
      console.warn('[SLB] Delete error:', err.message);
    });
  }

  function saveNovios(value) {
    if (!currentDate) return;
    storage.saveMeta(currentDate, 'novios', value).catch(function(err) {
      console.warn('[SLB] Novios save error:', err.message);
    });
  }

  function saveOptionals() {
    if (!currentDate) return;
    storage.saveMeta(currentDate, 'optionals', enabledOptionals).catch(function(err) {
      console.warn('[SLB] Optionals save error:', err.message);
    });
  }

  // ── GRABAR TODO (reenvío explícito a Firebase) ──────────────────────
  // El botón "Grabar" del footer llama esta función. Reenvía TODA la fecha
  // activa de una sola vez con un PUT al nodo /setlist-bodas/{fecha}.
  // Esto sirve como:
  //   1. Red de seguridad: si algún save individual falló por red
  //      intermitente, esto reenvía todo el estado consistente.
  //   2. Feedback visual: el usuario obtiene confirmación explícita
  //      ("✓ Grabado") tras la operación. Útil porque el auto-save
  //      por slot es silencioso.
  // No reemplaza al auto-save — es complementario.
  function saveAll() {
    if (!currentDate) {
      window.alert('No hay fecha activa para grabar.');
      return;
    }

    var btn = document.getElementById('slb-save-btn');
    var labelEl = btn ? btn.querySelector('.slb-save-label') : null;
    var originalLabel = labelEl ? labelEl.textContent : 'Grabar';

    // Estado visual: "Grabando..."
    if (btn) btn.classList.add('saving');
    if (labelEl) labelEl.textContent = 'Grabando...';

    // Construir payload completo: slots + _meta. Firebase con PUT en el
    // nodo padre reemplaza todo el contenido — así el estado en remoto
    // queda exactamente igual al local, eliminando cualquier inconsistencia.
    var payload = {};
    Object.keys(setlistData).forEach(function(slotId) {
      payload[slotId] = setlistData[slotId];
    });
    payload._meta = {
      novios:    noviosNombres,
      optionals: enabledOptionals
    };

    storage.saveAll(currentDate, payload).then(function() {
      // Asegurar que la fecha está en availableDates
      if (availableDates.indexOf(currentDate) === -1) {
        availableDates.push(currentDate);
        availableDates.sort();
      }
      // Confirmación visual: cambiar label a "✓ Grabado" por 2s
      if (btn) {
        btn.classList.remove('saving');
        btn.classList.add('saved');
      }
      if (labelEl) labelEl.textContent = '✓ Grabado';
      console.log('[SLB] Grabado completo:', currentDate, '·', Object.keys(setlistData).length, 'cantos');

      setTimeout(function() {
        if (btn) btn.classList.remove('saved');
        if (labelEl) labelEl.textContent = originalLabel;
      }, 2000);
    }).catch(function(err) {
      console.error('[SLB] Save error:', err.message);
      if (btn) {
        btn.classList.remove('saving');
        btn.classList.add('error');
      }
      if (labelEl) labelEl.textContent = '✗ Error';
      setTimeout(function() {
        if (btn) btn.classList.remove('error');
        if (labelEl) labelEl.textContent = originalLabel;
      }, 3000);
    });
  }

  function clearAll() {
    if (!currentDate) return;
    if (!window.confirm('¿Borrar todos los cantos de esta boda?')) return;
    setlistData = {};
    enabledOptionals = [];
    renderSlots();
    // Borramos solo los slots, dejando _meta.novios intacto
    storage.loadAll(currentDate)
      .then(function(data) {
        var meta = data && data._meta ? data._meta : null;
        var newData = meta ? { _meta: { novios: meta.novios || '', optionals: [] } } : null;
        return storage.saveAll(currentDate, newData);
      })
      .catch(function(err) {
        console.warn('[SLB] Clear error:', err.message);
      });
  }

  /* v3.6.6r6: Eliminar evento completo.
     Diferencia con clearAll:
       - clearAll: limpia slots, mantiene fecha + _meta (novios) en Firebase.
       - deleteEvent: borra TODA la entrada de Firebase. La fecha desaparece
         del listado y queda libre para crear otra boda nueva.
     Casos de uso: pareja canceló la boda, evento creado por error, pruebas. */
  function deleteEvent() {
    if (!currentDate) return;

    var confirmMsg = '¿Eliminar por completo el evento del ' + currentDate + '?\n\n' +
                     'Esta acción borra TODO de Firebase: slots, novios, configuración.\n' +
                     'La fecha quedará libre para crear una boda nueva.\n\n' +
                     'Esta acción NO se puede deshacer.';

    if (!window.confirm(confirmMsg)) return;

    var dateBeingDeleted = currentDate;

    storage.deleteAll(dateBeingDeleted)
      .then(function() {
        console.log('[SLB] Evento eliminado:', dateBeingDeleted);

        // Limpiar estado en memoria
        setlistData = {};
        enabledOptionals = [];
        noviosNombres = '';
        currentDate = null;

        // Limpiar la fecha persistida
        try { localStorage.removeItem('pdSlbDate'); } catch (e) {}

        // Recargar lista de fechas y volver al picker
        return loadAvailableDates();
      })
      .then(function() {
        currentView = 'date-picker';
        renderSlots();
        renderFooter();
        renderHeader();

        window.alert('Evento eliminado correctamente. La fecha ' + dateBeingDeleted +
                     ' está libre nuevamente.');
      })
      .catch(function(err) {
        console.error('[SLB] Delete event error:', err);
        window.alert('Error eliminando el evento: ' + (err.message || err));
      });
  }

  // ── CARGAR LISTA DE FECHAS DISPONIBLES (vía capa storage) ─────────────
  function loadAvailableDates() {
    return storage.listDates()
      .then(function(dates) {
        availableDates = dates.filter(function(k) {
          // Validar formato YYYY-MM-DD para defenderse de claves corruptas
          return /^\d{4}-\d{2}-\d{2}$/.test(k);
        }).sort();
        console.log('[SLB] Fechas disponibles:', availableDates.length);
      })
      .catch(function(err) {
        console.warn('[SLB] List error:', err.message);
        availableDates = [];
      });
  }

  // ── DATE PICKER (vista de calendario) ─────────────────────────────────
  // Se renderiza en el área de slots cuando currentView = 'date-picker'.
  // Muestra un calendario mensual con las fechas guardadas resaltadas.
  // Tap en fecha guardada = cargar esa fecha. Botón "+ Nueva fecha" abajo
  // abre input nativo.
  var pickerYear, pickerMonth; // Estado del mes mostrado en picker

  function openDatePicker() {
    currentView = 'date-picker';
    // Inicializar al mes actual o al de la fecha activa
    var today = new Date();
    if (currentDate) {
      var d = parseDateKey(currentDate);
      pickerYear  = d.getFullYear();
      pickerMonth = d.getMonth();
    } else {
      pickerYear  = today.getFullYear();
      pickerMonth = today.getMonth();
    }
    renderDatePicker();
  }

  function closeDatePicker() {
    currentView = 'main';
    renderHeader();
    renderSlots();
  }

  function pickerPrevMonth() {
    pickerMonth--;
    if (pickerMonth < 0) { pickerMonth = 11; pickerYear--; }
    renderDatePicker();
  }
  function pickerNextMonth() {
    pickerMonth++;
    if (pickerMonth > 11) { pickerMonth = 0; pickerYear++; }
    renderDatePicker();
  }

  function renderDatePicker() {
    if (!slotsEl) return;
    var months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    /* v3.6.6r5: semana domingo-sábado (formato más familiar en Latinoamérica
       para calendarios impresos). Antes usábamos lunes-domingo (ISO 8601 /
       europeo) pero los usuarios están acostumbrados al formato D-L-M-M-J-V-S
       de calendarios impresos y aplicaciones móviles latinoamericanas. */
    var dayShort = ['D','L','M','M','J','V','S'];

    // Primer día del mes y total días
    var firstDay = new Date(pickerYear, pickerMonth, 1);
    var firstDow = firstDay.getDay(); // 0=Dom, 1=Lun... ya es lo que necesitamos
    var daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();

    // Header del header (header del panel queda en blanco para más espacio)
    headerEl.innerHTML =
      '<button class="slb-picker-back" onclick="window.SLB.closeDatePicker()" title="Volver">←</button>' +
      '<div class="slb-picker-title">Selecciona una fecha</div>';

    // Construcción del grid del calendario
    var html = '<div class="slb-picker-nav">' +
      '<button class="slb-picker-nav-btn" onclick="window.SLB.pickerPrev()">‹</button>' +
      '<span class="slb-picker-month">' + months[pickerMonth] + ' ' + pickerYear + '</span>' +
      '<button class="slb-picker-nav-btn" onclick="window.SLB.pickerNext()">›</button>' +
    '</div>';

    html += '<div class="slb-picker-grid">';
    dayShort.forEach(function(d) {
      html += '<div class="slb-picker-dayhead">' + d + '</div>';
    });

    // Casillas vacías antes del primer día
    for (var i = 0; i < firstDow; i++) {
      html += '<div class="slb-picker-cell empty"></div>';
    }
    // Días del mes
    for (var day = 1; day <= daysInMonth; day++) {
      var key = pickerYear + '-' + pad(pickerMonth + 1) + '-' + pad(day);
      var hasSetlist = availableDates.indexOf(key) !== -1;
      var isCurrent  = (key === currentDate);
      var classes = 'slb-picker-cell';
      if (hasSetlist) classes += ' has-setlist';
      if (isCurrent)  classes += ' current';
      var clickHandler = hasSetlist
        ? 'window.SLB.selectDate(\'' + key + '\')'
        : '';
      var title = hasSetlist
        ? 'Setlist guardado: ' + formatDateDisplay(key)
        : 'Sin setlist (usa "+ Nueva fecha" abajo)';
      html += '<div class="' + classes + '"' +
              (clickHandler ? ' onclick="' + clickHandler + '"' : '') +
              ' title="' + title + '">' + day + '</div>';
    }
    html += '</div>';

    // Botón nueva fecha (abre input date nativo)
    html += '<div class="slb-picker-new">' +
      '<button class="slb-picker-new-btn" onclick="window.SLB.promptNewDate()">+ Nueva fecha</button>' +
      '</div>';

    slotsEl.innerHTML = html;
    if (footerEl) footerEl.innerHTML = '';
  }

  // ── CREAR NUEVA FECHA ─────────────────────────────────────────────────
  // Usamos un input date nativo (oculto) que se dispara con un click
  // programático. Esto da el picker nativo del browser/SO.
  function promptNewDate() {
    var input = document.createElement('input');
    input.type = 'date';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    // En navegadores móviles el evento change dispara al elegir
    input.addEventListener('change', function() {
      var val = input.value; // formato YYYY-MM-DD
      document.body.removeChild(input);
      if (!val) return;
      // Crear fecha (con setlist vacío en Firebase) y seleccionarla
      createNewDate(val);
    });

    // Si el usuario cancela el picker nativo, eliminamos el input
    setTimeout(function() {
      // Heurística: si tras 30s sigue en DOM, probablemente cancelaron
      if (input.parentNode) {
        try { input.parentNode.removeChild(input); } catch (e) {}
      }
    }, 30000);

    // Disparar el picker nativo
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); } catch (e) { input.click(); }
    } else {
      input.click();
    }
  }

  function createNewDate(dateKey) {
    if (availableDates.indexOf(dateKey) === -1) {
      availableDates.push(dateKey);
      availableDates.sort();
    }
    selectDate(dateKey);
  }

  function selectDate(dateKey) {
    currentDate = dateKey;
    currentView = 'main';
    // Persistir en localStorage para sobrevivir refreshes. La fecha es lo
    // único que necesita persistir aquí — el setlist en sí vive en Firebase
    // y se recarga llamando a loadFromFirebase con esta fecha.
    try { localStorage.setItem('pdSlbDate', dateKey); } catch (e) {}
    loadFromFirebase(dateKey);
  }

  // ── ABRIR / CERRAR PANEL ──────────────────────────────────────────────
  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    overlay.classList.add('open');
    if (tab) tab.classList.add('slb-tab-hidden');
    // v3.6.0r6: si hay edge-tab del Modo Novios visible, ocultarlo
    // mientras el panel está abierto (no tiene sentido que ambos compitan).
    var slnEdge = document.getElementById('sln-edge');
    if (slnEdge) slnEdge.classList.add('sln-edge-hidden');

    // Si no hay fecha activa pero hay disponibles, pre-seleccionar la
    // más cercana a hoy (la primera futura, o la última si todas son pasadas).
    if (!currentDate && availableDates.length > 0) {
      var todayKey = formatDateKey(new Date());
      var nextDate = availableDates.find(function(d) { return d >= todayKey; });
      var fallback = availableDates[availableDates.length - 1];
      selectDate(nextDate || fallback);
    } else if (currentView === 'main') {
      renderHeader();
      renderSlots();
    } else {
      renderDatePicker();
    }
  }
  function closePanel() {
    // Respetar el pin: si el usuario fijó el panel, ningún cierre auto
    // (click outside, swipe, Esc) debe afectarlo. Solo se cierra
    // explícitamente con togglePin() primero, o con close() forzado
    // (ej. desde activateWedding del módulo 29 al cambiar de modo,
    // que tiene prioridad sobre el pin).
    if (isPinned) return;
    isOpen = false;
    panel.classList.remove('open');
    overlay.classList.remove('open');
    if (tab) tab.classList.remove('slb-tab-hidden');
    // v3.6.0r6: re-mostrar el edge-tab del Modo Novios al cerrar el panel
    var slnEdge = document.getElementById('sln-edge');
    if (slnEdge) slnEdge.classList.remove('sln-edge-hidden');
  }

  // Cierre forzoso: ignora el pin. Usado por el módulo 29 al desactivar
  // wedding-mode (porque el panel ya no debe estar visible en ningún caso).
  function forceClosePanel() {
    isOpen = false;
    panel.classList.remove('open');
    overlay.classList.remove('open');
    if (tab) tab.classList.remove('slb-tab-hidden');
    // v3.6.0r6: re-mostrar el edge del Modo Novios al force-close
    var slnEdge2 = document.getElementById('sln-edge');
    if (slnEdge2) slnEdge2.classList.remove('sln-edge-hidden');
  }
  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  // ── PIN PANEL ─────────────────────────────────────────────────────────
  // Mismo patrón que el setlist dominical (módulo 23): el pin mantiene el
  // panel abierto bloqueando los cierres por click outside, swipe out y
  // tecla Escape. Persiste en localStorage como pdSlbPinned para que la
  // preferencia sobreviva refreshes.
  function togglePin() {
    isPinned = !isPinned;
    updatePinUI();
    try {
      if (isPinned) localStorage.setItem(PIN_KEY, '1');
      else          localStorage.removeItem(PIN_KEY);
    } catch (e) {}
  }
  function updatePinUI() {
    var btn = document.getElementById('slb-pin-btn');
    if (!btn) return;
    btn.classList.toggle('pinned', isPinned);
    btn.title = isPinned ? 'Panel fijo (click para soltar)' : 'Mantener panel abierto';
    // Cuando está pineado, oculta el overlay para permitir interacción
    // con el cancionero detrás del panel (especialmente útil en desktop).
    if (overlay) {
      if (isPinned) overlay.classList.add('slb-overlay-pinned');
      else          overlay.classList.remove('slb-overlay-pinned');
    }
  }
  function restorePinState() {
    try {
      isPinned = localStorage.getItem(PIN_KEY) === '1';
    } catch (e) { isPinned = false; }
    updatePinUI();
    // Si el panel estaba pineado Y un modo compatible está activo, abre auto.
    // Modos compatibles: wedding-mode (Modo Bodas, uso original) y
    // novios-mode (Modo Novios, agregado en v3.6.0).
    // La doble guardia (rehearsal-mode no debe estar) evita que se abra
    // si el modo coro está activo simultáneamente por race condition.
    var isCompatibleMode =
      document.body.classList.contains('wedding-mode') ||
      document.body.classList.contains('novios-mode');
    if (isPinned &&
        isCompatibleMode &&
        !document.body.classList.contains('rehearsal-mode')) {
      openPanel();
    }
  }

  // ── NAVEGACIÓN AL ÍNDICE / CANTO ──────────────────────────────────────
  function scrollToIndex(sectionId) {
    closePanel();
    var indexEl = document.getElementById('dominical-index');
    if (!indexEl) return;
    var sectionInIndex = indexEl.querySelector('[data-section="' + sectionId + '"]');
    if (sectionInIndex) {
      sectionInIndex.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      indexEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function goToSong(cpd) {
    closePanel();
    var card = document.querySelector('[data-chord-id="' + cpd + '"]');
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── DETECCIÓN DE MOMENT (para sugerencia en dialog) ───────────────────
  function detectMoment(card) {
    var momentEl = card.querySelector('.song-moment-label');
    var momentText = momentEl ? momentEl.textContent.trim() : '';
    return TAG_MAP[momentText] || null;
  }

  // ── DIALOG "AGREGAR AL SETLIST DE BODA" ───────────────────────────────
  function openAddDialog(cpd, title, suggestedMoment) {
    if (!currentDate) {
      window.alert('Primero selecciona una fecha de boda.');
      openPanel();
      openDatePicker();
      return;
    }

    pendingAdd = { cpd: cpd, title: title };
    dialogSongEl.textContent = '\u00ab' + title + '\u00bb';

    // Mostrar TODOS los slots disponibles (fijos + opcionales habilitados)
    var displaySlots = computeDisplaySlots();
    var html = '';
    displaySlots.forEach(function(slot) {
      var label = slot.label + (slot.sub ? ' ' + slot.sub : '');
      var current = setlistData[slot.id] ? setlistData[slot.id].title : '';
      var isSuggested = suggestedMoment && slot.id === suggestedMoment;
      html += '<button class="slb-dialog-slot-btn' + (isSuggested ? ' suggested' : '') + '" onclick="window.SLB.confirmAdd(\'' + slot.id + '\')">' +
        '<span>' + label + (isSuggested ? ' \u2190' : '') + '</span>' +
        (current ? '<span class="slb-btn-current">' + escapeHtml(current) + '</span>' : '') +
        '</button>';
    });
    dialogSlotsEl.innerHTML = html;
    dialogOverlay.classList.add('open');
  }

  function confirmAdd(slotId) {
    if (!pendingAdd) return;
    saveSlot(slotId, pendingAdd.cpd, pendingAdd.title);
    closeDialog();
  }

  function closeDialog() {
    dialogOverlay.classList.remove('open');
    pendingAdd = null;
  }

  // ── ADD SONG (entry point del botón "+") ──────────────────────────────
  function addSong(cpd) {
    var card = document.querySelector('[data-chord-id="' + cpd + '"]');
    if (!card) return;
    // Extraer título (mismo patrón del módulo 23)
    var title = '';
    if (card.dataset && card.dataset.title) {
      title = card.dataset.title;
    } else {
      var titleEl = card.querySelector('.song-title');
      if (titleEl) {
        var titleTextEl = titleEl.querySelector('.song-title-text');
        if (titleTextEl) {
          title = titleTextEl.textContent;
        } else {
          titleEl.childNodes.forEach(function(n) {
            if (n.nodeType === 3) title += n.textContent;
          });
        }
      }
    }
    title = title.trim();
    var moment = detectMoment(card);
    openAddDialog(cpd, title, moment);
  }

  // ── INIT ──────────────────────────────────────────────────────────────
  function init() {
    bindElements();
    if (!panel) {
      console.warn('[SLB] Panel DOM no encontrado — markup faltante');
      return;
    }

    // Restaurar fecha activa de la sesión anterior (si existe).
    // Sin esto, currentDate quedaba null tras refresh y el usuario tenía que
    // re-seleccionar la fecha cada vez. Bug histórico v3.3.0r4 — corregido r5.
    var savedDate = null;
    try { savedDate = localStorage.getItem('pdSlbDate'); } catch (e) {}

    loadAvailableDates().then(function() {
      // Si había una fecha guardada Y existe en Firebase, la cargamos
      // automáticamente. Si la fecha guardada ya no tiene setlist (alguien
      // la borró), limpiamos la persistencia y dejamos que el usuario elija.
      if (savedDate && availableDates.indexOf(savedDate) !== -1) {
        currentDate = savedDate;
        loadFromFirebase(savedDate);
      } else {
        if (savedDate) {
          // La fecha guardada ya no existe — limpiar
          try { localStorage.removeItem('pdSlbDate'); } catch (e) {}
        }
        renderHeader();
        renderSlots();
      }
      // Restaurar pin después del render (necesita el botón ya en DOM).
      // Si el pin estaba activo y wedding-mode también, el panel se abre auto.
      restorePinState();
    });

    // Click outside del dialog cierra
    if (dialogOverlay) {
      dialogOverlay.addEventListener('click', function(e) {
        if (e.target === dialogOverlay) closeDialog();
      });
    }

    // Swipe desde el borde izquierdo (solo en wedding-mode)
    document.addEventListener('touchstart', function(e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
      if (!document.body.classList.contains('wedding-mode')) return;
      // Si SL (dominical) está pineado u abierto, dejarlo manejar
      if (window.SL && window.SL.isPinned && window.SL.isPinned()) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (!isOpen && touchStartX < 30 && dx > 60)  openPanel();
      else if (isOpen && dx < -60)                 closePanel();
    }, { passive: true });

    // Escape cierra
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) closePanel();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────
  window.SLB = {
    open:           openPanel,
    // close: cierre forzoso (ignora pin). Usado por el módulo 29 al
    // desactivar wedding-mode. Para cierre que respete el pin, usar
    // closePanel internamente (vía Esc, swipe, click outside).
    close:          forceClosePanel,
    toggle:         togglePanel,
    goTo:           goToSong,
    remove:         function(slotId) { removeSlot(slotId, false); },
    clearAll:       clearAll,
    deleteEvent:    deleteEvent,
    saveAll:        saveAll,
    scrollToIndex:  scrollToIndex,
    addSong:        addSong,
    confirmAdd:     confirmAdd,
    closeDialog:    closeDialog,
    addOptional:    addOptional,
    removeOptional: removeOptional,

    // Pin del panel (mantener abierto)
    togglePin:      togglePin,
    isPinned:       function() { return isPinned; },

    // Instrumentales (slots como Ingreso del Novio, Salida de Novios)
    promptInstrumental: promptInstrumental,

    // Date picker
    openDatePicker:  openDatePicker,
    closeDatePicker: closeDatePicker,
    pickerPrev:      pickerPrevMonth,
    pickerNext:      pickerNextMonth,
    selectDate:      selectDate,
    promptNewDate:   promptNewDate,

    /* v3.6.6: getCurrentSetlist devuelve un snapshot del estado interno
       del SLB (setlistData + meta) para que módulos externos como
       SLBPdf (módulo 32) puedan generar PDFs sin tocar internals. El
       objeto devuelto es un clon defensivo: mutaciones no afectan al
       estado del SLB. */
    getCurrentSetlist: function() {
      return {
        fecha:     currentDate,
        novios:    noviosNombres,
        slots:     JSON.parse(JSON.stringify(setlistData)),
        optionals: enabledOptionals.slice()
      };
    },

    /* v3.6.6: loadDate es alias de selectDate para que el módulo 33
       (importador PDF) pueda cargar una fecha programáticamente
       después de escribir a Firebase. selectDate ya hace todo lo
       necesario (persiste localStorage, llama loadFromFirebase). */
    loadDate: selectDate,

    /* v3.6.6: para que el importador (módulo 33) pueda escribir un
       SetList completo a Firebase de una vez. Recibe un objeto
       compatible con saveAll del backend. */
    saveSetlistData: function(dateKey, data) {
      return storage.saveAll(dateKey, data);
    },

    /* v3.6.6: para que el importador pueda preguntar si una fecha
       ya tiene SetList guardado (decidir sobrescribir vs crear adicional). */
    hasDateInStorage: function(dateKey) {
      return storage.loadAll(dateKey).then(function(data) {
        if (!data) return false;
        // Considerar que existe solo si tiene al menos un slot con cpd
        var keys = Object.keys(data).filter(function(k) {
          return k !== '_meta' && data[k] && (data[k].cpd || data[k].instrumental);
        });
        return keys.length > 0;
      });
    },

    // Estado (para módulos consumidores ej. event delegation)
    isActive: function() {
      // v3.6.0: el panel SLB se considera activo en Modo Bodas (wedding-mode)
      // o Modo Novios (novios-mode). Cualquiera de las dos clases en el body
      // habilita el panel. Esto es necesario porque el módulo 31 (SetList
      // Novios) reutiliza el panel SLB en Modo Novios.
      return document.body.classList.contains('wedding-mode') ||
             document.body.classList.contains('novios-mode');
    }
  };

})();
