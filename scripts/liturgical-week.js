#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       scripts/liturgical-week.js
 *   @brief      Extrae los datos litúrgicos de un domingo para el generador de fondos
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.6.7r22
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   USO
 *     node scripts/liturgical-week.js            → próximo domingo
 *     node scripts/liturgical-week.js 2026-12-25 → un domingo concreto
 *     node scripts/liturgical-week.js --check     → solo valida que se puede leer
 *
 *   Imprime JSON por stdout. Sale con código 1 si la fecha no está en el
 *   calendario local (después de 2028, por ejemplo).
 *
 *   POR QUÉ SE EJECUTA EL MÓDULO 21 EN VEZ DE PARSEAR SU TEXTO
 *   El calendario vive dentro de `21-liturgical-card.js` como objeto literal.
 *   Sacarlo con expresiones regulares sería frágil: cualquier cambio de formato
 *   —una coma, un salto de línea, una comilla escapada— rompería el guion en
 *   silencio. En vez de eso se ejecuta el módulo en un sandbox de Node con un
 *   `window` y un `document` de mentira, y se lee `window.LITURGICAL_DATA`, que
 *   es el mismo contrato público que consume el navegador.
 *
 *   El módulo solo pinta la tarjeta si `document.readyState !== 'loading'`. Al
 *   declararlo como 'loading', registra un listener que nunca se dispara y se
 *   salta todo el trabajo de DOM, pero igualmente publica el calendario al
 *   final de su IIFE. Es exactamente el comportamiento que necesitamos.
 * ──────────────────────────────────────────────────────────────────────────── */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MODULE_PATH = path.join(__dirname, '..', 'js', 'modules', '21-liturgical-card.js');

function loadLiturgicalData() {
  const code = fs.readFileSync(MODULE_PATH, 'utf8');

  const noop = () => {};
  const fakeWindow = {};
  const sandbox = {
    window: fakeWindow,
    document: {
      readyState: 'loading',      // impide que el módulo toque el DOM
      addEventListener: noop,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add: noop, remove: noop },
                              appendChild: noop, setAttribute: noop }),
    },
    console: { log: noop, warn: noop, error: noop },
    fetch: () => Promise.reject(new Error('sin red en este contexto')),
    setTimeout: noop,
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  };
  sandbox.window = sandbox;   // el módulo escribe en window.*
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: '21-liturgical-card.js', timeout: 10000 });

  const data = sandbox.window.LITURGICAL_DATA;
  if (!data || typeof data !== 'object') {
    throw new Error('El módulo 21 no publicó window.LITURGICAL_DATA. ¿Cambió su estructura?');
  }
  return data;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** Hoy si hoy es domingo; si no, el próximo. Mismo criterio que el sitio. */
function upcomingSundayKey(from) {
  const d = from ? new Date(from + 'T12:00:00Z') : new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

/** ISO week id, p. ej. 2026-W35 — es el `week_id` del preset. */
function isoWeekId(key) {
  const d = new Date(key + 'T12:00:00Z');
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;        // lunes = 0
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
  return target.getUTCFullYear() + '-W' + pad2(week);
}

const COLOR_EN = {
  'Verde': 'green', 'Blanco': 'white', 'Morado': 'violet',
  'Rojo': 'red', 'Rosa': 'rose',
};

function main() {
  const args = process.argv.slice(2);
  const data = loadLiturgicalData();
  const keys = Object.keys(data).sort();

  if (args.includes('--check')) {
    process.stdout.write(JSON.stringify({
      ok: true, domingos: keys.length, desde: keys[0], hasta: keys[keys.length - 1],
    }, null, 2) + '\n');
    return;
  }

  const explicit = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const key = explicit ? upcomingSundayKey(explicit) : upcomingSundayKey();
  const entry = data[key];

  if (!entry) {
    process.stderr.write(
      'El domingo ' + key + ' no está en el calendario local ' +
      '(cubre de ' + keys[0] + ' a ' + keys[keys.length - 1] + ').\n' +
      'Hay que ampliar window.LITURGICAL_DATA en js/modules/21-liturgical-card.js.\n'
    );
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({
    sunday_key:         key,
    week_id:            isoWeekId(key),
    liturgical_context: entry.n,
    featured_subject:   entry.e || entry.n,
    has_saint:          !!entry.e,
    gospel:             entry.ev || '',
    gospel_theme:       entry.tema || '',
    antiphon:           entry.ant || '',
    season:             entry.t || '',
    cycle:              entry.ci || '',
    liturgical_color:   entry.c || 'Verde',
    liturgical_color_en: COLOR_EN[entry.c] || 'green',
    calendar_range:     { first: keys[0], last: keys[keys.length - 1] },
  }, null, 2) + '\n');
}

main();
