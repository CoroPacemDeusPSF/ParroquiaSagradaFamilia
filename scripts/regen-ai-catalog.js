#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       scripts/regen-ai-catalog.js
 *   @brief      Regenera el AI_CATALOG del agente AI desde data/songs.json
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.42r3
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   USO
   ============================================================================
   Desde la raíz del repo:
     node scripts/regen-ai-catalog.js          # regenera y guarda
     node scripts/regen-ai-catalog.js --dry    # muestra cambios sin guardar

   El script:
     1. Lee data/songs.json (114+ cantos)
     2. Para cada canto, extrae del context_html:
        • Compositor (primer <strong> en la sección "Compositor")
        • Versículo (contenido del primer <span class="ctx-verse">)
        • Tags litúrgicos (lista de ctx-tag-momento + ctx-tag-tiempo)
     3. Construye una línea de catálogo: "• Title [Moment] — Compositor: X
        — Versículo: «Y» — Tiempos: A, B, C"
     4. Reemplaza el bloque `var AI_CATALOG=`…`;` en
        js/modules/19-ai-agent.js
     5. Actualiza el conteo de cantos en cancioneros/dominical.html
     6. Reporta los cantos agregados/eliminados respecto al catálogo previo

   Cuándo correrlo:
     • Tras agregar/eliminar/mover cantos en data/songs.json
     • Antes de hacer push si el AI_CATALOG quedó desactualizado
   ============================================================================ */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Rutas ─────────────────────────────────────────────────────────────────────
const ROOT          = path.join(__dirname, '..');
const SONGS_PATH    = path.join(ROOT, 'data', 'songs.json');
const AI_AGENT_PATH = path.join(ROOT, 'js', 'modules', '19-ai-agent.js');
const HTML_PATH     = path.join(ROOT, 'cancioneros', 'dominical.html');

const DRY_RUN = process.argv.includes('--dry');


// ── Extractores de campos del context_html ───────────────────────────────────

/**
 * Extrae el "nombre del compositor" del context_html: el contenido del primer
 * <strong>...</strong> dentro del primer ctx-text de la sección "Compositor".
 * Si no hay sección Compositor o no hay <strong>, retorna null.
 */
function extractComposer(contextHtml) {
  if (!contextHtml) return null;

  // Localizar la sección "Compositor"
  const sectionMatch = contextHtml.match(
    /<div class="ctx-label">Compositor<\/div>\s*<div class="ctx-text">([\s\S]*?)<\/div>\s*<\/div>/
  );
  if (!sectionMatch) return null;

  // Tomar el primer <strong>...</strong>
  const strongMatch = sectionMatch[1].match(/<strong>([\s\S]*?)<\/strong>/);
  if (!strongMatch) return null;

  // Limpiar tags HTML residuales y normalizar espacios
  return strongMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}


/**
 * Extrae el contenido del primer <span class="ctx-verse">...</span>.
 * El verso típicamente tiene la forma: "«texto» — Referencia X,Y".
 * Retorna el texto completo o null si no hay versículo.
 */
function extractVerse(contextHtml) {
  if (!contextHtml) return null;

  const verseMatch = contextHtml.match(/<span class="ctx-verse">([\s\S]*?)<\/span>/);
  if (!verseMatch) return null;

  // Limpiar tags HTML residuales y normalizar espacios
  return verseMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}


/**
 * Extrae todos los tags litúrgicos (momento + tiempo) del context_html.
 * Retorna un arreglo de strings en el orden en que aparecen.
 */
function extractTags(contextHtml) {
  if (!contextHtml) return [];

  const matches = contextHtml.match(/<span class="ctx-tag[^"]*">([^<]+)<\/span>/g) || [];
  const tags    = matches.map((m) => m.match(/>([^<]+)</)[1].trim());

  // Eliminar duplicados preservando orden
  const seen = new Set();
  return tags.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}


// ── Construcción de la línea de catálogo ─────────────────────────────────────

/**
 * Construye una línea de catálogo en el formato:
 *   • Title [Moment] — Compositor: X — Versículo: «texto» — Tiempos: A, B, C
 *
 * Los campos opcionales (Compositor, Versículo) se omiten si no existen.
 */
function buildCatalogLine(song) {
  const composer = extractComposer(song.context_html);
  const verse    = extractVerse(song.context_html);
  const tags     = extractTags(song.context_html);

  let line = `• ${song.title} [${song.moment}]`;

  if (composer) line += ` — Compositor: ${composer}`;
  if (verse)    line += ` — Versículo: ${verse}`;
  if (tags.length > 0) line += ` — Tiempos: ${tags.join(', ')}`;

  return line;
}


