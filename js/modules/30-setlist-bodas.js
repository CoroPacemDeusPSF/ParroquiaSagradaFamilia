/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/30-setlist-bodas.js
 *   @brief      Panel SetList lateral para Bodas — picker de fecha, slots opcionales, Firebase
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.3.0r6
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
     17 slots fijos en orden litúrgico de boda católica:
       Ingreso del Novio → Entrada de la Novia → Piedad → Gloria →
       (Salmo opcional) → Evangelio → Ofertorio → Santo → Cordero →
       Rito Matrimonial → Comunión → Firma del Pliego →
       (Canto a María opcional) → Foto 1, 2, 3 → (Foto 4, 5 opcionales) →
       Salida de Novios.

     Los slots opcionales (Salmo, Canto a María, Foto 4, Foto 5) NO se
     muestran por defecto. Se agregan vía botón "+ agregar momento" en
     el footer del panel. Se quitan vía botón "X" inline.

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
    /* Rito Matrimonial entre la Liturgia de la Palabra (Evangelio) y la
       Liturgia Eucarística (Ofertorio): orden litúrgico correcto del Rito
       del Matrimonio dentro de la Misa según el Ritual Romano — el
       sacramento se celebra después de la homilía y antes de las plegarias
       universales / ofertorio. */
    { id: 'rito-matrimonial', label: 'Rito Matrimonial'    },
    { id: 'ofertorio',        label: 'Ofertorio'           },
    { id: 'santo',            label: 'Santo'               },
    { id: 'cordero',          label: 'Cordero de Dios'     },
    { id: 'comunion',         label: 'Comunión'            },
    { id: 'firma-pliego',     label: 'Firma del Pliego'    },
    { id: 'foto-1',           label: 'Fotografía',  sub: '1' },
    { id: 'foto-2',           label: 'Fotografía',  sub: '2' },
    { id: 'foto-3',           label: 'Fotografía',  sub: '3' },
    { id: 'salida',           label: 'Salida de Novios',    instrumentable: true }
  ];

  // Slots opcionales y dónde se insertan en el orden visual.
  // - 'salmo'      va después de 'gloria' (antes del evangelio).
  // - 'canto-maria' va después de 'firma-pliego' (antes de las fotos).
  // - 'foto-4'    va después de 'foto-3'.
  // - 'foto-5'    va después de 'foto-4' (o foto-3 si foto-4 no está).
  var SLOTS_OPCIONALES = [
    { id: 'salmo',       label: 'Salmo',         insertAfter: 'gloria' },
    { id: 'canto-maria', label: 'Canto a María', insertAfter: 'firma-pliego' },
    { id: 'foto-4',      label: 'Fotografía', sub: '4', insertAfter: 'foto-3' },
    { id: 'foto-5',      label: 'Fotografía', sub: '5', insertAfter: 'foto-4' }
  ];

  // Mapa de label → id de sección del cancionero (clic en label navega).
  // Para bodas, los moments litúrgicos del cancionero son los mismos que
  // los dominicales, así que reusamos los mismos targets.
  var LABEL_TO_SECTION = {
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

    if (!currentDate) {
      // Sin fecha seleccionada: mostrar invitación a elegir/crear
      headerEl.innerHTML =
        '<div class="slb-header-title">Setlist de Boda</div>' +
        '<div class="slb-header-empty">Selecciona una fecha para empezar</div>' +
        '<button class="slb-header-action" onclick="window.SLB.openDatePicker()">Elegir fecha</button>';
      return;
    }

    // Con fecha activa: título + selector + nombres novios (si hay)
    var noviosLine = noviosNombres
      ? '<div class="slb-header-novios" data-action="edit-novios" title="Tap para editar">' +
        escapeHtml(noviosNombres) + '</div>'
      : '<button class="slb-header-novios-empty" data-action="edit-novios" ' +
        'title="Agregar nombres de los novios">+ Nombres de los novios</button>';

    headerEl.innerHTML =
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
  //   ┌─ slots opcionales por agregar ──────────────────────────────┐
  //   │ [+ Salmo] [+ Canto a María] [+ Foto 4]                     │
  //   └────────────────────────────────────────────────────────────┘
  //   ┌─ acciones del setlist ────────────────────────────────────┐
  //   │              [Borrar todo]      [💾 Grabar]               │
  //   └────────────────────────────────────────────────────────────┘
  //
  // El botón "Grabar" reenvía TODA la fecha activa a Firebase de una sola
  // vez, sirve como red de seguridad si por alguna razón un save individual
  // falló (ej. red intermitente). Muestra confirmación visual al terminar.
  function renderFooter() {
    if (!footerEl) return;
    if (!currentDate) { footerEl.innerHTML = ''; return; }

    var available = SLOTS_OPCIONALES.filter(function(opt) {
      // foto-5 solo si foto-4 ya está habilitada (orden secuencial)
      if (opt.id === 'foto-5' && enabledOptionals.indexOf('foto-4') === -1) return false;
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

    // Acciones del setlist: Borrar todo (izq) + Grabar (der)
    var actionsHtml =
      '<div class="slb-footer-actions">' +
        '<button class="slb-clear" onclick="window.SLB.clearAll()">Borrar todo</button>' +
        '<button class="slb-save" id="slb-save-btn" onclick="window.SLB.saveAll()" title="Forzar guardado en Firebase">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">' +
            '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>' +
            '<polyline points="17 21 17 13 7 13 7 21"/>' +
            '<polyline points="7 3 7 8 15 8"/>' +
          '</svg>' +
          '<span class="slb-save-label">Grabar</span>' +
        '</button>' +
      '</div>';

    footerEl.innerHTML = optionalsHtml + actionsHtml;
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

  // ── FIREBASE: LOAD ────────────────────────────────────────────────────
  function loadFromFirebase(dateKey) {
    if (!dateKey) {
      setlistData = {};
      enabledOptionals = [];
      noviosNombres = '';
      renderHeader();
      renderSlots();
      return;
    }
    fetch(FIREBASE_URL + FB_BASE + '/' + dateKey + '.json')
      .then(function(r) { return r.json(); })
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
          Object.keys(data).forEach(function(slotId) {
            if (slotId === '_meta') return;
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

  // ── FIREBASE: SAVE/REMOVE ─────────────────────────────────────────────
  function saveSlot(slotId, cpd, title) {
    if (!currentDate) return;
    setlistData[slotId] = { cpd: cpd, title: title };
    renderSlots();
    fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '/' + slotId + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpd: cpd, title: title })
    }).then(function() {
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
    fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '/' + slotId + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function() {
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
    fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '/' + slotId + '.json', {
      method: 'DELETE'
    }).catch(function(err) {
      console.warn('[SLB] Delete error:', err.message);
    });
  }

  function saveNovios(value) {
    if (!currentDate) return;
    fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '/_meta/novios.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    }).catch(function(err) {
      console.warn('[SLB] Novios save error:', err.message);
    });
  }

  function saveOptionals() {
    if (!currentDate) return;
    fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '/_meta/optionals.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enabledOptionals)
    }).catch(function(err) {
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

    fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function() {
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
    fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var meta = data && data._meta ? data._meta : null;
        var newData = meta ? { _meta: { novios: meta.novios || '', optionals: [] } } : null;
        return fetch(FIREBASE_URL + FB_BASE + '/' + currentDate + '.json', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newData)
        });
      })
      .catch(function(err) {
        console.warn('[SLB] Clear error:', err.message);
      });
  }

  // ── CARGAR LISTA DE FECHAS DISPONIBLES ────────────────────────────────
  function loadAvailableDates() {
    return fetch(FIREBASE_URL + FB_BASE + '.json?shallow=true')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data) { availableDates = []; return; }
        availableDates = Object.keys(data).filter(function(k) {
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
    var dayShort = ['L','M','M','J','V','S','D']; // semana lunes-domingo

    // Primer día del mes y total días
    var firstDay = new Date(pickerYear, pickerMonth, 1);
    var firstDow = firstDay.getDay(); // 0=Dom, 1=Lun...
    // Convertir a 0=Lun (formato europeo más natural en Latinoamérica)
    firstDow = (firstDow + 6) % 7;
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
    isOpen = false;
    panel.classList.remove('open');
    overlay.classList.remove('open');
    if (tab) tab.classList.remove('slb-tab-hidden');
  }
  function togglePanel() { isOpen ? closePanel() : openPanel(); }

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
    close:          closePanel,
    toggle:         togglePanel,
    goTo:           goToSong,
    remove:         function(slotId) { removeSlot(slotId, false); },
    clearAll:       clearAll,
    saveAll:        saveAll,
    scrollToIndex:  scrollToIndex,
    addSong:        addSong,
    confirmAdd:     confirmAdd,
    closeDialog:    closeDialog,
    addOptional:    addOptional,
    removeOptional: removeOptional,

    // Instrumentales (slots como Ingreso del Novio, Salida de Novios)
    promptInstrumental: promptInstrumental,

    // Date picker
    openDatePicker:  openDatePicker,
    closeDatePicker: closeDatePicker,
    pickerPrev:      pickerPrevMonth,
    pickerNext:      pickerNextMonth,
    selectDate:      selectDate,
    promptNewDate:   promptNewDate,

    // Estado (para módulos consumidores ej. event delegation)
    isActive: function() {
      return document.body.classList.contains('wedding-mode');
    }
  };

})();
