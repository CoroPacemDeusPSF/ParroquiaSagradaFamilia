/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/19-ai-agent.js
 *   @brief      Asistente AI litúrgico (consulta a Gemini con contexto del cancionero)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r18
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   19-ai-agent.js
   ============================================================================
   Asistente litúrgico — panel de chat con Gemini

   ORDEN DE CARGA: posición 19. Lee window.PACEM_SONGS_DATA (módulo 00) y
   window.LITURGICAL_DATA (módulo 21) de forma PEREZOSA — al enviar el primer
   mensaje, no al cargar. Por eso no importa que el 21 cargue después.

   ───────────────────────────────────────────────────────────────────────────
   REESCRITURA v3.6.7r18 — POR QUÉ
   ───────────────────────────────────────────────────────────────────────────
   La versión anterior fallaba constantemente ("This model is currently
   experiencing high demand"). Medido en producción sobre una sola pregunta:

       latencia .................. 13,2 s
       system prompt ............. 9 986 tokens
       grounding google_search ... 10 365 tokens
       pensamiento ............... 968 tokens
       respuesta ................. 1 290 tokens
       ───────────────────────────────────────
       TOTAL ..................... 22 609 tokens por mensaje

   Un tercer turno con historial acumulado ni siquiera terminaba en 45 s.
   A ese volumen se agota el límite por minuto del tier gratuito en pocas
   preguntas, y Gemini responde 503. Los cinco arreglos de raíz:

   1. NO SALIR A LA WEB A BUSCAR LO QUE YA TENEMOS.
      El 46% de cada petición se iba en `google_search` para averiguar qué
      domingo litúrgico era. Pero el módulo 21 ya tiene los 171 domingos de
      2025-2028 con tiempo, ciclo, color, evangelio, tema y antífona — datos
      curados, offline y más fiables que una búsqueda web. Ahora se inyectan
      directamente y el grounding queda RESERVADO para cuando de verdad hace
      falta: fechas fuera del rango que cubre el calendario local.

   2. CATÁLOGO GENERADO EN RUNTIME desde window.PACEM_SONGS_DATA, con la misma
      extracción que hacía scripts/regen-ai-catalog.js. Antes era una copia
      literal de songs.json incrustada aquí (28 081 caracteres) que desfasaba
      por construcción: tenía 152 cantos cuando el cancionero ya iba por 157,
      y el prompt le decía al modelo "CATÁLOGO DE 100 CANTOS". Ahora es
      imposible que se desincronice.

   3. REINTENTOS con backoff exponencial en 429/500/502/503/504, respetando
      Retry-After. Un 503 transitorio ya no llega a la pantalla del usuario.

   4. HISTORIAL PODADO a los últimos turnos, para que la conversación no
      crezca sin techo.

   5. LECTURA ROBUSTA DE LA RESPUESTA. Antes hacía parts[0].text: si `parts`
      venía vacío (corte por longitud) eso lanzaba un TypeError que caía en el
      catch general y mostraba "Error de conexión. Verifica tu internet." con
      la conexión intacta. Ahora se concatenan todas las partes y se
      distinguen los casos reales (bloqueo de seguridad, corte por longitud,
      cuota, timeout, red).

   Además: streaming SSE (el texto aparece mientras se genera en vez de 13 s
   de "Pensando"), timeout con AbortController, escapado de HTML antes de
   pintar, y todo encapsulado en un IIFE — era el único módulo del proyecto
   que colgaba sus símbolos del scope global.

   NOTA — scripts/regen-ai-catalog.js quedó OBSOLETO con este cambio: ya no
   existe la constante AI_CATALOG que regeneraba. Candidato a borrar.
   ============================================================================ */

(function () {
  'use strict';

  /* ══ Configuración ═══════════════════════════════════════════════════════ */

  var MODEL     = 'gemini-2.5-flash';
  var API_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models/';

  /* Turnos de conversación que se conservan (usuario + modelo cuentan como 2).
     Con 8 se recuerdan las últimas 4 preguntas, suficiente para "y el domingo
     siguiente?" sin que la petición crezca sin control. */
  var MAX_HISTORY = 8;

  var TIMEOUT_MS  = 60000;
  var MAX_RETRIES = 3;
  var RETRIABLE   = [429, 500, 502, 503, 504];

  /* Domingos del calendario local que viajan en el prompt. 6 cubre mes y
     medio: alcanza para "este domingo", "el siguiente" y "el de dentro de
     tres semanas" sin buscar en la web. */
  var SUNDAYS_AHEAD = 6;

  /* maxOutputTokens tiene que dar cabida al pensamiento del modelo Y a la
     respuesta: gemini-2.5-flash razona antes de contestar y ambos salen del
     mismo techo. Con el 8192 anterior sin presupuesto explícito, una respuesta
     larga podía agotarlo pensando y volver vacía. */
  var THINKING_BUDGET   = 1024;
  var MAX_OUTPUT_TOKENS = 4096;

  var _state = {
    history: [],
    busy: false,
    catalog: null,     // se construye una vez, en el primer envío
    lastQuestion: null // para el botón "Reintentar"
  };

  function apiKey() {
    var a = ['QUl6YVN5QV9ON', '01lTTRrenQ5cE', 'EyQnRyNDdrT2J', 'rTWpCRWFyd1dr'];
    return atob(a.join(''));
  }

  /* ══ Utilidades ══════════════════════════════════════════════════════════ */

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* Markdown mínimo — SIEMPRE sobre texto ya escapado, para que ni la
     respuesta del modelo ni lo que escriba el usuario puedan inyectar HTML. */
  function mdToHtml(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function longDate(key) {
    return new Date(key + 'T12:00:00').toLocaleDateString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  /* Domingo de referencia: hoy si hoy es domingo, si no el próximo. */
  function upcomingSunday() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return dateKey(d);
  }

  /* ══ Catálogo de cantos (desde songs.json, en runtime) ════════════════════ */

  /* Misma extracción que scripts/regen-ai-catalog.js, para que el formato de
     línea sea idéntico al que el prompt ya sabía interpretar. */

  function extractComposer(html) {
    if (!html) return null;
    var section = html.match(
      /<div class="ctx-label">Compositor<\/div>\s*<div class="ctx-text">([\s\S]*?)<\/div>\s*<\/div>/
    );
    if (!section) return null;
    var strong = section[1].match(/<strong>([\s\S]*?)<\/strong>/);
    if (!strong) return null;
    return strong[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  function extractVerse(html) {
    if (!html) return null;
    var verse = html.match(/<span class="ctx-verse">([\s\S]*?)<\/span>/);
    if (!verse) return null;
    return verse[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  /* Etiquetas que no aportan nada al modelo: o son universales (aplican a
     todo canto) o repiten el momento litúrgico que ya va en la línea. Son el
     grueso del ruido: los tags ocupaban el 25% del catálogo. Se conservan las
     que sí discriminan — Adviento, Cuaresma, Pascua, Corpus Christi, fiestas
     marianas, etc. */
  var NOISE_TAGS = {
    'todo el año litúrgico': 1,
    'todo el año liturgico': 1,
    'universal': 1,
    'ordinario': 1,
    'tiempo ordinario': 1
  };

  function extractTags(html, moment) {
    if (!html) return [];
    var matches = html.match(/<span class="ctx-tag[^"]*">([^<]+)<\/span>/g) || [];
    var mom = String(moment || '').toLowerCase();
    var seen = {};
    var out = [];
    matches.forEach(function (m) {
      var t = m.match(/>([^<]+)</)[1].trim();
      var k = t.toLowerCase();
      if (seen[k] || NOISE_TAGS[k] || k === mom) return;
      seen[k] = true;
      out.push(t);
    });
    return out;
  }

  function catalogLine(song) {
    var line = '• ' + song.title + ' [' + song.moment + ']';
    var composer = extractComposer(song.context_html);
    var verse    = extractVerse(song.context_html);
    var tags     = extractTags(song.context_html, song.moment);
    if (composer)    line += ' — Compositor: ' + composer;
    if (verse)       line += ' — Versículo: ' + verse;
    if (tags.length) line += ' — Tiempos: ' + tags.join(', ');
    return line;
  }

  /* Se construye una sola vez por sesión y se cachea en memoria (nunca en
     localStorage: el proyecto lo tiene prohibido por los bugs de datos
     fantasma, y además songs.json puede cambiar entre despliegues). */
  function getCatalog() {
    if (_state.catalog) return _state.catalog;
    var songs = window.PACEM_SONGS_DATA;
    if (!Array.isArray(songs) || !songs.length) return null;
    _state.catalog = {
      count: songs.length,
      text: songs.map(catalogLine).join('\n')
    };
    return _state.catalog;
  }

  /* ══ Contexto litúrgico (desde el calendario local del módulo 21) ═════════ */

  function liturgicalRange() {
    var D = window.LITURGICAL_DATA;
    if (!D) return null;
    var keys = Object.keys(D).sort();
    if (!keys.length) return null;
    return { first: keys[0], last: keys[keys.length - 1], keys: keys };
  }

  /* Ficha completa del domingo objetivo + línea resumida de los siguientes. */
  function buildLiturgicalContext() {
    var D = window.LITURGICAL_DATA;
    var range = liturgicalRange();
    if (!D || !range) return null;

    var target = upcomingSunday();
    var idx = range.keys.indexOf(target);
    if (idx === -1) {
      /* El domingo de hoy cae fuera del calendario local (p. ej. después de
         2028). Sin ficha principal: quien decide es needsWebSearch(). */
      return null;
    }

    var main = D[target];
    var out = [];
    out.push('CALENDARIO LITÚRGICO PROPIO DEL CANCIONERO — FUENTE PRINCIPAL.');
    out.push('Estos datos son curados y verificados. Úsalos tal cual; NO los contradigas ni los busques en la web.');
    out.push('');
    out.push('▸ PRÓXIMO DOMINGO — ' + longDate(target) + ' (' + target + ')');
    out.push('   Tiempo litúrgico: ' + main.t + ' · Ciclo: ' + (main.ci || '—') + ' · Color: ' + (main.c || '—'));
    out.push('   Celebración: ' + main.n);
    if (main.e)    out.push('   Santoral / especial: ' + main.e);
    if (main.ev)   out.push('   Evangelio: ' + main.ev);
    if (main.tema) out.push('   Tema central del Evangelio: ' + main.tema);
    if (main.ant)  out.push('   Antífona / salmo responsorial: ' + main.ant);

    var next = range.keys.slice(idx + 1, idx + SUNDAYS_AHEAD);
    if (next.length) {
      out.push('');
      out.push('▸ DOMINGOS SIGUIENTES:');
      next.forEach(function (k) {
        var s = D[k];
        var line = '   ' + k + ' — ' + s.n + ' · ' + s.t + ' · Ciclo ' + (s.ci || '—');
        if (s.ev)   line += ' · Ev: ' + s.ev;
        if (s.tema) line += ' · Tema: ' + s.tema;
        if (s.e)    line += ' · ' + s.e;
        out.push(line);
      });
    }

    out.push('');
    out.push('El calendario propio cubre de ' + range.first + ' a ' + range.last + '.');
    return out.join('\n');
  }

  /* El grounding con google_search cuesta ~10 000 tokens y varios segundos.
     Solo se enciende cuando el calendario local no puede responder: no está
     cargado, el domingo pedido cae fuera del rango cubierto, o el usuario
     nombra explícitamente un año que no tenemos. */
  function needsWebSearch(userText) {
    var range = liturgicalRange();
    if (!range) return true;

    if (range.keys.indexOf(upcomingSunday()) === -1) return true;

    var firstYear = parseInt(range.first.slice(0, 4), 10);
    var lastYear  = parseInt(range.last.slice(0, 4), 10);
    var years = String(userText || '').match(/\b(19|20)\d{2}\b/g) || [];
    for (var i = 0; i < years.length; i++) {
      var y = parseInt(years[i], 10);
      if (y < firstYear || y > lastYear) return true;
    }
    return false;
  }

  /* ══ System prompt ═══════════════════════════════════════════════════════ */

  function buildSystemPrompt(userText, useSearch) {
    var catalog = getCatalog();
    var lit = buildLiturgicalContext();
    var hoy = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    var p = [];
    p.push('Eres el Asistente Litúrgico del Coro Pacem Deus, un coro de la Parroquia Sagrada Familia (Lima, Perú). RESPONDE SIEMPRE EN EL IDIOMA DEL USUARIO. Por defecto: español. NUNCA mezcles idiomas.');
    p.push('');
    p.push('REGLAS:');
    p.push('- IDIOMA: responde en el idioma en que te escriban. Por defecto español. Nunca mezcles idiomas.');
    p.push('- Sé conciso pero preciso. No inventes información.');
    p.push('- Usa SOLO cantos del catálogo. Nunca inventes cantos ni sugieras cantos que no estén en la lista.');
    p.push('- Usa pronombres en mayúscula para Dios / Jesús / María: Tú, Ti, Te, Él, Su.');
    p.push('- La fecha de hoy es: ' + hoy + '.');

    if (useSearch) {
      p.push('- La fecha consultada queda FUERA del calendario propio del cancionero. Usa Google Search para obtener las lecturas y el domingo litúrgico exactos. Nunca los adivines de memoria.');
    } else {
      p.push('- NO uses búsqueda web: el calendario litúrgico que viene más abajo es la fuente autorizada y ya está verificado.');
    }

    p.push('');
    p.push('FORMATO DE RESPUESTA (obligatorio):');
    p.push('- Presenta los cantos así: **Nombre del Canto** (Compositor si se conoce).');
    p.push('- Usa negritas (**texto**) para nombres de cantos y secciones litúrgicas.');
    p.push('- Separa cada momento litúrgico con su nombre en negrita.');
    p.push('- No uses bloques de código ni formato técnico. No muestres identificadores internos.');
    p.push('');
    p.push('MÉTODO PARA RECOMENDAR SETLISTS:');
    p.push('1. Parte del Evangelio y el tema central del domingo (te los doy abajo).');
    p.push('2. Identifica los temas: misericordia, fe, comunidad, resurrección, cruz, etc.');
    p.push('3. Para cada momento, elige cantos cuyo VERSÍCULO BÍBLICO conecte con esos temas — no te guíes solo por el título.');
    p.push('4. Marca con ★ los cantos cuya conexión sea directa y explica en una línea POR QUÉ conecta.');
    p.push('5. Ofrece 2 opciones cuando sea natural, sin forzar.');
    p.push('6. En los momentos de texto fijo (Santo, Cordero) recomienda brevemente, sin justificación extensa.');
    p.push('');
    p.push('ESTRUCTURA DE LA MISA (en orden): Entrada · Piedad (Kyrie) · Gloria · Aleluya · Aclamación del Evangelio · Ofertorio · Santo · Cordero de Dios · Comunión · Salida.');
    p.push('El Gloria y el Aleluya se omiten en Adviento y Cuaresma.');

    if (lit) {
      p.push('');
      p.push(lit);
    }

    if (catalog) {
      p.push('');
      p.push('CATÁLOGO DE ' + catalog.count + ' CANTOS DEL CORO PACEM DEUS:');
      p.push(catalog.text);
    }

    return p.join('\n');
  }

  /* ══ Capa de red: reintentos, timeout, errores con sentido ════════════════ */

  function AgentError(message, kind) {
    var e = new Error(message);
    e.kind = kind || 'unknown';
    return e;
  }

  function messageForStatus(status, apiMessage) {
    if (status === 429) {
      return 'Se alcanzó el límite de consultas por minuto de la API. Espera unos segundos y vuelve a intentar.';
    }
    if (status === 400 && /API key|API_KEY/i.test(apiMessage || '')) {
      return 'La clave de la API no es válida o está restringida para este dominio.';
    }
    if (status === 403) {
      return 'Google denegó el acceso a la API (clave restringida o sin permisos).';
    }
    if (status >= 500) {
      return 'El servicio de Google está saturado en este momento. Lo reintenté ' + MAX_RETRIES + ' veces sin éxito.';
    }
    return apiMessage || ('La API respondió con un error (HTTP ' + status + ').');
  }

  /**
   * fetch con timeout y reintentos exponenciales sobre errores transitorios.
   * Los errores NO recuperables (400, 403…) se devuelven de inmediato para que
   * el llamador lea el cuerpo y explique la causa real.
   */
  async function fetchWithRetry(url, init, onRetry) {
    var lastError = null;

    for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
      var waitMs = null;

      try {
        var res = await fetch(url, {
          method: init.method,
          headers: init.headers,
          body: init.body,
          signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) return res;
        if (RETRIABLE.indexOf(res.status) === -1) return res;

        lastError = AgentError(messageForStatus(res.status, null), 'http');
        lastError.status = res.status;

        var retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
          var secs = parseInt(retryAfter, 10);
          if (!isNaN(secs)) waitMs = Math.min(secs * 1000, 15000);
        }
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') {
          lastError = AgentError('La consulta superó los ' + Math.round(TIMEOUT_MS / 1000) + ' segundos y se canceló.', 'timeout');
        } else {
          lastError = AgentError('No se pudo conectar con el servicio. Revisa tu conexión a internet.', 'network');
        }
      }

      if (attempt < MAX_RETRIES) {
        var delay = waitMs || (Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 400));
        if (onRetry) onRetry(attempt + 1, MAX_RETRIES, delay);
        await sleep(delay);
      }
    }

    throw lastError || AgentError('La consulta falló por una causa desconocida.', 'unknown');
  }

  function requestBody(userText, useSearch) {
    var body = {
      system_instruction: { parts: [{ text: buildSystemPrompt(userText, useSearch) }] },
      contents: _state.history.concat([{ role: 'user', parts: [{ text: userText }] }]),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET }
      }
    };
    if (useSearch) body.tools = [{ google_search: {} }];
    return body;
  }

  /* Concatena TODAS las partes con texto. Con grounding la respuesta puede
     traer varias, y la primera puede no ser texto — hacer parts[0].text era
     justamente lo que rompía la versión anterior. */
  function partsText(candidate) {
    if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts)) return '';
    var out = '';
    candidate.content.parts.forEach(function (p) {
      if (p && typeof p.text === 'string') out += p.text;
    });
    return out;
  }

  /* Traduce una respuesta sin texto a una causa concreta, en vez del genérico
     "Respuesta vacía" que no permitía diagnosticar nada. */
  function explainEmpty(data) {
    if (data && data.promptFeedback && data.promptFeedback.blockReason) {
      return AgentError('La consulta fue bloqueada por los filtros de seguridad de Google (' +
        data.promptFeedback.blockReason + ').', 'blocked');
    }
    var cand = data && data.candidates && data.candidates[0];
    var reason = cand && cand.finishReason;
    if (reason === 'MAX_TOKENS') {
      return AgentError('La respuesta se cortó por longitud antes de poder mostrarse. Prueba con una pregunta más acotada.', 'truncated');
    }
    if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT') {
      return AgentError('La respuesta fue bloqueada por los filtros de seguridad de Google.', 'blocked');
    }
    if (reason === 'RECITATION') {
      return AgentError('Google bloqueó la respuesta por posible recitación de material protegido.', 'blocked');
    }
    if (data && data.error && data.error.message) {
      return AgentError(data.error.message, 'api');
    }
    return AgentError('El modelo devolvió una respuesta vacía' + (reason ? ' (' + reason + ')' : '') + '.', 'empty');
  }

  async function readErrorBody(res) {
    try {
      var d = await res.json();
      return d && d.error ? d.error.message : null;
    } catch (e) { return null; }
  }

  /**
   * Envío con streaming SSE: el texto se pinta a medida que llega, en vez de
   * dejar "Pensando" 13 segundos. Si el navegador no soporta lectura de
   * streams, cae al modo no-streaming.
   *
   * Los reintentos solo cubren la fase de conexión. Una vez que empezó a
   * llegar texto no se reintenta: se conserva lo recibido y se avisa, para no
   * duplicar contenido en pantalla.
   */
  async function sendStreaming(userText, useSearch, handlers) {
    var url = API_BASE + MODEL + ':streamGenerateContent?alt=sse&key=' + apiKey();
    var res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody(userText, useSearch))
    }, handlers.onRetry);

    if (!res.ok) {
      var apiMsg = await readErrorBody(res);
      var err = AgentError(messageForStatus(res.status, apiMsg), 'http');
      err.status = res.status;
      throw err;
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      return sendBuffered(userText, useSearch, handlers);
    }

    var reader  = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer  = '';
    var full    = '';
    var lastPayload = null;

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      var lines = buffer.split('\n');
      buffer = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf('data:') !== 0) continue;
        var payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        var data;
        try { data = JSON.parse(payload); } catch (e) { continue; }
        lastPayload = data;

        var piece = partsText(data.candidates && data.candidates[0]);
        if (piece) {
          full += piece;
          handlers.onText(full);
        }
      }
    }

    if (!full) throw explainEmpty(lastPayload);
    return full;
  }

  /** Respaldo sin streaming, para navegadores sin ReadableStream. */
  async function sendBuffered(userText, useSearch, handlers) {
    var url = API_BASE + MODEL + ':generateContent?key=' + apiKey();
    var res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody(userText, useSearch))
    }, handlers.onRetry);

    if (!res.ok) {
      var apiMsg = await readErrorBody(res);
      var err = AgentError(messageForStatus(res.status, apiMsg), 'http');
      err.status = res.status;
      throw err;
    }

    var data = await res.json();
    var text = partsText(data.candidates && data.candidates[0]);
    if (!text) throw explainEmpty(data);
    handlers.onText(text);
    return text;
  }

  /* ══ UI ══════════════════════════════════════════════════════════════════ */

  function el(id) { return document.getElementById(id); }

  function scrollDown() {
    var m = el('ai-messages');
    if (m) m.scrollTop = m.scrollHeight;
  }

  function dropWelcome() {
    var m = el('ai-messages');
    if (!m) return;
    var w = m.querySelector('.ai-welcome');
    if (w) w.remove();
  }

  function addMsg(role, text) {
    var m = el('ai-messages');
    if (!m) return null;
    dropWelcome();
    var d = document.createElement('div');
    d.className = 'ai-msg ai-msg-' + role;
    d.innerHTML = mdToHtml(text);
    m.appendChild(d);
    scrollDown();
    return d;
  }

  function addError(message) {
    var m = el('ai-messages');
    if (!m) return;
    dropWelcome();

    var d = document.createElement('div');
    d.className = 'ai-msg ai-msg-ai ai-msg-error';
    d.innerHTML = '<em>' + esc(message) + '</em>';

    if (_state.lastQuestion) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-retry-btn';
      btn.textContent = 'Reintentar';
      btn.addEventListener('click', function () {
        var q = _state.lastQuestion;
        d.remove();
        send(q);
      });
      d.appendChild(document.createElement('br'));
      d.appendChild(btn);
    }

    m.appendChild(d);
    scrollDown();
  }

  function showTyping(label) {
    var m = el('ai-messages');
    if (!m) return;
    var t = el('ai-typing');
    if (!t) {
      t = document.createElement('div');
      t.className = 'ai-typing';
      t.id = 'ai-typing';
      m.appendChild(t);
    }
    t.textContent = label || 'Pensando';
    scrollDown();
  }

  function hideTyping() {
    var t = el('ai-typing');
    if (t) t.remove();
  }

  function setBusy(busy) {
    _state.busy = busy;
    var b = el('ai-send-btn');
    if (b) b.disabled = busy;
  }

  /* El número de cantos del texto de bienvenida sale del catálogo real, para
     que no vuelva a quedarse clavado (decía 152 con 157 en el cancionero). */
  function syncWelcomeCount() {
    var slot = el('ai-welcome-count');
    if (!slot) return;
    var catalog = getCatalog();
    if (catalog) slot.textContent = String(catalog.count);
  }

  /* ══ Flujo principal ═════════════════════════════════════════════════════ */

  async function send(text) {
    if (_state.busy) return;

    var inp = el('ai-input');
    var txt = (text !== undefined && text !== null) ? String(text).trim()
                                                    : (inp ? inp.value.trim() : '');
    if (!txt) return;

    if (inp && text === undefined) {
      inp.value = '';
      inp.style.height = 'auto';
    }

    setBusy(true);
    _state.lastQuestion = txt;
    addMsg('user', txt);

    if (!getCatalog()) {
      hideTyping();
      setBusy(false);
      addError('El cancionero todavía no terminó de cargar. Espera unos segundos y reintenta.');
      return;
    }

    var useSearch = needsWebSearch(txt);
    showTyping(useSearch ? 'Consultando el calendario en la web' : 'Pensando');

    var bubble = null;
    var handlers = {
      onRetry: function (attempt, total, delay) {
        showTyping('El servicio está saturado. Reintentando ' + attempt + '/' + total +
                   ' en ' + Math.round(delay / 1000) + ' s');
      },
      onText: function (accumulated) {
        hideTyping();
        if (!bubble) {
          bubble = addMsg('ai', accumulated);
        } else {
          bubble.innerHTML = mdToHtml(accumulated);
          scrollDown();
        }
      }
    };

    try {
      var reply = await sendStreaming(txt, useSearch, handlers);

      _state.history.push({ role: 'user',  parts: [{ text: txt }] });
      _state.history.push({ role: 'model', parts: [{ text: reply }] });
      if (_state.history.length > MAX_HISTORY) {
        _state.history = _state.history.slice(-MAX_HISTORY);
      }
      _state.lastQuestion = null;
    } catch (e) {
      if (bubble) {
        /* Ya se había pintado texto: se conserva y se avisa aparte, para no
           perder lo que el usuario alcanzó a recibir. */
        addError('La respuesta se interrumpió: ' + (e && e.message ? e.message : 'error desconocido'));
      } else {
        addError(e && e.message ? e.message : 'Error desconocido al consultar el asistente.');
      }
      console.warn('[AI]', e);
    } finally {
      hideTyping();
      setBusy(false);
      if (inp) inp.focus();
    }
  }

  function togglePanel() {
    var p = el('ai-panel');
    if (!p) return;
    p.classList.toggle('open');
    if (p.classList.contains('open')) syncWelcomeCount();
  }

  function suggest(t) {
    var inp = el('ai-input');
    if (inp) inp.value = t;
    send(t);
  }

  /* ══ API pública ═════════════════════════════════════════════════════════ */

  /* Los tres globales que consume el dispatcher (módulo 25) se conservan con
     el mismo nombre y firma: no hay que tocar el HTML ni el 25. */
  window.toggleAIPanel = togglePanel;
  window.aiSuggest     = suggest;
  window.aiSend        = function () { send(); };

  /* Namespace propio. `apiKey` está aquí porque el módulo 21 la necesita para
     su fallback de calendario; antes dependía del global suelto `_gk`. */
  window.PdAiAgent = {
    open:   togglePanel,
    send:   send,
    apiKey: apiKey,
    reset:  function () { _state.history = []; }
  };

})();
