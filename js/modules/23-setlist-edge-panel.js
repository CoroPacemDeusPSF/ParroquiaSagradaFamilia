/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/23-setlist-edge-panel.js
 *   @brief      Panel SetList lateral (próximo domingo, Firebase, drag & drop)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.33
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   23-setlist-edge-panel.js
   ============================================================================
   SetList — edge tab + panel + datos litúrgicos

   MUY EXTENSO. Incluye los 171 domingos del JSON litúrgico (window.LITURGICAL_DATA), tab pulsante, panel desplegable, navegación al histórico.

   ORDEN DE CARGA: posición 23 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

/* ═══════════════════════════════════════════════════
   SETLIST EDGE PANEL — Coro Pacem Deus
   Visible: Modo Coro | Editable: Modo Dev
   Firebase: /setlist/{yyyy-mm-dd}/{slot-id}
═══════════════════════════════════════════════════ */
(function() {
  'use strict';

  /* ── SLOT DEFINITIONS ── */
  /* ── LITURGICAL CALENDAR ──
     Calcula el tiempo litúrgico de una fecha dada.
     Algoritmo de Pascua: Meeus/Jones/Butcher (válido para el calendario gregoriano). */
  function easterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  function diffDays(a, b) { return Math.round((a - b) / 86400000); }
  function getLiturgicalSeason(date) {
    var year = date.getFullYear();
    var easter = easterSunday(year);
    var ashWed = new Date(easter); ashWed.setDate(easter.getDate() - 46);
    var holyThu = new Date(easter); holyThu.setDate(easter.getDate() - 3);
    var holySat = new Date(easter); holySat.setDate(easter.getDate() - 1);
    var pentecost = new Date(easter); pentecost.setDate(easter.getDate() + 49);
    /* Adviento: 4 domingos antes de Navidad (25 dic) */
    var christmas = new Date(year, 11, 25);
    var advStart = new Date(christmas);
    var dow = christmas.getDay() === 0 ? 7 : christmas.getDay();
    advStart.setDate(christmas.getDate() - dow - 21);
    /* Bautismo del Señor: domingo después del 6 de enero (Epifanía) */
    var epiphany = new Date(year, 0, 6);
    var baptism = new Date(epiphany);
    var ed = epiphany.getDay();
    baptism.setDate(epiphany.getDate() + (ed === 0 ? 7 : 7 - ed));

    if (date >= holyThu && date <= holySat) return { name: 'Triduo Pascual', code: 'triduo' };
    if (date >= ashWed && date < holyThu) return { name: 'Cuaresma', code: 'cuaresma' };
    if (date >= easter && date <= pentecost) return { name: 'Tiempo Pascual', code: 'pascua' };
    if (date >= advStart && date < christmas) return { name: 'Adviento', code: 'adviento' };
    if (date >= christmas || date <= baptism) return { name: 'Navidad', code: 'navidad' };
    return { name: 'Tiempo Ordinario', code: 'ordinario' };
  }
  /* Reglas litúrgicas: ¿Aplica Gloria? ¿Aleluya? */
  function appliesGloria(season) {
    /* No Gloria en Adviento ni Cuaresma. Sí en Triduo (Jueves Santo y Vigilia Pascual). */
    return season.code !== 'adviento' && season.code !== 'cuaresma';
  }
  function appliesAleluya(season) {
    /* No Aleluya en Cuaresma (se sustituye por aclamación). */
    return season.code !== 'cuaresma';
  }
  /* Mes Mariano: solo mayo en Perú (octubre es Señor de los Milagros / mes morado). */
  function isMarianMonth(date) {
    return date.getMonth() === 4; /* mayo = 4 */
  }


  /* SLOTS canónicos. defaultEmpty=true → siempre se muestra como placeholder vacío.
     Los demás slots solo aparecen cuando tienen un canto asignado. */
  var SLOTS = [
    { id: 'entrada-1',  label: 'Entrada',   defaultEmpty: true },
    { id: 'entrada-2',  label: 'Entrada',   sub: '2' },
    { id: 'piedad',     label: 'Piedad',    defaultEmpty: true },
    { id: 'gloria',     label: 'Gloria',    defaultEmpty: true,  liturgical: 'gloria' },
    { id: 'evangelio',  label: 'Evangelio', defaultEmpty: true,  liturgical: 'aleluya' },
    { id: 'ofertorio-1',label: 'Ofertorio', defaultEmpty: true },
    { id: 'ofertorio-2',label: 'Ofertorio', sub: '2' },
    { id: 'santo',      label: 'Santo',     defaultEmpty: true },
    { id: 'cordero',    label: 'Cordero',   defaultEmpty: true },
    { id: 'comunion-1', label: 'Comunión',  defaultEmpty: true },
    { id: 'comunion-2', label: 'Comunión',  sub: '2' },
    { id: 'comunion-3', label: 'Comunión',  sub: '3' },
    { id: 'salida',     label: 'Salida',    defaultEmpty: true },
    { id: 'especial-1', label: 'Especial', sub: '1' },
    { id: 'especial-2', label: 'Especial', sub: '2' },
    { id: 'especial-3', label: 'Especial', sub: '3' },
    { id: 'especial-4', label: 'Especial', sub: '4' }
  ];

  /* Map de slot.label → id de sección en el cancionero (para clic en etiqueta) */
  var LABEL_TO_SECTION = {
    'Entrada':   'sec-entrada',
    'Piedad':    'sec-piedad',
    'Gloria':    'sec-gloria',
    'Evangelio': 'sec-aleluya',
    'Ofertorio': 'sec-ofertorio',
    'Santo':     'sec-santo',
    'Cordero':   'sec-cordero',
    'Comunión':  'sec-comunion',
    'Salida':    'sec-salida',
    'Especial':  'sec-momentos'
  };

  /* ── TAG → MOMENT MAPPING ── */
  var TAG_MAP = {
    'Entrada': 'entrada',
    'Piedad': 'piedad',
    'Gloria': 'gloria',
    'Aleluya': 'evangelio',
    'Aclamación del Evangelio': 'evangelio',
    'Ofertorio': 'ofertorio',
    'Santo': 'santo',
    'Cordero de Dios': 'cordero',
    'Comunión': 'comunion',
    'Adoración/Reflexión — Acción de Gracias': 'comunion',
    'Salida': 'salida',
    'Animación': 'especial',
    'Momentos especiales': 'especial',
    '✦ Momentos Especiales ✦': 'especial',
    'Exposición del Santísimo': 'especial',
    'Adoración eucarística': 'especial'
  };

  /* ── STATE ── */
  var setlistData = {}; // slot-id → { cpd, title }
  var isOpen = false;
  var isPinned = false;
  var touchStartX = 0;
  var PIN_KEY = 'pdSetlistPinned';

  /* ── ELEMENTS ── */
  var panel   = document.getElementById('sl-panel');
  var overlay = document.getElementById('sl-overlay');
  var tab     = document.getElementById('sl-tab');
  var slotsEl = document.getElementById('sl-slots');

  /* ── DATE HELPERS ── */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function getNextSunday() {
    var d = new Date();
    var dy = d.getDay();
    d.setDate(d.getDate() + (dy === 0 ? 0 : 7 - dy));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function formatDate(key) {
    var parts = key.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return d.getDate() + ' de ' + months[d.getMonth()] + ' de ' + d.getFullYear();
  }

  var SUNDAY_KEY = getNextSunday();
  var FB_PATH = '/setlist/' + SUNDAY_KEY;

  /* ── HELPERS DE BADGES ──
     "✦ Nuevo" reusa la misma lógica del cancionero: data-added en los últimos 60 días. */
  var NEW_DAYS = 60;
  function isNewSong(cpd) {
    var card = document.querySelector('[data-chord-id="' + cpd + '"]');
    if (!card || !card.dataset.added) return false;
    var added = new Date(card.dataset.added);
    if (isNaN(added.getTime())) return false;
    var diffMs = Date.now() - added.getTime();
    return diffMs <= NEW_DAYS * 86400000;
  }

  /* ── RENDER SLOTS ──
     Modo "actual": muestra placeholders por defecto + cantos asignados con advertencias.
     Modo "histórico": muestra solo los cantos que existieron en ese setlist, con botón "agregar al actual". */
  function renderSlots() {
    if (currentView === 'history') {
      renderHistoryView();
      return;
    }
    /* Determinar tiempo litúrgico del próximo domingo */
    var sundayDate = parseDateKey(SUNDAY_KEY);
    var season = getLiturgicalSeason(sundayDate);
    var isMarian = isMarianMonth(sundayDate);

    /* Nombre litúrgico exacto desde el objeto D del módulo de calendario.
       Si no existe el dato, cae al nombre genérico del tiempo. */
    var litData = (typeof window.LITURGICAL_DATA === 'object' && window.LITURGICAL_DATA[SUNDAY_KEY]) || null;
    var liturgicalName = litData && litData.n ? litData.n : season.name;

    /* Tema del evangelio del domingo: ahora ocupa la POSICIÓN SUPERIOR (heredando el
       estilo prominente Cormorant 600 1.05rem). El tema, como cita escritural, se
       convierte en el "headline" espiritual del setlist actual. */
    var titleContent = (litData && litData.tema)
      ? '&ldquo;' + litData.tema + '&rdquo;'
      : liturgicalName;  /* fallback defensivo si la fecha no tiene tema en el JSON */

    /* Mes Mariano: queda en su posición intermedia (sin cambios) */
    var headerInfo = '';
    if (isMarian) {
      headerInfo += '<div class="sl-marian">✦ Mes Mariano ✦</div>';
    }

    /* Nombre litúrgico: ahora ocupa la POSICIÓN INFERIOR (heredando el estilo
       Cormorant italic 0.78rem). Las flechas de navegación al histórico se sitúan
       en sus extremos. El indicador "•" pulsante dorado (setlist vigente) acompaña
       al nombre litúrgico, ya que el nombre identifica al setlist en sí. */
    /* Flecha izquierda al histórico: solo si hay setlists previos Y el usuario
       está en modo Coro/Dev (rehearsal-mode). En modo público no ofrecemos
       navegación; el CSS también oculta estos elementos como defensa adicional. */
    var isPublicMode = !document.body.classList.contains('rehearsal-mode');
    var leftNav = (!isPublicMode && historyDates.length > 0)
      ? '<button class="sl-tema-nav" onclick="window.SL.showHistory()" ' +
            'title="Ver setlists anteriores" aria-label="Ver setlists anteriores">‹</button>'
      : '<span class="sl-tema-nav-spacer" aria-hidden="true"></span>';
    var rightNav = '<span class="sl-tema-nav-spacer" aria-hidden="true"></span>';
    headerInfo += '<div class="sl-tema">' +
        leftNav +
        '<span class="sl-tema-text">' +
          '<span class="sl-now-dot" aria-label="Setlist actual"></span>' +
          liturgicalName +
        '</span>' +
        rightNav +
      '</div>';

    var titleEl = panel.querySelector('.sl-header-title');
    if (titleEl) {
      /* El tema (cita escritural) toma el lugar prominente del título;
         el nombre litúrgico desciende a la línea inferior italic. */
      titleEl.innerHTML = titleContent + headerInfo;
    }

    var html = '';
    SLOTS.forEach(function(slot) {
      var data = setlistData[slot.id];
      var hasContent = !!data;
      var shouldShow = hasContent || slot.defaultEmpty;
      if (!shouldShow) return;

      var label = slot.label + (slot.sub ? ' ' + slot.sub : '');
      var labelClickable = LABEL_TO_SECTION[slot.label]
        ? ' clickable" onclick="window.SL.scrollToIndex(\'' + LABEL_TO_SECTION[slot.label] + '\')" title="Ir al índice'
        : '"';

      /* Determinar advertencias por tiempo litúrgico */
      var warning = '';
      if (slot.liturgical === 'gloria' && !appliesGloria(season)) {
        warning = '<span class="sl-warn" title="No se canta Gloria en ' + season.name + '">⚠</span>';
      }
      if (slot.liturgical === 'aleluya' && !appliesAleluya(season)) {
        warning = '<span class="sl-warn" title="En Cuaresma se sustituye por aclamación">⚠</span>';
      }
      /* Recordatorio Mes Mariano en Salida */
      if (slot.id === 'salida' && isMarian && !hasContent) {
        warning = '<span class="sl-hint" title="Mes Mariano: considera un canto a la Virgen">✿</span>';
      }

      if (hasContent) {
        var newBadge = isNewSong(data.cpd) ? '<span class="sl-new-badge" title="Canto nuevo">✦</span>' : '';
        html += '<div class="sl-slot">' +
          '<span class="sl-moment' + labelClickable + '">' + label + warning + '<\/span>' +
          '<span class="sl-song" onclick="window.SL.goTo(\'' + data.cpd + '\')">' + data.title + newBadge + '<\/span>' +
          '<button class="sl-remove" onclick="window.SL.remove(\'' + slot.id + '\')" title="Quitar">&times;<\/button>' +
          '<\/div>';
      } else {
        /* Placeholder vacío */
        html += '<div class="sl-slot sl-slot-empty">' +
          '<span class="sl-moment' + labelClickable + '">' + label + warning + '<\/span>' +
          '<span class="sl-song empty">— vacío —<\/span>' +
          '<\/div>';
      }
    });
    slotsEl.innerHTML = html;
  }

  function parseDateKey(key) {
    var parts = key.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  function scrollToIndex(sectionId) {
    /* Cierra el panel (a menos que esté pineado) */
    if (!isPinned) closePanel();
    /* El índice está en #dominical-index. Sub-secciones: id de moment-header en cancionero también */
    var indexEl = document.getElementById('dominical-index');
    if (!indexEl) return;
    /* Buscar dentro del índice el header de la sección */
    var sectionInIndex = indexEl.querySelector('[data-section="' + sectionId + '"]');
    if (sectionInIndex) {
      sectionInIndex.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      indexEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ── FIREBASE ── */
  function loadFromFirebase() {
    fetch(FIREBASE_URL + FB_PATH + '.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data) { setlistData = {}; renderSlots(); return; }
        setlistData = {};
        Object.keys(data).forEach(function(slotId) {
          if (data[slotId]) setlistData[slotId] = data[slotId];
        });
        renderSlots();
        console.log('[Setlist] Cargado:', Object.keys(setlistData).length, 'cantos');
      })
      .catch(function(err) {
        console.warn('[Setlist] Firebase error:', err.message);
        renderSlots();
      });
  }

  function saveSlot(slotId, cpd, title) {
    setlistData[slotId] = { cpd: cpd, title: title };
    renderSlots();
    fetch(FIREBASE_URL + FB_PATH + '/' + slotId + '.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpd: cpd, title: title })
    }).then(function() {
      console.log('[Setlist] Guardado:', slotId, '→', title);
    }).catch(function(err) {
      console.warn('[Setlist] Error guardando:', err.message);
    });
  }

  function removeSlot(slotId) {
    delete setlistData[slotId];
    renderSlots();
    fetch(FIREBASE_URL + FB_PATH + '/' + slotId + '.json', {
      method: 'DELETE'
    }).catch(function(err) {
      console.warn('[Setlist] Error borrando:', err.message);
    });
  }

  function clearAll() {
    setlistData = {};
    renderSlots();
    fetch(FIREBASE_URL + FB_PATH + '.json', {
      method: 'DELETE'
    }).catch(function(err) {
      console.warn('[Setlist] Error limpiando:', err.message);
    });
  }

  /* ── SETLIST HISTORY ──
     Carga las últimas 4 fechas con setlist guardado y permite navegar entre ellas.
     Cuando hay un canto en histórico, ofrece botón para agregarlo al setlist actual. */
  var historyDates = [];   // array de fechas (yyyy-mm-dd) ordenadas desc
  var historyIndex = -1;   // índice activo dentro de historyDates
  var historyData = {};    // { fecha: { slotId: {cpd, title} } }
  var currentView = 'current'; // 'current' | 'history'

  function loadHistory() {
    /* Trae todas las fechas del nodo /setlist y filtra las últimas 4 ANTES del domingo actual.
       
       Garantías de "solo el último setlist de cada semana":
       1. La clave en Firebase es siempre SUNDAY_KEY (computado por getNextSunday()),
          por lo que múltiples guardados dentro de una misma semana SOBRESCRIBEN la misma
          entrada (un solo registro por semana, por construcción del modelo de datos).
       2. Como red de seguridad, filtramos explícitamente las fechas que no caen en domingo
          (defensa frente a posibles entradas legacy con un esquema de claves distinto). */
    return fetch(FIREBASE_URL + '/setlist.json?shallow=true')
      .then(function(r) { return r.json(); })
      .then(function(keys) {
        if (!keys) return;
        var allDates = Object.keys(keys).filter(function(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); });
        /* Solo fechas estrictamente anteriores al domingo actual */
        allDates = allDates.filter(function(d) { return d < SUNDAY_KEY; });
        /* Solo domingos (red de seguridad: getDay() === 0 en parseo local-safe) */
        allDates = allDates.filter(function(d) {
          var p = d.split('-');
          var dt = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
          return dt.getDay() === 0;
        });
        allDates.sort(function(a, b) { return b.localeCompare(a); }); /* desc */
        historyDates = allDates.slice(0, 4);
      })
      .catch(function(err) { console.warn('[History] Error:', err.message); });
  }

  function loadHistorySetlist(dateKey) {
    if (historyData[dateKey]) return Promise.resolve(historyData[dateKey]);
    return fetch(FIREBASE_URL + '/setlist/' + dateKey + '.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        historyData[dateKey] = data || {};
        return historyData[dateKey];
      });
  }

  function showHistory() {
    if (!historyDates.length) {
      loadHistory().then(function() {
        if (!historyDates.length) {
          alert('No hay setlists anteriores guardados.');
          return;
        }
        historyIndex = 0;
        currentView = 'history';
        renderSlots();
      });
    } else {
      historyIndex = 0;
      currentView = 'history';
      renderSlots();
    }
  }
  function exitHistory() {
    currentView = 'current';
    historyIndex = -1;
    renderSlots();
  }
  function historyPrev() {
    if (historyIndex < historyDates.length - 1) {
      historyIndex++;
      renderSlots();
    }
  }
  function historyNext() {
    if (historyIndex > 0) {
      historyIndex--;
      renderSlots();
    }
  }

  function renderHistoryView() {
    var dateKey = historyDates[historyIndex];
    if (!dateKey) { exitHistory(); return; }

    /* Datos litúrgicos del histórico para mostrar nombre exacto del domingo */
    var litData = (typeof window.LITURGICAL_DATA === 'object' && window.LITURGICAL_DATA[dateKey]) || null;
    var liturgicalName = litData && litData.n ? litData.n : '';

    /* Header en modo histórico: misma estructura que el modo actual.
       Las flechas de navegación se sitúan en los extremos de la última línea
       de texto (nombre litúrgico + contador inline) para mantener consistencia
       visual entre ambos modos. */
    var titleEl = panel.querySelector('.sl-header-title');
    if (titleEl) {
      /* Flecha izquierda: navegar a un histórico MÁS ANTIGUO */
      var canGoOlder = historyIndex < historyDates.length - 1;
      var leftArrow = canGoOlder
        ? '<button class="sl-tema-nav" onclick="window.SL.historyPrev()" ' +
              'title="Más antiguo" aria-label="Más antiguo">‹</button>'
        : '<span class="sl-tema-nav disabled" aria-hidden="true">‹</span>';

      /* Flecha derecha: navegar a un histórico MÁS RECIENTE,
         o salir al modo actual si ya estamos en el más reciente. */
      var rightArrow = historyIndex > 0
        ? '<button class="sl-tema-nav" onclick="window.SL.historyNext()" ' +
              'title="Más reciente" aria-label="Más reciente">›</button>'
        : '<button class="sl-tema-nav" onclick="window.SL.exitHistory()" ' +
              'title="Volver al actual" aria-label="Volver al actual">›</button>';

      /* Contenido central: nombre litúrgico (si existe) + contador "n / total" */
      var counterTxt = '<span class="sl-counter">' + (historyIndex + 1) + ' / ' + historyDates.length + '</span>';
      var centerTxt = liturgicalName
        ? liturgicalName + counterTxt
        : counterTxt;

      titleEl.innerHTML = 'Histórico' +
        '<div class="sl-header-date">' + formatDate(dateKey) + '</div>' +
        '<div class="sl-tema">' +
          leftArrow +
          '<span class="sl-tema-text is-hist">' + centerTxt + '</span>' +
          rightArrow +
        '</div>';
    }

    loadHistorySetlist(dateKey).then(function(data) {
      var html = '';
      var anyContent = false;
      SLOTS.forEach(function(slot) {
        var d = data && data[slot.id];
        if (!d) return;
        anyContent = true;
        var label = slot.label + (slot.sub ? ' ' + slot.sub : '');
        var newBadge = isNewSong(d.cpd) ? '<span class="sl-new-badge">✦</span>' : '';
        html += '<div class="sl-slot">' +
          '<span class="sl-moment">' + label + '<\/span>' +
          '<span class="sl-song" onclick="window.SL.goTo(\'' + d.cpd + '\')">' + d.title + newBadge + '<\/span>' +
          '<button class="sl-add-from-hist" onclick="window.SL.addFromHistory(\'' + d.cpd + '\')" title="Agregar al setlist actual">+<\/button>' +
          '<\/div>';
      });
      if (!anyContent) {
        html = '<div class="sl-slot"><span class="sl-song empty" style="text-align:center;width:100%;">Sin cantos en este histórico<\/span><\/div>';
      }
      slotsEl.innerHTML = html;
    });
  }

  function addFromHistory(cpd) {
    /* Reusa el mismo flujo que addSong: abre el dialog con el slot sugerido */
    var card = document.querySelector('[data-chord-id="' + cpd + '"]');
    if (!card) {
      alert('Canto no encontrado en el cancionero.');
      return;
    }
    var titleEl = card.querySelector('.song-title');
    var title = '';
    if (titleEl) {
      titleEl.childNodes.forEach(function(n) {
        if (n.nodeType === 3) title += n.textContent;
      });
    }
    title = title.trim();
    var moment = detectMoment(card);
    /* Volver al modo actual antes de abrir el diálogo */
    exitHistory();
    openAddDialog(cpd, title, moment);
  }

  /* ── PANEL OPEN/CLOSE ── */
  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    overlay.classList.add('open');
    tab.classList.add('sl-tab-hidden');
  }
  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    overlay.classList.remove('open');
    tab.classList.remove('sl-tab-hidden');
  }
  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  /* ── SWIPE DETECTION ── */
  document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!document.body.classList.contains('rehearsal-mode')) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (!isOpen && touchStartX < 30 && dx > 60) openPanel();
    else if (isOpen && dx < -60 && !isPinned) closePanel();
  }, { passive: true });

  /* Escape key — respeta el pin */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen && !isPinned) closePanel();
  });

  /* ── GO TO SONG ── */
  function goToSong(cpd) {
    /* Solo cierra si NO está pineado */
    if (!isPinned) closePanel();
    var card = document.querySelector('[data-chord-id="' + cpd + '"]');
    if (!card) return;
    /* Find the anchor before the card */
    var anchor = card.previousElementSibling;
    while (anchor && !anchor.id) anchor = anchor.previousElementSibling;
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    /* Flash effect */
    card.style.transition = 'box-shadow 0.3s';
    card.style.boxShadow = '0 0 0 3px #C8943C, 0 4px 20px rgba(200,148,60,0.4)';
    setTimeout(function() { card.style.boxShadow = ''; }, 1500);
  }

  /* ── ADD SONG DIALOG ── */
  var dialogOverlay = document.getElementById('sl-dialog-overlay');
  var dialogSongEl  = document.getElementById('sl-dialog-song');
  var dialogSlotsEl = document.getElementById('sl-dialog-slots');
  var pendingAdd = null; // { cpd, title, moment }

  function detectMoment(card) {
    var momentEl = card.querySelector('.song-moment-label');
    var momentText = momentEl ? momentEl.textContent.trim() : '';
    return TAG_MAP[momentText] || null;
  }

  function openAddDialog(cpd, title, suggestedMoment) {
    pendingAdd = { cpd: cpd, title: title };
    dialogSongEl.textContent = '\u00ab' + title + '\u00bb';

    var html = '';
    SLOTS.forEach(function(slot) {
      var label = slot.label + (slot.sub ? ' ' + slot.sub : '');
      var current = setlistData[slot.id] ? setlistData[slot.id].title : '';
      var isSuggested = suggestedMoment && slot.id.indexOf(suggestedMoment) === 0;
      html += '<button class="sl-dialog-slot-btn' + (isSuggested ? ' suggested' : '') + '" onclick="window.SL.confirmAdd(\'' + slot.id + '\')">' +
        '<span>' + label + (isSuggested ? ' \u2190' : '') + '<\/span>' +
        (current ? '<span class="sl-btn-current">' + current + '<\/span>' : '') +
        '<\/button>';
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

  /* Click outside dialog */
  dialogOverlay.addEventListener('click', function(e) {
    if (e.target === dialogOverlay) closeDialog();
  });

  /* ── PIN PANEL ── */
  function togglePin() {
    isPinned = !isPinned;
    updatePinUI();
    try {
      if (isPinned) localStorage.setItem(PIN_KEY, '1');
      else localStorage.removeItem(PIN_KEY);
    } catch (e) {}
  }
  function updatePinUI() {
    var btn = document.getElementById('sl-pin-btn');
    if (!btn) return;
    btn.classList.toggle('pinned', isPinned);
    btn.title = isPinned ? 'Panel fijo (click para soltar)' : 'Mantener panel abierto';
    /* Cuando está pineado, oculta el overlay para permitir interacción
       con el cancionero detrás del panel (especialmente útil en PC) */
    if (isPinned) overlay.classList.add('sl-overlay-pinned');
    else overlay.classList.remove('sl-overlay-pinned');
  }
  function restorePinState() {
    try {
      isPinned = localStorage.getItem(PIN_KEY) === '1';
    } catch (e) { isPinned = false; }
    updatePinUI();
    /* Si estaba pineado y el modo Coro está activo, abre el panel automáticamente */
    if (isPinned && document.body.classList.contains('rehearsal-mode')) {
      openPanel();
    }
  }

  /* ── INJECT "+" BUTTONS NEXT TO SONG TITLES ── */
  /* Idempotent: only adds buttons to cards that don't have one yet. */
  function injectAddButtons() {
    var cards = document.querySelectorAll('.song-card[data-chord-id]');
    cards.forEach(function(card) {
      var titleEl = card.querySelector('.song-title');
      if (!titleEl) return;
      /* Skip if already injected */
      if (titleEl.querySelector('.song-add-btn')) return;
      var cpd = card.dataset.chordId;
      if (!cpd) return;
      var btn = document.createElement('button');
      btn.className = 'song-add-btn';
      btn.title = 'Agregar al setlist';
      btn.setAttribute('aria-label', 'Agregar al setlist');
      btn.textContent = '+';
      btn.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        window.SL.addSong(cpd);
      });
      titleEl.appendChild(btn);
    });
  }

  /* ── INIT ── */
  renderSlots();
  loadFromFirebase();
  /* loadHistory() es asíncrono; cuando resuelve, repintamos para que el chip
     "‹ Histórico" aparezca en el header del modo actual si hay setlists previos. */
  loadHistory().then(function() {
    if (currentView === 'current') renderSlots();
  });
  restorePinState();
  injectAddButtons();

  /* Re-renderizar el panel cuando el body entra o sale de rehearsal-mode.
     Esto es necesario porque el modo público oculta la navegación del histórico
     y otros controles, y el render se ejecutó la primera vez con el modo activo
     en ese momento. Sin esto, cambiar de modo durante la sesión dejaría el
     panel desactualizado hasta que el usuario recargue la página. */
  new MutationObserver(function() {
    if (currentView === 'current') renderSlots();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  /* ── PUBLIC API ── */
  window.SL = {
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
    goTo: goToSong,
    remove: removeSlot,
    clearAll: clearAll,
    togglePin: togglePin,
    isPinned: function() { return isPinned; },
    injectAddButtons: injectAddButtons,
    scrollToIndex: scrollToIndex,
    showHistory: showHistory,
    exitHistory: exitHistory,
    historyPrev: historyPrev,
    historyNext: historyNext,
    addFromHistory: addFromHistory,
    addSong: function(cpd) {
      var card = document.querySelector('[data-chord-id="' + cpd + '"]');
      if (!card) return;
      var titleEl = card.querySelector('.song-title');
      var title = '';
      if (titleEl) {
        titleEl.childNodes.forEach(function(n) {
          if (n.nodeType === 3) title += n.textContent;
        });
      }
      title = title.trim();
      var moment = detectMoment(card);
      openAddDialog(cpd, title, moment);
    },
    confirmAdd: confirmAdd,
    closeDialog: closeDialog
  };
})();