// ── Diff entre catálogo anterior y nuevo ─────────────────────────────────────

/**
 * Lee el AI_CATALOG actual del archivo y devuelve un Set con los títulos
 * que aparecen en él. Útil para reportar cantos agregados/eliminados.
 */
function readPreviousTitles(content) {
  const m = content.match(/var AI_CATALOG=`([\s\S]*?)`;/);
  if (!m) return new Set();

  const titles = new Set();
  m[1].split('\\n').forEach((line) => {
    const titleMatch = line.match(/• ([^[]+) \[/);
    if (titleMatch) titles.add(titleMatch[1].trim());
  });
  return titles;
}


// ── Procedimiento principal ──────────────────────────────────────────────────

function main() {
  // 1. Cargar datos
  const songs       = JSON.parse(fs.readFileSync(SONGS_PATH,    'utf-8'));
  const aiAgentSrc  = fs.readFileSync(AI_AGENT_PATH, 'utf-8');
  const htmlSrc     = fs.readFileSync(HTML_PATH,     'utf-8');

  // 2. Construir el nuevo catálogo
  //    Las líneas se unen con '\n' literal (parte de la sintaxis del template
  //    string original que JavaScript interpreta como un salto de línea real
  //    al evaluar el archivo). Lo escribimos como '\\n' en el código fuente.
  const lines      = songs.map(buildCatalogLine);
  const newCatalog = lines.join('\\n');

  // 3. Diff con el catálogo previo
  const previousTitles = readPreviousTitles(aiAgentSrc);
  const currentTitles  = new Set(songs.map((s) => s.title));
  const added          = [...currentTitles].filter((t) => !previousTitles.has(t));
  const removed        = [...previousTitles].filter((t) => !currentTitles.has(t));

  // 4. Reemplazar el bloque AI_CATALOG en el módulo del agente
  const newAiAgentSrc = aiAgentSrc.replace(
    /var AI_CATALOG=`[\s\S]*?`;/,
    'var AI_CATALOG=`' + newCatalog + '`;'
  );

  // 5. Actualizar el conteo de cantos en el HTML del cancionero
  //    Patrón: "Conozco los <N> cantos del cancionero..."
  const newHtmlSrc = htmlSrc.replace(
    /Conozco los \d+ cantos/,
    `Conozco los ${songs.length} cantos`
  );

  // 6. Reporte
  console.log('═'.repeat(64));
  console.log('  Regeneración del AI_CATALOG');
  console.log('═'.repeat(64));
  console.log(`  Cantos en JSON:        ${songs.length}`);
  console.log(`  Cantos en catálogo:    ${previousTitles.size} → ${songs.length}`);
  console.log(`  Cantos agregados:      ${added.length}`);
  console.log(`  Cantos eliminados:     ${removed.length}`);
  console.log(`  Modo:                  ${DRY_RUN ? 'DRY RUN (no guarda)' : 'guardar cambios'}`);
  console.log('═'.repeat(64));

  if (added.length > 0) {
    console.log('\n  ➕ Agregados al catálogo:');
    added.forEach((t) => console.log(`      • ${t}`));
  }
  if (removed.length > 0) {
    console.log('\n  ➖ Eliminados del catálogo:');
    removed.forEach((t) => console.log(`      • ${t}`));
  }

  // Estadísticas de extracción
  let withComposer = 0, withVerse = 0;
  for (const s of songs) {
    if (extractComposer(s.context_html)) withComposer++;
    if (extractVerse(s.context_html))    withVerse++;
  }
  console.log('');
  console.log(`  Cantos con compositor extraído: ${withComposer}/${songs.length}`);
  console.log(`  Cantos con versículo extraído:  ${withVerse}/${songs.length}`);

  // 7. Escritura
  if (DRY_RUN) {
    console.log('\n  Sin cambios escritos (--dry).');
    console.log('  Quita la opción --dry para escribir los cambios.');
    return;
  }

  fs.writeFileSync(AI_AGENT_PATH, newAiAgentSrc, 'utf-8');
  console.log(`\n  ✓ ${path.relative(ROOT, AI_AGENT_PATH)} actualizado.`);

  if (newHtmlSrc !== htmlSrc) {
    fs.writeFileSync(HTML_PATH, newHtmlSrc, 'utf-8');
    console.log(`  ✓ ${path.relative(ROOT, HTML_PATH)} actualizado (conteo de cantos).`);
  } else {
    console.log(`  • ${path.relative(ROOT, HTML_PATH)} sin cambios (conteo ya correcto).`);
  }
}


main();
