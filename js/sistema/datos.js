/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/sistema/datos.js
 *   @brief      Página Sistema: lectura de /monitor, resúmenes y textos
 *   @project    Cancionero Dominical
 *   @version    v3.6.10
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Lo que escribe el módulo 39 (js/modules/39-monitor.js), leído y resumido.
 * Sin dependencias: lo usa app.js, que pone la interfaz.
 *
 * Cada sesión trae una cabecera h con la hora del servidor (h.t) y eventos con
 * o = milisegundos desde que empezó la sesión EN EL EQUIPO. La cabecera se
 * escribe con el primer envío (hasta 20 s después de empezar), así que la hora
 * de un evento se aproxima como h.t + o: puede ir hasta 20 s adelantada. Para
 * esta página da igual.
 */

export const DB = 'https://coropacemdeusdominical-default-rtdb.firebaseio.com';
export const RENZO = 'ihLzgmElwcRUvJrHRZOUOuMJoMF2';
export const ADMINS = {
  ihLzgmElwcRUvJrHRZOUOuMJoMF2: 'Renzo',
  pctXGNX3oiRQ9XSni54tC7e9fWR2: 'Aldo'
};

/* ── Fechas en hora de Lima (lección 18) ──────────────────────────────── */

const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
});
const fmtHora = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false
});
const fmtHoraSeg = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});
const fmtH = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Lima', hour: 'numeric', hour12: false
});

export function diaLima(ms) {
  const m = fmtDia.format(new Date(ms)).match(/(\d{4})\D(\d{2})\D(\d{2})/);
  return m[1] + '-' + m[2] + '-' + m[3];
}
export function horaLima(ms) { return Number(fmtH.format(new Date(ms))) % 24; }
export function hhmm(ms) { return fmtHora.format(new Date(ms)); }
export function hhmmss(ms) { return fmtHoraSeg.format(new Date(ms)); }

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-01' → { corta: '1', larga: 'dom 1-nov' } (calendario puro, sin zona). */
export function etiquetaDia(dia) {
  const [a, m, d] = dia.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return { corta: String(d), larga: DIAS[dow] + ' ' + d + '-' + MESES[m - 1], dow };
}

/** Las n claves de día que terminan hoy (Lima), de la más antigua a hoy. */
export function ultimosDias(n, ahora = Date.now()) {
  const hoy = diaLima(ahora);
  const [a, m, d] = hoy.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const f = new Date(Date.UTC(a, m - 1, d - i));
    out.push(f.toISOString().slice(0, 10));
  }
  return out;
}

