/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/13-cpd-history.js
 *   @brief      Historial de versiones de acordes y letras (Firebase)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r4
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   13-cpd-history.js
   ============================================================================
   CPDHistory — wrapper de Firebase con historial

   window.CPDHistory.saveWithHistory(). Cada edit se guarda en /chord-history y /lyrics-history.

   ORDEN DE CARGA: posición 13 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

// ── CPD HISTORY ──────────────────────────────────────
window.CPDHistory = (function() {
  var FB = 'https://coropacemdeusdominical-default-rtdb.firebaseio.com';
  function formatTs(ms) {
    var d=new Date(ms);
    return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]+' '+d.getDate()+' '+
      ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()]+
      ' '+d.getFullYear()+' — '+String(d.getHours()).padStart(2,'0')+':'+
      String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')+'.'+
      String(d.getMilliseconds()).padStart(3,'0');
  }
  function saveWithHistory(type,id,content) {
    var ap=type==='chord'?'/chord-overrides/':'/lyrics-overrides/';
    var hp=type==='chord'?'/chord-history/':'/lyrics-history/';
    var ts=Date.now();
    return Promise.all([
      fetch(FB+ap+id+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(content)}),
      fetch(FB+hp+id+'/'+ts+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:content,savedAt:ts})})
    ]).then(function(rs){rs.forEach(function(r){if(!r.ok) throw new Error('Firebase HTTP '+r.status);});});
  }
  function loadHistory(type,id) {
    return fetch(FB+(type==='chord'?'/chord-history/':'/lyrics-history/')+id+'.json')
      .then(function(r){return r.json();}).then(function(data){
        if(!data||typeof data!=='object') return [];
        return Object.keys(data).map(function(ts){var e=data[ts],tsn=parseInt(ts,10);
          return{ts:tsn,content:typeof e==='object'?e.content:e,label:formatTs(tsn)};
        }).sort(function(a,b){return b.ts-a.ts;});
      });
  }
  var panel=document.getElementById('cpd-history-panel');
  var pList=document.getElementById('cpd-history-list');
  var pSt=document.getElementById('cpd-history-status');
  var pTitle=document.getElementById('cpd-history-panel-title');
  document.getElementById('cpd-history-close-btn').addEventListener('click',function(){panel.classList.remove('open');});
  function open(type,id,onSelect) {
    var ov=document.getElementById(type==='chord'?'chord-editor-overlay':'lyrics-editor-overlay');
    if(ov&&panel.parentNode!==ov) ov.appendChild(panel);
    pTitle.textContent='Historial '+(type==='chord'?'Acordes':'Letra')+' — '+id;
    pList.innerHTML='<div class="cpd-hist-empty">Cargando...</div>';
    pSt.textContent=''; panel.classList.add('open');
    loadHistory(type,id).then(function(vs){
      if(!vs.length){pList.innerHTML='<div class="cpd-hist-empty">Sin versiones aún.</div>';return;}
      pSt.textContent=vs.length+' versión'+(vs.length>1?'es':'');
      pList.innerHTML='';
      vs.forEach(function(v,i){
        var item=document.createElement('div');item.className='cpd-hist-item';
        var pts=v.label.split(' — ');
        var de=document.createElement('div');de.className='cpd-hist-date';
        de.innerHTML=pts[0]+'<span>'+(pts[1]||'')+'</span>';
        if(i===0){var b=document.createElement('span');b.textContent=' ← actual';b.style.cssText='font-size:.48rem;color:#6BB86B;font-style:italic;';de.appendChild(b);}
        var lb=document.createElement('button');lb.className='cpd-hist-load-btn';lb.textContent='Cargar';
        lb.addEventListener('click',function(e){
          e.stopPropagation();
          pList.querySelectorAll('.cpd-hist-item').forEach(function(el){el.classList.remove('selected');});
          item.classList.add('selected');
          if(onSelect) onSelect(v.content,v.label);
          pSt.textContent='✓ '+v.label+'. Revisa y guarda.';
        });
        item.appendChild(de);item.appendChild(lb);pList.appendChild(item);
      });
    }).catch(function(){pList.innerHTML='<div class="cpd-hist-empty">Error al cargar.</div>';});
  }
  var chHB=document.getElementById('editor-history-btn');
  var lyHB=document.getElementById('lyrics-history-btn');
  if(chHB) chHB.addEventListener('click',function(){
    var id=window._currentChordEditorCpdId;if(!id)return;
    open('chord',id,function(c){var ta=document.getElementById('chord-editor-textarea');
      if(ta&&window.chordHtmlToText){ta.value=window.chordHtmlToText(c);if(window.refreshChordHighlight)window.refreshChordHighlight();}});
  });
  if(lyHB) lyHB.addEventListener('click',function(){
    var id=window._currentLyricsEditorCpdId;if(!id)return;
    open('lyrics',id,function(c){var ta=document.getElementById('lyrics-editor-textarea');
      if(ta){ta.value=c;ta.dispatchEvent(new Event('input'));}});
  });
  return{formatTs:formatTs,saveWithHistory:saveWithHistory,loadHistory:loadHistory,open:open};
})();
