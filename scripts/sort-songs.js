#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       scripts/sort-songs.js
 *   @brief      Ordena alfabéticamente los cantos dentro de cada sección
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.37
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   USO
   ============================================================================
   Desde la raíz del repo:
     node scripts/sort-songs.js          # ejecuta y guarda
     node scripts/sort-songs.js --dry    # muestra cambios sin guardar

   El script:
     1. Lee data/songs.json
     2. Agrupa los cantos por moment (Entrada, Piedad, Gloria, ...)
     3. Ordena alfabéticamente DENTRO de cada moment
     4. Preserva el ORDEN ORIGINAL de los moments (importante: el renderer
        usa este orden para los moment-headers)
     5. Reescribe el JSON con la indentación estándar del proyecto

   Reglas de ordenamiento:
     • Comparación es-PE (locale español, ignora mayúsculas/minúsculas)
     • Los artículos iniciales NO se ignoran (ej. "El Pueblo de Dios"
       va donde corresponde por la 'E')
     • Los caracteres especiales (♫, ✦) NO se incluyen en el campo `title`,
       así que no afectan el ordenamiento
   ============================================================================ */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Configuración ─────────────────────────────────────────────────────────────
const SONGS_JSON_PATH = path.join(__dirname, '..', 'data', 'songs.json');
const DRY_RUN         = process.argv.includes('--dry');

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

// ── Agrupación por moment (preservando orden de aparición) ────────────────────
const momentOrder  = [];
const songsByMoment = new Map();

for (const song of songs) {
  if (!songsByMoment.has(song.moment)) {
    momentOrder.push(song.moment);
    songsByMoment.set(song.moment, []);
  }
  songsByMoment.get(song.moment).push(song);
}

// ── Ordenamiento alfabético dentro de cada moment ─────────────────────────────
const collator = new Intl.Collator('es-PE', {
  sensitivity: 'base',
  numeric:     true,
});

let totalReordered = 0;
const sortedSongs = [];

for (const moment of momentOrder) {
  const group       = songsByMoment.get(moment);
  const beforeOrder = group.map((s) => s.title);
  group.sort((a, b) => collator.compare(a.title, b.title));
  const afterOrder = group.map((s) => s.title);

  // Detectar si hubo cambios
  let changed = false;
  for (let i = 0; i < beforeOrder.length; i++) {
    if (beforeOrder[i] !== afterOrder[i]) {
      changed = true;
      break;
    }
  }

  if (changed) {
    totalReordered++;
    console.log(`  ↻ ${moment} (${group.length} cantos): reordenado`);
  } else {
    console.log(`  ✓ ${moment} (${group.length} cantos): ya ordenado`);
  }

  sortedSongs.push(...group);
}

// ── Reporte y escritura ───────────────────────────────────────────────────────
console.log('');
console.log('═'.repeat(60));
console.log(`  Total cantos:           ${songs.length}`);
console.log(`  Secciones procesadas:   ${momentOrder.length}`);
console.log(`  Secciones reordenadas:  ${totalReordered}`);
console.log(`  Modo:                   ${DRY_RUN ? 'DRY RUN (no se guarda)' : 'guardar cambios'}`);
console.log('═'.repeat(60));

if (DRY_RUN) {
  console.log('\n  No se modificó ningún archivo (--dry).');
  console.log('  Quita la opción --dry para escribir los cambios.');
} else if (totalReordered > 0) {
  const formatted = JSON.stringify(sortedSongs, null, 2) + '\n';
  fs.writeFileSync(SONGS_JSON_PATH, formatted, 'utf-8');
  console.log(`\n  ✓ data/songs.json actualizado.`);
} else {
  console.log('\n  Sin cambios — el JSON ya está ordenado.');
}