export function duracion(ms) {
  if (!(ms > 0)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' s';
  const min = Math.round(s / 60);
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
}

export function haceCuanto(ms, ahora = Date.now()) {
  const s = Math.max(0, Math.round((ahora - ms) / 1000));
  if (s < 60) return 'hace ' + s + ' s';
  const m = Math.round(s / 60);
  if (m < 60) return 'hace ' + m + ' min';
  const h = Math.round(m / 60);
  if (h < 48) return 'hace ' + h + ' h';
  return 'hace ' + Math.round(h / 24) + ' días';
}

/* ── Lectura ───────────────────────────────────────────────────────────── */

export class ErrorLectura extends Error {
  constructor(codigo, detalle) { super(codigo); this.codigo = codigo; this.detalle = detalle; }
}

async function leerJSON(url) {
  let r;
  try { r = await fetch(url, { cache: 'no-store' }); }
  catch (e) { throw new ErrorLectura('red', String(e && e.message || e)); }
  // Lección 12: un 401 parseado como JSON parece «no hay datos».
  if (r.status === 401 || r.status === 403) throw new ErrorLectura('permiso', r.status);
  if (!r.ok) throw new ErrorLectura('http', r.status);
  const texto = await r.text();
  return { datos: JSON.parse(texto || 'null'), bytes: texto.length };
}

/**
 * Lee /monitor/{v,a} entre dos días (inclusive). Devuelve { v, a, bytes }.
 * orderBy="$key" no necesita índice en las reglas.
 */
export async function leerRango(desde, hasta, token) {
  const q = 'orderBy=' + encodeURIComponent('"$key"') +
            '&startAt=' + encodeURIComponent('"' + desde + '"') +
            '&endAt=' + encodeURIComponent('"' + hasta + '"') +
            '&auth=' + encodeURIComponent(token);
  const [v, a] = await Promise.all([
    leerJSON(DB + '/monitor/v.json?' + q),
    leerJSON(DB + '/monitor/a.json?' + q)
  ]);
  return { v: v.datos || {}, a: a.datos || {}, bytes: v.bytes + a.bytes };
}

/** Firebase devuelve como arreglo (con huecos null) las claves 0,1,2… */
function listaEventos(e) {
  if (!e) return [];
  const out = [];
  Object.keys(e).forEach((n) => {
    const ev = e[n];
    if (ev && typeof ev === 'object') out.push({ n: Number(n), o: Number(ev.o) || 0, k: ev.k, d: ev.d || '' });
  });
  return out.sort((x, y) => x.n - y.n);
}

function sesion(tipo, dia, sid, nodo, uid) {
  if (!nodo || !nodo.h || typeof nodo.h.t !== 'number') return null;
  const eventos = listaEventos(nodo.e);
  const maxO = eventos.reduce((m, ev) => Math.max(m, ev.o), 0);
  return {
    clave: tipo + ':' + sid, tipo, dia, sid, uid: uid || null,
    h: nodo.h, eventos,
    inicio: nodo.h.t, fin: nodo.h.t + maxO, dur: maxO,
    tope: eventos.length >= 200
  };
}

/** De los árboles crudos de leerRango a una lista plana de sesiones. */
export function aplanar(crudo) {
  const out = [];
  Object.keys(crudo.v || {}).forEach((dia) => {
    const sesiones = crudo.v[dia] || {};
    Object.keys(sesiones).forEach((sid) => {
      const s = sesion('v', dia, sid, sesiones[sid]);
      if (s) out.push(s);
    });
  });
  Object.keys(crudo.a || {}).forEach((dia) => {
    const porUid = crudo.a[dia] || {};
    Object.keys(porUid).forEach((uid) => {
      Object.keys(porUid[uid] || {}).forEach((sid) => {
        const s = sesion('a', dia, sid, porUid[uid][sid], uid);
        if (s) out.push(s);
      });
    });
  });
  return out.sort((x, y) => y.inicio - x.inicio);
}

/* ── Catálogo: cpd/did → título ───────────────────────────────────────── */

export async function leerCatalogo(base) {
  const r = await fetch(base + 'data/songs.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('songs.json ' + r.status);
  const cantos = await r.json();
  const mapa = {};
  cantos.forEach((c) => {
    const t = { titulo: c.title, momento: c.moment, cpd: c.cpd };
    mapa[c.cpd] = t;
    if (c.did) mapa[c.did] = t;
  });
  return { mapa, total: cantos.length };
}

export function tituloDe(id, catalogo) {
  const c = catalogo && catalogo.mapa[id];
  return c ? c.titulo : id;
}

/* ── Zona horaria → país (aproximación, no ubicación) ─────────────────── */

const ZONAS = {
  'America/Lima': 'Perú',
  'America/Bogota': 'Colombia', 'America/Guayaquil': 'Ecuador', 'Pacific/Galapagos': 'Ecuador',
  'America/La_Paz': 'Bolivia', 'America/Santiago': 'Chile', 'America/Punta_Arenas': 'Chile',
  'America/Caracas': 'Venezuela', 'America/Asuncion': 'Paraguay', 'America/Montevideo': 'Uruguay',
  'America/Panama': 'Panamá', 'America/Costa_Rica': 'Costa Rica', 'America/Guatemala': 'Guatemala',
  'America/El_Salvador': 'El Salvador', 'America/Tegucigalpa': 'Honduras', 'America/Managua': 'Nicaragua',
  'America/Havana': 'Cuba', 'America/Santo_Domingo': 'Rep. Dominicana', 'America/Puerto_Rico': 'Puerto Rico',
  'America/Toronto': 'Canadá', 'America/Vancouver': 'Canadá', 'America/Montreal': 'Canadá',
  'America/Edmonton': 'Canadá', 'America/Winnipeg': 'Canadá', 'America/Halifax': 'Canadá',
  'Europe/Madrid': 'España', 'Atlantic/Canary': 'España', 'Europe/Rome': 'Italia', 'Europe/Vatican': 'Vaticano',
  'Europe/Paris': 'Francia', 'Europe/London': 'Reino Unido', 'Europe/Berlin': 'Alemania',
  'Europe/Lisbon': 'Portugal', 'Europe/Amsterdam': 'Países Bajos', 'Europe/Brussels': 'Bélgica',
  'Europe/Zurich': 'Suiza', 'Europe/Vienna': 'Austria', 'Europe/Dublin': 'Irlanda', 'Europe/Warsaw': 'Polonia',
  'Asia/Tokyo': 'Japón', 'Asia/Seoul': 'Corea del Sur', 'Asia/Manila': 'Filipinas', 'Asia/Shanghai': 'China',
  'Asia/Kolkata': 'India', 'Asia/Dubai': 'Emiratos Árabes'
};

export function paisDe(tz) {
  if (!tz || tz === 'desconocida') return 'Sin dato';
  if (ZONAS[tz]) return ZONAS[tz];
  if (/^America\/Argentina\//.test(tz) || tz === 'America/Buenos_Aires') return 'Argentina';
  if (/^America\/(Sao_Paulo|Fortaleza|Recife|Bahia|Belem|Manaus|Cuiaba|Porto_Velho|Rio_Branco|Campo_Grande|Maceio|Araguaina|Boa_Vista|Noronha)$/.test(tz)) return 'Brasil';
  if (/^America\/(Mexico_City|Monterrey|Merida|Cancun|Chihuahua|Hermosillo|Mazatlan|Tijuana|Matamoros|Bahia_Banderas|Ojinaga)$/.test(tz)) return 'México';
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/.*|Kentucky\/.*|North_Dakota\/.*|Juneau|Adak)$/.test(tz) || tz === 'Pacific/Honolulu') return 'EE. UU.';
  if (/^Australia\//.test(tz)) return 'Australia';
  if (/^(UTC|Etc\/)/.test(tz)) return 'Sin zona (UTC)';
  return tz.split('/').pop().replace(/_/g, ' ');
}

/* ── Textos ───────────────────────────────────────────────────────────── */

const PAGINAS = { portada: 'la portada', dominical: 'el cancionero', salmos: 'los salmos' };
const DISPOSITIVOS = { movil: 'Móvil', tablet: 'Tablet', escritorio: 'Escritorio' };
const MODOS = {
  publica: 'Pública', coro: 'Coro', bodas: 'Bodas', novios: 'Novios',
  'coro+edicion': 'Coro con edición', 'bodas+edicion': 'Bodas con edición', 'publica+edicion': 'Edición'
};
const NODOS = {
  'chord-overrides': 'acordes', 'lyrics-overrides': 'letra', 'chord-history': 'historial de acordes',
  'lyrics-history': 'historial de letra', setlist: 'SetList dominical', 'setlist-bodas': 'SetList de bodas',
  'agent-feedback': 'opinión del asistente', 'liturgical-card-feedback': 'opinión de la tarjeta'
};

export const nombreDispositivo = (d) => DISPOSITIVOS[d] || d || 'Sin dato';
export const nombreModo = (m) => MODOS[m] || m;
export const nombrePagina = (p) => PAGINAS[p] || p;

export function nombreEntrada(ent, catalogo) {
  if (!ent) return 'Sin dato';
  const [tipo, id] = ent.split(':');
  if (tipo === 'compartido') return 'Enlace compartido de un canto';
  if (tipo === 'canto') return 'Enlace directo a un canto';
  if (tipo === 'portada') return 'Portada';
  if (tipo === 'dominical') return 'Cancionero';
  return ent;
}

/** Una línea legible para un evento. Devuelve { texto, tono } (tono: '', 'escribe', 'error'). */
export function describir(ev, catalogo) {
  const t = (id) => '«' + tituloDe(id, catalogo) + '»';
  const d = ev.d || '';
  switch (ev.k) {
    case 'vista': return { texto: 'Abrió ' + nombrePagina(d) };
    case 'canto': return { texto: 'Fue a ' + t(d) };
    case 'acordes': return { texto: 'Vio los acordes de ' + t(d) };
    case 'contexto': return { texto: 'Leyó el contexto de ' + t(d) };
    case 'comparte': return { texto: d === 'sitio' ? 'Compartió el sitio' : 'Compartió ' + t(d) };
    case 'agrega': return { texto: 'Agregó ' + t(d) + ' al SetList' };
    case 'busca': return { texto: 'Buscó “' + d + '”' };
    case 'modo': return { texto: 'Pasó a modo ' + nombreModo(d) };
    case 'setlist': return { texto: 'Abrió el SetList' };
    case 'ia':
      if (d === 'abre') return { texto: 'Abrió el asistente' };
      if (d === 'pregunta') return { texto: 'Preguntó al asistente' };
      return { texto: 'El asistente consultó a Gemini' };
    case 'salmo': return { texto: 'Escuchó el salmo' };
    case 'pdf': return { texto: 'Descargó el PDF del SetList' };
    case 'accion': return { texto: d.charAt(0).toUpperCase() + d.slice(1) };
    case 'escribe': {
      const m = d.match(/^(\w+) ([^/ ]+)(?:\/([^ ]*))?(?: ✗(\w+))?$/);
      if (!m) return { texto: 'Escritura: ' + d, tono: 'escribe' };
      const [, metodo, nodo, resto, fallo] = m;
      const que = NODOS[nodo] || nodo;
      const cpd = (resto || '').match(/cpd-\d{3}/);
      const verbo = metodo === 'DELETE' ? 'Borró' : 'Guardó';
      const sobre = cpd ? ' de ' + t(cpd[0]) : resto ? ' (' + resto + ')' : '';
      return {
        texto: verbo + ' ' + que + sobre + (fallo ? ' — falló (' + fallo + ')' : ''),
        tono: fallo ? 'error' : 'escribe'
      };
    }
    case 'entra': return { texto: 'Inició sesión' + (d ? ' (' + nombreModo(d) + ')' : ''), tono: 'escribe' };
    case 'cierra': return { texto: 'Cerró sesión' };
    case 'noadmin': return { texto: 'Entró con una cuenta sin permisos', tono: 'error' };
    case 'error': return { texto: 'Error: ' + d, tono: 'error' };
    case 'oculta': return { texto: 'Dejó la pestaña' };
    case 'vuelve': return { texto: 'Volvió' };
    case 'sigue': return { texto: 'Sigue en la página' };
    default: return { texto: ev.k + (d ? ': ' + d : '') };
  }
}

/* ── Resúmenes ────────────────────────────────────────────────────────── */

function contar(mapa, clave, n = 1) { mapa.set(clave, (mapa.get(clave) || 0) + n); }

/** Map → [{ clave, valor }] de mayor a menor. */
export function ordenar(mapa) {
  return Array.from(mapa, ([clave, valor]) => ({ clave, valor })).sort((a, b) => b.valor - a.valor);
}

function mediana(xs) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Todo lo que pinta la página, calculado una vez por carga.
 * dias: claves del rango; hoy: si el rango es solo hoy (gráfico por horas).
 */
export function resumir(sesiones, dias, ahora = Date.now()) {
  const enRango = new Set(dias);
  const visitas = sesiones.filter((s) => s.tipo === 'v' && enRango.has(s.dia));
  const admins = sesiones.filter((s) => s.tipo === 'a' && enRango.has(s.dia));

  const r = {
    visitas, admins,
    visitantes: new Set(visitas.map((s) => s.h.v)).size,
    porDia: new Map(dias.map((d) => [d, 0])),
    porHora: new Map(Array.from({ length: 24 }, (_, h) => [h, 0])),
    dispositivo: new Map(), so: new Map(), nav: new Map(), pais: new Map(), idioma: new Map(),
    entrada: new Map(), origen: new Map(), version: new Map(), modelo: new Map(),
    cantos: new Map(), acordes: new Map(), contexto: new Map(), busquedas: new Map(),
    compartidos: new Map(), modos: new Map(), acciones: new Map(),
    errores: new Map(), // mensaje → { n, ultimo, sesiones:Set }
    eventos: 0, conTope: 0, pwa: 0,
    ahora: []
  };

  const duraciones = [];
  visitas.forEach((s) => {
    const h = s.h;
    contar(r.porDia, s.dia);
    if (dias.length === 1) contar(r.porHora, horaLima(s.inicio));
    contar(r.dispositivo, h.dp || 'sin');
    contar(r.so, h.so || 'Sin dato');
    contar(r.nav, h.nav || 'Sin dato');
    contar(r.pais, paisDe(h.tz));
    contar(r.idioma, (h.id || 'sin dato').split('-')[0].toLowerCase());
    contar(r.entrada, (h.ent || '').split(':')[0] || 'sin');
    if (h.ref) contar(r.origen, h.ref);
    if (h.ver) contar(r.version, h.ver);
    if (h.mod) contar(r.modelo, h.mod);
    if (h.pwa) r.pwa += 1;
    if (s.tope) r.conTope += 1;
    if (s.eventos.length >= 2) duraciones.push(s.dur);
    r.eventos += s.eventos.length;

    const vistos = new Set();   // un canto cuenta una vez por sesión
    s.eventos.forEach((ev) => {
      const d = ev.d || '';
      switch (ev.k) {
        case 'canto': if (!vistos.has(d)) { vistos.add(d); contar(r.cantos, d); } break;
        case 'acordes': contar(r.acordes, d); break;
        case 'contexto': contar(r.contexto, d); break;
        case 'busca': contar(r.busquedas, d); break;
        case 'comparte': contar(r.compartidos, d); break;
        case 'modo': contar(r.modos, d); break;
        case 'setlist': contar(r.acciones, 'Abrió el SetList'); break;
        case 'salmo': contar(r.acciones, 'Escuchó el salmo'); break;
        case 'pdf': contar(r.acciones, 'Descargó el PDF'); break;
        case 'ia': if (d !== 'consulta') contar(r.acciones, d === 'abre' ? 'Abrió el asistente' : 'Preguntó al asistente'); break;
        default: break;
      }
    });
  });

  // Errores: de visitas y de administradores.
  visitas.concat(admins).forEach((s) => {
    s.eventos.forEach((ev) => {
      if (ev.k !== 'error') return;
      const e = r.errores.get(ev.d) || { n: 0, ultimo: 0, sesiones: new Set(), equipos: new Map() };
      e.n += 1;
      e.ultimo = Math.max(e.ultimo, s.inicio + ev.o);
      e.sesiones.add(s.clave);
      contar(e.equipos, (s.h.nav || '?') + ' · ' + (s.h.so || '?'));
      r.errores.set(ev.d, e);
    });
  });

  r.mediana = mediana(duraciones);
  const moviles = (r.dispositivo.get('movil') || 0) + (r.dispositivo.get('tablet') || 0);
  r.pctMovil = visitas.length ? Math.round(100 * moviles / visitas.length) : 0;
  const cantosAbiertos = Array.from(r.cantos.values()).reduce((a, b) => a + b, 0);
  r.cantosAbiertos = cantosAbiertos;

  // «Ahora»: sesiones con actividad en los últimos 5 minutos (sin «oculta» al final).
  r.ahora = sesiones.filter((s) => {
    const ult = s.eventos[s.eventos.length - 1];
    return ahora - s.fin < 5 * 60000 && !(ult && (ult.k === 'oculta' || ult.k === 'cierra'));
  });

  return r;
}
