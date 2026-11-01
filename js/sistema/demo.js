/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/sistema/demo.js
 *   @brief      Página Sistema: datos de muestra para probar en local
 *   @project    Cancionero Dominical
 *   @version    v3.6.10
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Solo se usa en localhost con ?demo (app.js lo impide en producción).
 * Fabrica sesiones con la misma forma que escribe el módulo 39, para ver la
 * página llena sin tocar Firebase. Pseudoaleatorio con semilla: cada carga
 * del mismo día da lo mismo.
 */

import { ultimosDias } from './datos.js?v=3.6.10';

function generador(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CANTOS = ['cpd-001', 'cpd-012', 'cpd-025', 'cpd-039', 'cpd-040', 'cpd-062', 'cpd-111',
  'cpd-114', 'cpd-115', 'cpd-145', 'cpd-155', 'cpd-156', 'cpd-158', 'cpd-159', 'cpd-070', 'cpd-090'];
const EQUIPOS = [
  { dp: 'movil', so: 'Android 14', nav: 'Chrome 141', mod: 'SM-A546E', px: '412x915@2.6' },
  { dp: 'movil', so: 'iOS 18.6', nav: 'Safari 18', px: '390x844@3' },
  { dp: 'movil', so: 'Android 13', nav: 'Facebook (interno)', mod: 'moto g54', px: '393x873@2.8' },
  { dp: 'movil', so: 'Android 15', nav: 'Chrome 142', mod: 'Redmi Note 13', px: '393x873@2.8' },
  { dp: 'tablet', so: 'iPadOS 18.5', nav: 'Safari 18', px: '820x1180@2' },
  { dp: 'escritorio', so: 'Windows 10/11', nav: 'Chrome 142', px: '1920x1080@1' },
  { dp: 'escritorio', so: 'macOS 10.15', nav: 'Safari 18', px: '1512x982@2' }
];
const ZONAS = ['America/Lima', 'America/Lima', 'America/Lima', 'America/Lima', 'America/Lima',
  'America/Lima', 'America/Bogota', 'Europe/Madrid', 'America/New_York', 'America/Santiago'];
const BUSCAS = ['pescador', 'ave maria', 'alma misionera', 'santo', 'cordero', 'gloria', 'espiritu'];
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function datosDemo(nDias, ahora = Date.now()) {
  const dias = ultimosDias(nDias, ahora);
  const azar = generador(Number(dias[dias.length - 1].replace(/-/g, '')));
  const elige = (xs) => xs[Math.floor(azar() * xs.length)];
  const id = (n) => Array.from({ length: n }, () => ABC[Math.floor(azar() * ABC.length)]).join('');
  const visitantes = Array.from({ length: 60 }, () => id(12));

  const v = {}, a = {};
  dias.forEach((dia, i) => {
    const [y, m, d] = dia.split('-').map(Number);
    const medianoche = Date.UTC(y, m - 1, d) + 5 * 3600000;    // 00:00 en Lima
    const domingo = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
    const n = Math.round((domingo ? 34 : 9) + azar() * (domingo ? 18 : 10));
    v[dia] = {};
    for (let k = 0; k < n; k++) {
      // Domingo: picos antes de las misas (7-8, 10-11, 18-19).
      const hora = domingo ? elige([7, 7, 8, 10, 10, 11, 17, 18, 18, 19, 12, 20]) : 6 + Math.floor(azar() * 17);
      const t = medianoche + hora * 3600000 + Math.floor(azar() * 3600000);
      if (t > ahora) continue;
      const eq = elige(EQUIPOS);
      const entra = azar();
      const cpd = elige(CANTOS);
      const h = {
        t, v: elige(visitantes), tz: elige(ZONAS), id: elige(['es-PE', 'es-PE', 'es-419', 'es-ES', 'en-US']),
        ...eq, ent: entra < 0.35 ? 'compartido:' + cpd : entra < 0.5 ? 'canto:' + cpd : entra < 0.75 ? 'dominical' : 'portada',
        ref: entra < 0.35 ? elige(['', 'l.facebook.com', 'www.google.com']) : '',
        pg: entra < 0.75 ? 'dominical' : 'portada',
        ver: i < nDias - 2 && azar() < 0.15 ? 'v3.6.9r5' : 'v3.6.9r6', pwa: azar() < 0.05
      };
      const e = [{ o: 0, k: 'vista', d: h.pg }];
      let o = 0;
      const pasos = 1 + Math.floor(azar() * 9);
      for (let p = 0; p < pasos; p++) {
        o += 8000 + Math.floor(azar() * 90000);
        const r = azar();
        const c = elige(CANTOS);
        if (r < 0.4) e.push({ o, k: 'canto', d: c });
        else if (r < 0.55) e.push({ o, k: 'acordes', d: c });
        else if (r < 0.65) e.push({ o, k: 'contexto', d: c });
        else if (r < 0.75) e.push({ o, k: 'busca', d: elige(BUSCAS) });
        else if (r < 0.8) e.push({ o, k: 'comparte', d: c });
        else if (r < 0.85) e.push({ o, k: 'modo', d: 'coro' });
        else if (r < 0.9) e.push({ o, k: 'salmo' });
        else if (r < 0.93) e.push({ o, k: 'ia', d: 'abre' });
        else e.push({ o, k: 'sigue' });
      }
      if (azar() < 0.04) e.push({ o: o + 500, k: 'error', d: "Cannot read properties of null (reading 'classList') @15-build-index.js:212" });
      e.push({ o: o + 4000, k: 'oculta' });
      v[dia][id(16)] = { h, e };
    }

    // Rastro de administradores: Renzo algunos días, Aldo menos.
    [['ihLzgmElwcRUvJrHRZOUOuMJoMF2', 0.6], ['pctXGNX3oiRQ9XSni54tC7e9fWR2', 0.25]].forEach(([uid, p]) => {
      if (azar() > p) return;
      const t = medianoche + (9 + Math.floor(azar() * 12)) * 3600000;
      if (t > ahora) return;
      const c = elige(CANTOS);
      a[dia] = a[dia] || {};
      a[dia][uid] = a[dia][uid] || {};
      a[dia][uid][id(16)] = {
        h: { t, v: id(12), tz: 'America/Lima', id: 'es-PE', ...EQUIPOS[uid[0] === 'i' ? 5 : 0],
             ent: 'dominical', ref: '', pg: 'dominical', ver: 'v3.6.9r6', pwa: false },
        e: [
          { o: 0, k: 'entra', d: 'coro' },
          { o: 15000, k: 'modo', d: 'coro+edicion' },
          { o: 60000, k: 'canto', d: c },
          { o: 240000, k: 'escribe', d: 'PUT chord-overrides/' + c },
          { o: 245000, k: 'escribe', d: 'PUT chord-history/' + c + '/1761950000000' },
          { o: 400000, k: 'escribe', d: 'PUT setlist/' + dia + '/s3' },
          { o: 420000, k: 'agrega', d: elige(CANTOS) },
          { o: 600000, k: 'oculta' }
        ]
      };
    });
  });

  // Una visita «ahora mismo» para ver el bloque en vivo.
  const hoy = dias[dias.length - 1];
  v[hoy] = v[hoy] || {};
  v[hoy][id(16)] = {
    h: { t: ahora - 95000, v: visitantes[0], tz: 'America/Lima', id: 'es-PE', ...EQUIPOS[0],
         ent: 'compartido:cpd-111', ref: '', pg: 'dominical', ver: 'v3.6.9r6', pwa: false },
    e: [{ o: 0, k: 'vista', d: 'dominical' }, { o: 2000, k: 'canto', d: 'cpd-111' },
        { o: 41000, k: 'acordes', d: 'cpd-111' }, { o: 90000, k: 'busca', d: 'pescador' }]
  };

  return { v, a, bytes: JSON.stringify({ v, a }).length };
}
