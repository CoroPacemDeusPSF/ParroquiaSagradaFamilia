/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/sistema/graficos.js
 *   @brief      Página Sistema: gráficos propios en SVG y listas con barra
 *   @project    Cancionero Dominical
 *   @version    v3.6.10
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Sin librería de gráficos: dos formas bastan (columnas en el tiempo y listas
 * con barra para comparar). Una sola serie, un solo tono (el dorado de la
 * casa); el número va siempre en texto, nunca solo en el color. Ancho medido
 * con ResizeObserver para que las barras no se deformen en el móvil.
 */

import { html, useState, useRef, useLayoutEffect } from '../lib/preact-htm/standalone.module.js?v=3.6.10';

function useAncho(ref) {
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setAncho(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setAncho(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ancho;
}

/** Escala «bonita» para el eje: 1, 2, 5 × 10^n. */
function techo(max) {
  if (max <= 4) return Math.max(1, max);
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= max) return f * p;
  return 10 * p;
}

/**
 * Columnas en el tiempo.
 * datos: [{ clave, corta, larga, valor }]; unidad: ['visita', 'visitas'].
 * Tocar o pasar sobre una columna muestra su valor en la línea de lectura.
 */
export function Columnas({ datos, unidad, alto = 180, resaltar }) {
  const ref = useRef(null);
  const ancho = useAncho(ref);
  const [sel, setSel] = useState(-1);

  const total = datos.reduce((a, d) => a + d.valor, 0);
  const max = techo(Math.max(0, ...datos.map((d) => d.valor)));
  const izq = 28, abajo = 22, arriba = 6;
  const w = Math.max(0, ancho - izq);
  const h = alto - abajo - arriba;
  const paso = datos.length ? w / datos.length : 0;
  // Columnas finas: como mucho 36 px aunque sobre ancho (7 días en escritorio).
  const bw = Math.max(1, Math.min(36, paso - Math.max(2, Math.min(8, paso * 0.28))));
  const hueco = paso - bw;
  // Etiquetas del eje sin choques: cada cuántas columnas cabe una, contadas
  // desde la última (hoy siempre lleva la suya).
  const cadaCuanto = Math.max(1, Math.ceil(26 / Math.max(paso, 1)));

  const lectura = sel >= 0 && datos[sel]
    ? html`<strong>${datos[sel].valor}</strong> ${datos[sel].valor === 1 ? unidad[0] : unidad[1]} · ${datos[sel].larga}`
    : html`<strong>${total}</strong> ${total === 1 ? unidad[0] : unidad[1]} en total`;

  const columna = (d, i) => {
    const bh = max ? (d.valor / max) * h : 0;
    const x = izq + i * paso + hueco / 2;
    const y = arriba + h - bh;
    const r = Math.min(4, bw / 2, bh);
    // Extremo de datos redondeado, base recta sobre el eje.
    const forma = bh > 0
      ? `M${x},${arriba + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${arriba + h} Z`
      : '';
    const clase = 'col' + (i === sel ? ' sel' : '') + (resaltar && resaltar(d) ? ' res' : '');
    return html`
      <g class=${clase}
         onPointerEnter=${() => setSel(i)}
         onClick=${() => setSel(i === sel ? -1 : i)}>
        <rect class="col-zona" x=${izq + i * paso} y=${arriba} width=${paso} height=${h} />
        ${forma && html`<path class="col-marca" d=${forma} />`}
        <title>${d.larga}: ${d.valor}</title>
      </g>`;
  };

  return html`
    <figure class="grafico" ref=${ref}>
      <figcaption class="lectura" aria-live="polite">${lectura}</figcaption>
      ${ancho > 0 && html`
        <svg width=${ancho} height=${alto} role="img"
             aria-label=${'Gráfico de ' + unidad[1] + ', ' + total + ' en total'}
             onPointerLeave=${() => setSel(-1)}>
          ${[0, 0.5, 1].map((f) => html`
            <g class="rejilla">
              <line x1=${izq} x2=${ancho} y1=${arriba + h - f * h} y2=${arriba + h - f * h} />
              <text x=${izq - 6} y=${arriba + h - f * h + 4} text-anchor="end">${Math.round(f * max)}</text>
            </g>`)}
          ${datos.map(columna)}
          ${datos.map((d, i) => (datos.length - 1 - i) % cadaCuanto === 0 && html`
            <text class="eje" x=${izq + i * paso + paso / 2} y=${alto - 6} text-anchor="middle">${d.corta}</text>`)}
        </svg>`}
    </figure>`;
}

/**
 * Lista con barra: para comparar categorías (dispositivo, país, cantos…).
 * items: [{ clave, valor }]; nombre(clave) da el texto. Muestra los primeros
 * `tope` y suma el resto en «Otros».
 */
export function Barras({ items, nombre = (c) => c, tope = 8, total, vacio = 'Sin datos todavía.' }) {
  if (!items.length) return html`<p class="vacio">${vacio}</p>`;
  const base = total || items.reduce((a, it) => a + it.valor, 0);
  let filas = items.slice(0, tope);
  const resto = items.slice(tope);
  if (resto.length) {
    filas = filas.concat({ clave: '__otros', valor: resto.reduce((a, it) => a + it.valor, 0), otros: resto.length });
  }
  // La escala la marcan las filas con nombre; «Otros» puede sumar más y se
  // queda en el 100 % para no aplastar al resto.
  const max = Math.max(...filas.filter((f) => !f.otros).map((f) => f.valor));
  return html`
    <ol class="barras">
      ${filas.map((f) => html`
        <li>
          <span class="b-nombre">${f.otros ? 'Otros (' + f.otros + ')' : nombre(f.clave)}</span>
          <span class="b-valor">${f.valor}<small>${base ? Math.round(100 * f.valor / base) + '%' : ''}</small></span>
          <span class="b-pista"><span class="b-marca" style=${'width:' + (max ? Math.min(100, Math.max(2, 100 * f.valor / max)) : 0) + '%'}></span></span>
        </li>`)}
    </ol>`;
}
