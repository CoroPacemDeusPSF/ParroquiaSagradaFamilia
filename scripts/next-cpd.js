#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       scripts/next-cpd.js
 *   @brief      Calcula el próximo ID `cpd-XXX` disponible en data/songs.json
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.36
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   USO
   ============================================================================
   Desde la raíz del repo:
     node scripts/next-cpd.js

   El script:
     1. Lee data/songs.json
     2. Extrae todos los IDs cpd-XXX en uso
     3. Reporta el MÁXIMO actual y sugiere el SIGUIENTE disponible
     4. Lista los gaps históricos (IDs que NO se reasignan)

   Los IDs en gaps son intencionales y no deben reciclarse — corresponden a
   cantos que existieron en versiones anteriores y luego fueron retirados.
   ============================================================================ */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Configuración ─────────────────────────────────────────────────────────────
const SONGS_JSON_PATH = path.join(__dirname, '..', 'data', 'songs.json');

// IDs que históricamente quedaron como gaps. Documentados aquí para que el
// próximo desarrollador (o el yo del futuro) sepa que NO debe reasignarlos.
const HISTORICAL_GAPS = ['cpd-087', 'cpd-088'];

// ── Lectura del JSON ──────────────────────────────────────────────────────────
let songs;
try {
  const raw = fs.readFileSync(SONGS_JSON_PATH, 'utf-8');
  songs = JSON.parse(raw);
} catch (err) {
  console.error(`✗ Error leyendo ${SONGS_JSON_PATH}:`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

// ── Extracción de IDs en uso ──────────────────────────────────────────────────
const usedIds = new Set();
for (const song of songs) {
  if (typeof song.cpd === 'string' && /^cpd-\d{3}$/.test(song.cpd)) {
    usedIds.add(song.cpd);
  }
}

// ── Cálculo del próximo disponible ────────────────────────────────────────────
const numbers = Array.from(usedIds).map((id) => parseInt(id.slice(4), 10));
const maxNum  = Math.max(...numbers);
const nextNum = maxNum + 1;
const nextId  = `cpd-${String(nextNum).padStart(3, '0')}`;

// ── Detección de gaps no documentados ─────────────────────────────────────────
const gapsFound = [];
for (let i = 1; i <= maxNum; i++) {
  const candidate = `cpd-${String(i).padStart(3, '0')}`;
  if (!usedIds.has(candidate)) {
    gapsFound.push(candidate);
  }
}

// ── Reporte ───────────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log('  Cancionero Dominical — Próximo ID disponible');
console.log('═'.repeat(60));
console.log(`  Cantos en JSON:       ${songs.length}`);
console.log(`  IDs únicos en uso:    ${usedIds.size}`);
console.log(`  ID máximo actual:     cpd-${String(maxNum).padStart(3, '0')}`);
console.log(`  Próximo disponible:   ${nextId}`);
console.log('═'.repeat(60));

if (gapsFound.length > 0) {
  console.log('\n  Gaps en la numeración:');
  for (const g of gapsFound) {
    const isHistorical = HISTORICAL_GAPS.includes(g);
    const tag = isHistorical ? '(histórico — NO reasignar)' : '(libre)';
    console.log(`    • ${g}  ${tag}`);
  }
}

console.log('');
