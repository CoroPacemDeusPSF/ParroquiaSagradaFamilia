/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/14-lyrics-editor.js
 *   @brief      Editor de letras con guardado en Firebase y normalización
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r1
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   14-lyrics-editor.js
   ============================================================================
   Editor de letras (Dev Mode) — fullscreen

   openLyricsEditor(). Edita el HTML del song-body, guarda en Firebase /lyrics-overrides.

   ORDEN DE CARGA: posición 14 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── LYRICS EDITOR (Dev Mode) ──────────────────────────
// Edita la letra de los cantos y persiste en Firebase.
// Ruta Firebase: /lyrics-overrides/{cpd-id}
// Independiente del sistema de acordes.
(function() {

  var FIREBASE_URL = 'https://coropacemdeusdominical-default-rtdb.firebaseio.com';

  // ── DOM refs ──
  var overlay    = document.getElementById('lyrics-editor-overlay');
  var textarea   = document.getElementById('lyrics-editor-textarea');
  var statusEl   = document.getElementById('lyrics-editor-status');
  var titleEl    = document.getElementById('lyrics-editor-title');
  var saveBtn    = document.getElementById('lyrics-save-btn');
  var cancelBtn  = document.getElementById('lyrics-cancel-btn');
  var previewBtn = document.getElementById('lyrics-preview-btn');
  var previewPane = document.getElementById('lyrics-preview-pane');
  var previewContent = document.getElementById('lyrics-preview-content');
  var tagBar     = document.getElementById('lyrics-tag-bar');

  var currentCpdId = null;  // e.g. 'cpd-031'
  var currentCard  = null;  // the song-card DOM element
  var isPreviewOpen = false;

  // ── TAG → CSS class mapping ──
  var TAG_CLASSES = {
    'intro': 'lp-intro', 'verso': 'lp-verso',
    'estrofa': 'lp-estrofa', 'pre-coro': 'lp-pre-coro',
    'coro': 'lp-coro', 'puente': 'lp-puente',
    'modulacion': 'lp-modulacion', 'modulación': 'lp-modulacion',
    'final': 'lp-final', 'instrumental': 'lp-instrumental', 'interludio': 'lp-puente'
  };

  function tagClass(tagName) {
    var key = tagName.toLowerCase().replace(/\s+\d+$/, '').trim(); // strip number suffix
    return TAG_CLASSES[key] || 'lp-estrofa';
  }

  // ── Sub-tags de voz: color inline sin abrir div nuevo ──
  var VOICE_COLORS = { 'hombre':'#5A9BC8', 'mujer':'#C87090', 'ambos':'#5BA05B' };
  function isVoiceTag(tag) { return !!VOICE_COLORS[tag.toLowerCase()]; }

  // ── Convert lyrics text → song-body HTML ──
  function lyricsTextToHtml(text) {
    var lines=text.split('\n'), html='', inDiv=false, divCls='strophe', voiceColor=null;
    function openDiv(cls) {
      if(inDiv) closeDiv();
      divCls=cls; inDiv=true; voiceColor=null;
      html+='<div class="'+cls+'">\n';
    }
    function closeDiv() { if(!inDiv) return; html+='</div>\n'; inDiv=false; voiceColor=null; }
    lines.forEach(function(raw) {
      var t=raw.trim();
      if (!t) { if(inDiv) html+='  <p class="lyric-spacer"></p>\n'; return; }
      var m=t.match(/^\[([^\]]+)\]$/);
      if (m) {
        var tag=m[1], key=tag.toLowerCase();
        if (isVoiceTag(tag)) { voiceColor=VOICE_COLORS[key]; if(!inDiv) openDiv('strophe'); }
        else {
          openDiv(/^coro(\s|$)/i.test(key)?'chorus':'strophe');
          var ld=html.lastIndexOf('<div class="'+divCls+'">');
          html=html.slice(0,ld)+'<span class="lp-section '+tagClass(tag)+'">'+escHtml(tag)+'</span>\n'+html.slice(ld);
          voiceColor=null;
        }
        return;
      }
      if(!inDiv) openDiv('strophe');
      var pa=voiceColor?' style="color:'+voiceColor+';" data-voice="'+voiceColor+'"':'';
      html+='  <p'+pa+'>'+escHtml(t)+'</p>\n';
    });
    closeDiv(); return html;
  }

  // ── Mapa color → voz ──
  var COLOR_TO_VOICE={'#5a9bc8':'Hombre','#5A9BC8':'Hombre','#c87090':'Mujer','#C87090':'Mujer','#5ba05b':'Ambos','#5BA05B':'Ambos'};
  // ── Convert song-body HTML → lyrics text ──
  function htmlToLyricsText(songBodyEl) {
    var lines=[], coroN=0, estN=0;
    Array.from(songBodyEl.childNodes).forEach(function(node) {
      if(node.nodeType!==1) return;
      var cls=node.className||'';
      if(/song-ornament|chords-toggle|chords-block|lp-section/.test(cls)) return;
      if(/chorus/.test(cls))  { coroN++; lines.push(coroN>1?'[Coro '+coroN+']':'[Coro]'); }
      else if(/strophe/.test(cls)) { estN++; lines.push(estN>1?'[Estrofa '+estN+']':'[Estrofa 1]'); }
      var lastV=null;
      Array.from(node.querySelectorAll('p')).forEach(function(p) {
        if(p.classList&&p.classList.contains('lyric-spacer')){ lines.push(''); return; }
        var raw=p.getAttribute('data-voice')||(p.style&&p.style.color)||null;
        var v=raw?(COLOR_TO_VOICE[raw]||null):null;
        if(v!==lastV){ if(v) lines.push('['+v+']'); lastV=v; }
        var txt=p.textContent.trim(); if(txt) lines.push(txt);
      });
      lines.push('');
    });
    while(lines.length&&!lines[lines.length-1]) lines.pop();
    return lines.join('\n');
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Real-time preview ──
  function refreshPreview() {
    if (!isPreviewOpen) return;
    previewContent.innerHTML = lyricsTextToHtml(textarea.value);
  }

  // ── Tag chip insertion ──
  tagBar.addEventListener('click', function(e) {
    var chip = e.target.closest('.lyrics-tag-chip');
    if (!chip) return;
    var tag = '[' + chip.dataset.tag + ']';
    var start = textarea.selectionStart;
    var end   = textarea.selectionEnd;
    var val   = textarea.value;
    // Insert tag on its own line
    var before = val.slice(0, start);
    var after  = val.slice(end);
    var prefix = before.length && !before.endsWith('\n') ? '\n' : '';
    var insert = prefix + tag + '\n';
    textarea.value = before + insert + after;
    var cur = start + insert.length;
    textarea.selectionStart = textarea.selectionEnd = cur;
    textarea.focus();
    refreshPreview();
  });

  // ── Preview toggle ──
  previewBtn.addEventListener('click', function() {
    isPreviewOpen = !isPreviewOpen;
    previewPane.classList.toggle('open', isPreviewOpen);
    previewBtn.classList.toggle('active', isPreviewOpen);
    document.getElementById('lyrics-editor-pane').style.flex = isPreviewOpen ? '' : '1';
    if (isPreviewOpen) refreshPreview();
  });

  // ── Live preview on input ──
  textarea.addEventListener('input', refreshPreview);

  // ── Mobile keyboard: keep editor visible above keyboard ──
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      if (!overlay.classList.contains('open')) return;
      var vv = window.visualViewport;
      overlay.style.height = vv.height + 'px';
      overlay.style.top    = vv.offsetTop + 'px';
    });
    window.visualViewport.addEventListener('scroll', function() {
      if (!overlay.classList.contains('open')) return;
      var vv = window.visualViewport;
      overlay.style.top = vv.offsetTop + 'px';
    });
  }

  // ── OPEN editor ──
  window.openLyricsEditor = function(cpdId) {
    currentCpdId = cpdId;
    window._currentLyricsEditorCpdId = cpdId;
    currentCard  = document.querySelector('.song-card[data-chord-id="' + cpdId + '"]');
    if (!currentCard) return;

    var titleText = currentCard.querySelector('.song-title');
    var songTitle = titleText ? titleText.textContent.replace(/[\u{1D11E}▾▴♫𝄞]/gu, '').trim() : cpdId;
    titleEl.textContent = 'Editar Letra — ' + songTitle;
    statusEl.textContent = 'Cargando...';
    statusEl.className = '';

    // Reset preview state
    isPreviewOpen = false;
    previewPane.classList.remove('open');
    previewBtn.classList.remove('active');
    cancelBtn.textContent = 'Cancelar';

    overlay.classList.add('open');
    overlay.style.height = '';
    overlay.style.top    = '';

    // Request fullscreen
    if (overlay.requestFullscreen)           overlay.requestFullscreen();
    else if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen();

    // Load from Firebase first, fall back to current HTML
    fetch(FIREBASE_URL + '/lyrics-overrides/' + cpdId + '.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && typeof data === 'string' && data.length > 0) {
          textarea.value = data;
          statusEl.textContent = '✓ Letra cargada desde Firebase. Edita y guarda.';
        } else {
          // Convert existing HTML body to text
          var body = currentCard.querySelector('.song-body');
          textarea.value = body ? htmlToLyricsText(body) : '';
          statusEl.textContent = 'Letra convertida del HTML. Edita y guarda para persistir.';
        }
        textarea.focus();
      })
      .catch(function() {
        var body = currentCard.querySelector('.song-body');
        textarea.value = body ? htmlToLyricsText(body) : '';
        statusEl.textContent = 'Sin conexión Firebase. Letra cargada del HTML.';
        textarea.focus();
      });
  };

  // ── SAVE ──
  saveBtn.addEventListener('click', function() {
    if (!currentCpdId) return;
    var text = textarea.value.trim();
    if (!text) { statusEl.textContent = '✗ La letra está vacía.'; statusEl.className = 'error'; return; }

    statusEl.textContent = '⏳ Guardando en Firebase...'; statusEl.className = '';
    saveBtn.disabled = true;

    window.CPDHistory.saveWithHistory('lyrics', currentCpdId, text)
    .then(function() {
      applyLyricsOverride(currentCpdId, text);
      statusEl.textContent = '✓ Letra guardada correctamente (' + currentCpdId + ')';
      statusEl.className = 'success';
      saveBtn.disabled = false;
      cancelBtn.textContent = 'Cerrar';
    })
    .catch(function(err) {
      statusEl.textContent = '✗ Error al guardar: ' + err.message;
      statusEl.className = 'error';
      saveBtn.disabled = false;
    });
  });

  // ── CANCEL / CLOSE ──
  function closeLyricsEditor() {
    if (document.fullscreenElement === overlay || document.webkitFullscreenElement === overlay) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    overlay.classList.remove('open');
    overlay.style.height = '';
    overlay.style.top    = '';
    currentCpdId = null;
    currentCard  = null;
    textarea.value = '';
    previewContent.innerHTML = '';
    isPreviewOpen = false;
    previewPane.classList.remove('open');
    previewBtn.classList.remove('active');
  }
  cancelBtn.addEventListener('click', closeLyricsEditor);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeLyricsEditor();
  });

  // ── APPLY override to DOM ──
  function applyLyricsOverride(cpdId, text) {
    var card = document.querySelector('.song-card[data-chord-id="' + cpdId + '"]');
    if (!card) return;
    var body = card.querySelector('.song-body');
    if (!body) return;

    var newHtml = lyricsTextToHtml(text);

    // Preserve the ornament, chords-toggle and chords-block
    var ornament = body.querySelector('.song-ornament');
    var chordsToggle = body.querySelector('.chords-toggle');
    var chordsBlock  = body.querySelector('.chords-block');

    body.innerHTML = newHtml;

    if (ornament)     body.appendChild(ornament);
    if (chordsToggle) body.appendChild(chordsToggle);
    if (chordsBlock)  body.appendChild(chordsBlock);

    console.log('[Lyrics] Override aplicado: ' + cpdId);
  }

  // ── LOAD overrides from Firebase on page load ──
  (function loadLyricsOverrides() {
    fetch(FIREBASE_URL + '/lyrics-overrides.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data) return;
        Object.keys(data).forEach(function(cpdId) {
          if (data[cpdId]) applyLyricsOverride(cpdId, data[cpdId]);
        });
        console.log('[Lyrics] Overrides aplicados:', Object.keys(data).length);
      })
      .catch(function() { /* Firebase not available */ });
  })();

  // ── INJECT "Editar Letra" button into each song-card (Dev Mode) ──
  // Injected lazily the first time Dev Mode activates
  var lyricsButtonsInjected = false;
  function injectLyricsButtons() {
    if (lyricsButtonsInjected) return;
    lyricsButtonsInjected = true;

    document.querySelectorAll('.song-card[data-chord-id]').forEach(function(card) {
      var cpdId = card.getAttribute('data-chord-id');
      var btn = document.createElement('button');
      btn.className = 'lyrics-edit-btn';
      btn.title = 'Editar letra (' + cpdId + ')';
      btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Editar';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        window.openLyricsEditor(cpdId);
      });
      // Add to song-header-text after song-title
      var headerText = card.querySelector('.song-header-text');
      if (headerText) headerText.appendChild(btn);
    });
  }

  // Watch for dev-mode class on body
  var bodyObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.attributeName === 'class' && document.body.classList.contains('dev-mode')) {
        injectLyricsButtons();
      }
    });
  });
  bodyObserver.observe(document.body, { attributes: true });
  // Also check immediately if already in dev-mode
  if (document.body.classList.contains('dev-mode')) injectLyricsButtons();

})();
