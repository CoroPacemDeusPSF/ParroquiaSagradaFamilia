/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/sistema/app.js
 *   @brief      Página Sistema: interfaz (Preact + htm, sin compilar)
 *   @project    Cancionero Dominical
 *   @version    v3.6.10r2
 *
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Primera pieza del sitio hecha con componentes. Preact (4 KB) con htm, que
 * escribe el marcado en plantillas de JavaScript: sin paso de compilación,
 * coherente con el resto del proyecto (sin Node, sin npm). La librería vive
 * en js/lib/preact-htm/ con su origen y licencia.
 *
 * Solo lectura y solo para Renzo: la página entra con Google (mismo proyecto
 * de Firebase que el cancionero, así que si ya inició sesión allí, aquí
 * también) y las reglas de /monitor solo dejan leer a su UID. Todo texto que
 * viene de la base pasa por Preact, que lo escapa: ningún HTML crudo.
 */

import { html, render, useState, useEffect, useMemo, useRef, useCallback } from '../lib/preact-htm/standalone.module.js?v=3.6.10';
import * as D from './datos.js?v=3.6.10';
import { Columnas, Barras } from './graficos.js?v=3.6.10';
import { datosDemo } from './demo.js?v=3.6.10';

const CONFIG = {
  apiKey: 'AIzaSyAOIgTOcdn_JZB3sWVZqDDXSsF6xCH6lx4',
  authDomain: 'coropacemdeusdominical.firebaseapp.com',
  databaseURL: D.DB,
  projectId: 'coropacemdeusdominical',
  appId: '1:1044224786783:web:4dff30bc2917cfb3e7b6ea'
};
const REPO = 'CoroPacemDeusPSF/ParroquiaSagradaFamilia';
const BASE = new URL('./', location.href).href;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const DEMO = LOCAL && new URLSearchParams(location.search).has('demo');
const RANGOS = [
  { id: 'hoy', n: 1, txt: 'Hoy' },
  { id: '7', n: 7, txt: '7 días' },
  { id: '30', n: 30, txt: '30 días' }
];
const REFRESCO_MS = 60000;
const GITHUB_MS = 10 * 60000;

function leerLocal(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
function escribirLocal(clave, valor) {
  try { if (valor == null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor); } catch (e) { /* privado */ }
}

/* ══ Sesión de Google ════════════════════════════════════════════════════ */

function useCuenta() {
  const [cuenta, setCuenta] = useState(DEMO ? { fase: 'demo' } : { fase: 'cargando' });
  useEffect(() => {
    if (DEMO) return undefined;
    if (!window.firebase || !window.firebase.auth) {
      setCuenta({ fase: 'error', detalle: 'No se pudo cargar el inicio de sesión de Google. Revisa la conexión y recarga.' });
      return undefined;
    }
    if (!window.firebase.apps.length) window.firebase.initializeApp(CONFIG);
    return window.firebase.auth().onAuthStateChanged((u) => {
      // La marca le dice a la portada (js/acceso.js) que en este equipo vale
      // la pena cargar el inicio de sesión para mostrar la sección Sistema.
      escribirLocal('pdAccesoSistema', u && u.uid === D.RENZO ? '1' : null);
      if (!u) setCuenta({ fase: 'fuera' });
      else if (u.uid !== D.RENZO) setCuenta({ fase: 'ajena', user: u });
      else setCuenta({ fase: 'dentro', user: u });
    });
  }, []);
  return cuenta;
}

function entrar(setAviso) {
  const p = new window.firebase.auth.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  window.firebase.auth().signInWithPopup(p).catch((e) => {
    if (e && /popup-closed|cancelled-popup/.test(e.code || '')) return;
    setAviso('No se pudo iniciar sesión: ' + ((e && e.message) || e));
  });
}
const salir = () => window.firebase.auth().signOut();

/* ══ Datos de /monitor ═══════════════════════════════════════════════════ */

/* Los días pasados se leen una vez y quedan en memoria; el de hoy se vuelve
   a leer en cada actualización. Así refrescar cada minuto cuesta un día de
   datos, no treinta. */
function useMonitor(cuenta, rango) {
  const cache = useRef(new Map());
  const demo = useRef(null);
  const [st, setSt] = useState({ fase: 'cargando' });
  const enCurso = useRef(false);

  const cargar = useCallback(async () => {
    if (cuenta.fase !== 'dentro' && cuenta.fase !== 'demo') return;
    if (enCurso.current) return;
    enCurso.current = true;
    const n = RANGOS.find((r) => r.id === rango).n;
    const dias = D.ultimosDias(n);
    const hoy = dias[dias.length - 1];
    try {
      let bytes = 0;
      const crudo = { v: {}, a: {} };
      if (cuenta.fase === 'demo') {
        demo.current = demo.current || datosDemo(30);
        dias.forEach((d) => {
          if (demo.current.v[d]) crudo.v[d] = demo.current.v[d];
          if (demo.current.a[d]) crudo.a[d] = demo.current.a[d];
        });
        bytes = JSON.stringify(crudo).length;
      } else {
        const token = await cuenta.user.getIdToken();
        const faltan = dias.slice(0, -1).filter((d) => !cache.current.has(d));
        if (faltan.length) {
          const r = await D.leerRango(faltan[0], faltan[faltan.length - 1], token);
          bytes += r.bytes;
          faltan.forEach((d) => cache.current.set(d, { v: r.v[d] || null, a: r.a[d] || null }));
        }
        const rh = await D.leerRango(hoy, hoy, token);
        bytes += rh.bytes;
        dias.slice(0, -1).forEach((d) => {
          const c = cache.current.get(d);
          if (c && c.v) crudo.v[d] = c.v;
          if (c && c.a) crudo.a[d] = c.a;
        });
        if (rh.v[hoy]) crudo.v[hoy] = rh.v[hoy];
        if (rh.a[hoy]) crudo.a[hoy] = rh.a[hoy];
      }
      const pesoRango = JSON.stringify(crudo).length;
      setSt({ fase: 'listo', sesiones: D.aplanar(crudo), dias, cargado: Date.now(), bytes, pesoRango });
    } catch (e) {
      setSt((prev) => ({ ...prev, fase: prev.sesiones ? 'listo' : 'error', error: e }));
    } finally {
      enCurso.current = false;
    }
  }, [cuenta, rango]);

  useEffect(() => {
    setSt((prev) => ({ ...prev, fase: prev.sesiones ? prev.fase : 'cargando' }));
    cargar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, REFRESCO_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  return [st, cargar];
}

/* ══ Estado del sitio: GitHub, versión servida, catálogo ═════════════════ */

function useSitio() {
  const [sitio, setSitio] = useState({});
  useEffect(() => {
    let vivo = true;
    const traer = async () => {
      const r = {};
      try {
        const [c, w] = await Promise.all([
          fetch('https://api.github.com/repos/' + REPO + '/commits?per_page=6'),
          fetch('https://api.github.com/repos/' + REPO + '/actions/runs?per_page=6')
        ]);
        if (c.ok) {
          r.commits = (await c.json()).map((x) => ({
            sha: x.sha.slice(0, 7),
            msg: String(x.commit.message || '').split('\n')[0],
            autor: x.commit.author && x.commit.author.name,
            fecha: Date.parse(x.commit.author && x.commit.author.date),
            url: x.html_url
          }));
        } else r.errGithub = c.status === 403 ? 'GitHub limita las consultas sin cuenta (60 por hora); vuelve a intentarlo en un rato.' : 'GitHub respondió ' + c.status;
        if (w.ok) {
          r.procesos = ((await w.json()).workflow_runs || []).map((x) => ({
            nombre: x.name, estado: x.status, resultado: x.conclusion,
            fecha: Date.parse(x.created_at), url: x.html_url, rama: x.head_branch
          }));
        }
      } catch (e) { r.errGithub = 'Sin conexión con GitHub.'; }
      try {
        const p = await fetch(BASE + 'cancioneros/dominical.html', { cache: 'no-store' });
        const m = (await p.text()).match(/class="cancionero-version">\s*([^<\s]+)/);
        r.version = m ? m[1] : '?';
      } catch (e) { r.version = '?'; }
      try { r.catalogo = await D.leerCatalogo(BASE); } catch (e) { r.errCatalogo = String(e.message || e); }
      r.revisado = Date.now();
      if (vivo) setSitio(r);
    };
    traer();
    const t = setInterval(() => { if (document.visibilityState === 'visible') traer(); }, GITHUB_MS);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return sitio;
}

/* ══ Piezas ══════════════════════════════════════════════════════════════ */

const Cruz = () => html`
  <svg class="cruz" viewBox="0 0 24 32" aria-hidden="true">
    <path d="M12 2v28M4 10h16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
  </svg>`;

function Seccion({ id, titulo, nota, children }) {
  return html`
    <section class="seccion" id=${id} aria-labelledby=${id + '-t'}>
      <header class="seccion-cab">
        <h2 id=${id + '-t'}>${titulo}</h2>
        ${nota && html`<p class="nota">${nota}</p>`}
      </header>
      ${children}
    </section>`;
}

function Bloque({ titulo, children }) {
  return html`<div class="bloque"><h3>${titulo}</h3>${children}</div>`;
}

function Cifra({ valor, etiqueta, sub }) {
  return html`
    <div class="cifra">
      <span class="cifra-valor">${valor}</span>
      <span class="cifra-etq">${etiqueta}</span>
      ${sub && html`<span class="cifra-sub">${sub}</span>`}
    </div>`;
}

function Estado({ tipo, children }) {
  const icono = {
    bien: html`<path d="M3 8.5l3 3 7-7" />`,
    mal: html`<path d="M4 4l8 8M12 4l-8 8" />`,
    curso: html`<circle cx="8" cy="8" r="3" />`
  }[tipo];
  return html`<span class=${'estado estado-' + tipo}>
    <svg viewBox="0 0 16 16" aria-hidden="true">${icono}</svg>${children}</span>`;
}

function quien(s, recurrentes) {
  if (s.tipo === 'a') return D.ADMINS[s.uid] || 'Administrador';
  const corto = 'Visitante ' + s.h.v.slice(0, 4);
  return recurrentes && recurrentes.has(s.h.v) ? corto + ' · vuelve' : corto;
}

function Linea({ s, catalogo }) {
  const sigue = s.eventos.filter((e) => e.k === 'sigue').length;
  const visibles = s.eventos.filter((e) => e.k !== 'sigue');
  return html`
    <ol class="linea">
      ${visibles.map((ev) => {
        const d = D.describir(ev, catalogo);
        return html`<li class=${d.tono ? 'tono-' + d.tono : ''}>
          <time>${D.hhmmss(s.inicio + ev.o)}</time><span>${d.texto}</span></li>`;
      })}
      ${sigue > 0 && html`<li class="tenue"><time></time><span>${sigue} ${sigue === 1 ? 'señal' : 'señales'} de que seguía en la página</span></li>`}
      ${s.tope && html`<li class="tono-error"><time></time><span>Llegó al tope de 200 eventos: lo que siguió no se guardó.</span></li>`}
    </ol>`;
}

function FilaSesion({ s, catalogo, recurrentes, variosDias }) {
  const [abierta, setAbierta] = useState(false);
  const h = s.h;
  const cuando = variosDias ? D.etiquetaDia(s.dia).larga + ' ' + D.hhmm(s.inicio) : D.hhmm(s.inicio);
  const escrituras = s.eventos.filter((e) => e.k === 'escribe').length;
  return html`
    <li class=${'sesion' + (abierta ? ' abierta' : '')}>
      <button class="sesion-cab" aria-expanded=${abierta} onClick=${() => setAbierta(!abierta)}>
        <span class="s-cuando">${cuando}</span>
        <span class="s-quien">${quien(s, recurrentes)}</span>
        <span class="s-equipo">${D.nombreDispositivo(h.dp)} · ${h.so} · ${h.nav}${h.mod ? ' · ' + h.mod : ''}</span>
        <span class="s-lugar">${D.paisDe(h.tz)}${h.id ? ' · ' + h.id : ''}</span>
        <span class="s-entrada">${D.nombreEntrada(h.ent)}${h.ref ? ' desde ' + h.ref : ''}</span>
        <span class="s-cifras">${D.duracion(s.dur)} · ${s.eventos.length} ${s.eventos.length === 1 ? 'evento' : 'eventos'}${escrituras ? ' · ' + escrituras + ' escrituras' : ''}</span>
        <svg class="s-flecha" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
      </button>
      ${abierta && html`
        <div class="sesion-cuerpo">
          <p class="s-detalle">Pantalla ${h.px || '?'} · zona ${h.tz} · versión ${h.ver || '?'}${h.pwa ? ' · instalada como app' : ''}</p>
          <${Linea} s=${s} catalogo=${catalogo} />
        </div>`}
    </li>`;
}

/* ══ Secciones ═══════════════════════════════════════════════════════════ */

function Ahora({ r, catalogo, recurrentes }) {
  const ahora = Date.now();
  return html`
    <${Seccion} id="ahora" titulo="Ahora" nota="Actividad en los últimos 5 minutos. Llega con hasta 20 segundos de retraso.">
      ${r.ahora.length === 0
        ? html`<p class="vacio">Nadie en este momento.</p>`
        : html`<ul class="vivos">
            ${r.ahora.map((s) => {
              const ult = s.eventos[s.eventos.length - 1];
              return html`<li>
                <span class="pulso" aria-hidden="true"></span>
                <span class="v-quien">${quien(s, recurrentes)}</span>
                <span class="v-equipo">${D.nombreDispositivo(s.h.dp)} · ${D.paisDe(s.h.tz)}</span>
                <span class="v-que">${ult ? D.describir(ult, catalogo).texto : 'Entró'}</span>
                <span class="v-hace">${D.haceCuanto(s.fin, ahora)}</span>
              </li>`;
            })}
          </ul>`}
    <//>`;
}

function Visitas({ r, dias }) {
  const hoy = dias.length === 1;
  const datos = hoy
    ? Array.from(r.porHora, ([h, valor]) => ({ clave: h, corta: String(h), larga: h + ':00 a ' + (h + 1) + ':00', valor }))
    : Array.from(r.porDia, ([d, valor]) => {
        const e = D.etiquetaDia(d);
        return { clave: d, corta: e.corta, larga: e.larga, valor };
      });
  return html`
    <${Seccion} id="visitas" titulo="Visitas"
      nota=${hoy ? 'Hoy, por hora de Lima.' : 'Por día, en hora de Lima. Una visita es una sesión: se corta tras 30 minutos sin actividad.'}>
      <div class="cifras">
        <${Cifra} valor=${r.visitas.length} etiqueta="Visitas" />
        <${Cifra} valor=${r.visitantes} etiqueta="Visitantes distintos" sub="por navegador" />
        <${Cifra} valor=${r.cantosAbiertos} etiqueta="Cantos abiertos" />
        <${Cifra} valor=${D.duracion(r.mediana)} etiqueta="Permanencia" sub="mediana" />
        <${Cifra} valor=${r.pctMovil + '%'} etiqueta="Desde móvil o tablet" />
      </div>
      <${Columnas} datos=${datos} unidad=${['visita', 'visitas']} />
    <//>`;
}

const ENTRADAS = {
  compartido: 'Enlace compartido de un canto', canto: 'Enlace directo a un canto',
  dominical: 'Cancionero', portada: 'Portada', sin: 'Sin dato'
};

function Quien({ r }) {
  const n = r.visitas.length;
  return html`
    <${Seccion} id="quien" titulo="Quién entra"
      nota="País aproximado por la zona horaria del equipo: no es una ubicación. Ni IP ni GPS.">
      <div class="rejilla-bloques">
        <${Bloque} titulo="Dispositivo"><${Barras} items=${D.ordenar(r.dispositivo)} nombre=${D.nombreDispositivo} total=${n} /><//>
        <${Bloque} titulo="País"><${Barras} items=${D.ordenar(r.pais)} total=${n} /><//>
        <${Bloque} titulo="Sistema operativo"><${Barras} items=${D.ordenar(r.so)} total=${n} /><//>
        <${Bloque} titulo="Navegador"><${Barras} items=${D.ordenar(r.nav)} total=${n} /><//>
        <${Bloque} titulo="Cómo llegan"><${Barras} items=${D.ordenar(r.entrada)} nombre=${(c) => ENTRADAS[c] || c} total=${n} /><//>
        <${Bloque} titulo="Desde qué sitio"><${Barras} items=${D.ordenar(r.origen)} vacio="Todas llegaron directo (sin sitio de origen)." /><//>
        <${Bloque} titulo="Idioma del equipo"><${Barras} items=${D.ordenar(r.idioma)} total=${n} /><//>
        <${Bloque} titulo="Modelo"><${Barras} items=${D.ordenar(r.modelo)} vacio="Solo lo informan Chrome y Edge en Android." /><//>
      </div>
    <//>`;
}

function Hicieron({ r, catalogo }) {
  const titulo = (id) => D.tituloDe(id, catalogo);
  return html`
    <${Seccion} id="hicieron" titulo="Qué hicieron">
      <div class="rejilla-bloques">
        <${Bloque} titulo="Cantos más abiertos"><${Barras} items=${D.ordenar(r.cantos)} nombre=${titulo} tope=${10} /><//>
        <${Bloque} titulo="Acordes más vistos"><${Barras} items=${D.ordenar(r.acordes)} nombre=${titulo} /><//>
        <${Bloque} titulo="Búsquedas"><${Barras} items=${D.ordenar(r.busquedas)} nombre=${(q) => '“' + q + '”'} tope=${10} /><//>
        <${Bloque} titulo="Contexto litúrgico leído"><${Barras} items=${D.ordenar(r.contexto)} nombre=${titulo} /><//>
        <${Bloque} titulo="Compartidos"><${Barras} items=${D.ordenar(r.compartidos)} nombre=${(c) => (c === 'sitio' ? 'El sitio' : titulo(c))} /><//>
        <${Bloque} titulo="Modos"><${Barras} items=${D.ordenar(r.modos)} nombre=${D.nombreModo} vacio="Nadie cambió de modo." /><//>
        <${Bloque} titulo="Otras acciones"><${Barras} items=${D.ordenar(r.acciones)} /><//>
      </div>
    <//>`;
}

function Administradores({ r, catalogo, variosDias }) {
  const porUid = new Map();
  r.admins.forEach((s) => { if (!porUid.has(s.uid)) porUid.set(s.uid, []); porUid.get(s.uid).push(s); });
  return html`
    <${Seccion} id="admins" titulo="Administradores"
      nota="Rastro de cada cuenta administradora, escrito con su sesión de Google: no se puede falsificar desde afuera. De lo que guardan se anota qué y dónde, no el contenido.">
      ${porUid.size === 0
        ? html`<p class="vacio">Ningún administrador entró en este periodo.</p>`
        : Array.from(porUid, ([uid, ses]) => {
            const esc = ses.reduce((a, s) => a + s.eventos.filter((e) => e.k === 'escribe').length, 0);
            return html`
              <div class="admin">
                <h3>${D.ADMINS[uid] || uid}<small>${ses.length} ${ses.length === 1 ? 'sesión' : 'sesiones'} · ${esc} ${esc === 1 ? 'escritura' : 'escrituras'}</small></h3>
                <ul class="sesiones">${ses.map((s) => html`<${FilaSesion} key=${s.clave} s=${s} catalogo=${catalogo} variosDias=${variosDias} />`)}</ul>
              </div>`;
          })}
    <//>`;
}

function Recientes({ r, catalogo, recurrentes, variosDias }) {
  const [cuantas, setCuantas] = useState(30);
  const lista = r.visitas.slice(0, cuantas);
  return html`
    <${Seccion} id="sesiones" titulo="Sesiones recientes" nota="Toca una sesión para ver lo que hizo, paso a paso.">
      ${lista.length === 0
        ? html`<p class="vacio">Sin visitas en este periodo.</p>`
        : html`<ul class="sesiones">${lista.map((s) => html`<${FilaSesion} key=${s.clave} s=${s} catalogo=${catalogo} recurrentes=${recurrentes} variosDias=${variosDias} />`)}</ul>`}
      ${r.visitas.length > cuantas && html`
        <button class="boton-sec" onClick=${() => setCuantas(cuantas + 30)}>Ver ${Math.min(30, r.visitas.length - cuantas)} más (quedan ${r.visitas.length - cuantas})</button>`}
    <//>`;
}

function Errores({ r }) {
  const lista = Array.from(r.errores, ([msg, e]) => ({ msg, ...e })).sort((a, b) => b.ultimo - a.ultimo);
  return html`
    <${Seccion} id="errores" titulo="Errores"
      nota="Errores de JavaScript que vieron los visitantes en su navegador. Como mucho 5 distintos por sesión.">
      ${lista.length === 0
        ? html`<p class="vacio"><${Estado} tipo="bien">Sin errores registrados en este periodo.<//></p>`
        : html`<ul class="errores">
            ${lista.map((e) => html`<li>
              <code>${e.msg}</code>
              <span class="e-cifras">${e.n} ${e.n === 1 ? 'vez' : 'veces'} en ${e.sesiones.size} ${e.sesiones.size === 1 ? 'sesión' : 'sesiones'} · último ${D.haceCuanto(e.ultimo)}</span>
              <span class="e-equipos">${D.ordenar(e.equipos).slice(0, 3).map((q) => q.clave + ' (' + q.valor + ')').join(' · ')}</span>
            </li>`)}
          </ul>`}
    <//>`;
}

function Sistema({ r, sitio, st }) {
  const [excluido, setExcluido] = useState(leerLocal('pdMonitorExcluir') === '1');
  const visitante = leerLocal('pdVisitante');
  const dias = st.dias.length;
  const kbDia = st.pesoRango / 1024 / dias;
  const resultado = (p) => {
    if (p.estado !== 'completed') return html`<${Estado} tipo="curso">En curso<//>`;
    if (p.resultado === 'success') return html`<${Estado} tipo="bien">Correcto<//>`;
    if (p.resultado === 'skipped' || p.resultado === 'cancelled') return html`<${Estado} tipo="curso">${p.resultado === 'skipped' ? 'Omitido' : 'Cancelado'}<//>`;
    return html`<${Estado} tipo="mal">Falló<//>`;
  };
  const versiones = D.ordenar(r.version);
  const viejas = versiones.filter((v) => sitio.version && v.clave !== sitio.version);
  return html`
    <${Seccion} id="sistema" titulo="Sistema">
      <div class="rejilla-bloques">
        <${Bloque} titulo="Sitio">
          <dl class="datos">
            <dt>Versión publicada</dt><dd>${sitio.version || '…'}</dd>
            <dt>Cantos en el catálogo</dt><dd>${sitio.catalogo ? sitio.catalogo.total : sitio.errCatalogo ? html`<${Estado} tipo="mal">${sitio.errCatalogo}<//>` : '…'}</dd>
            <dt>Revisado</dt><dd>${sitio.revisado ? D.hhmm(sitio.revisado) : '…'}</dd>
          </dl>
          <h4>Versiones que vieron las visitas</h4>
          <${Barras} items=${versiones} total=${r.visitas.length} />
          ${viejas.length > 0 && html`<p class="nota">Las versiones distintas de ${sitio.version} son equipos que aún tenían la página anterior en caché.</p>`}
        <//>

        <${Bloque} titulo="Últimos cambios">
          ${sitio.errGithub && html`<p class="nota">${sitio.errGithub}</p>`}
          <ul class="cambios">
            ${(sitio.commits || []).map((c) => html`<li>
              <a href=${c.url} target="_blank" rel="noopener"><code>${c.sha}</code></a>
              <span class="c-msg">${c.msg}</span>
              <span class="c-hace">${D.haceCuanto(c.fecha)}${c.autor && /\[bot\]|github-actions/i.test(c.autor) ? ' · automático' : ''}</span>
            </li>`)}
          </ul>
        <//>

        <${Bloque} titulo="Procesos automáticos (GitHub Actions)">
          <ul class="cambios">
            ${(sitio.procesos || []).map((p) => html`<li>
              ${resultado(p)}
              <a class="c-msg" href=${p.url} target="_blank" rel="noopener">${p.nombre}</a>
              <span class="c-hace">${D.haceCuanto(p.fecha)}</span>
            </li>`)}
          </ul>
          ${sitio.procesos && sitio.procesos.length === 0 && html`<p class="vacio">Sin ejecuciones recientes.</p>`}
        <//>

        <${Bloque} titulo="Registro en Firebase (plan gratuito)">
          <dl class="datos">
            <dt>Periodo cargado</dt><dd>${(st.pesoRango / 1024).toFixed(0)} KB · ${r.visitas.length + r.admins.length} sesiones · ${r.eventos} eventos de visitas</dd>
            <dt>Promedio por día</dt><dd>${kbDia.toFixed(1)} KB</dd>
            <dt>Al año, a este ritmo</dt><dd>${(kbDia * 365 / 1024).toFixed(1)} MB de 1 GB que da el plan</dd>
            <dt>Descargado en la última lectura</dt><dd>${(st.bytes / 1024).toFixed(1)} KB</dd>
            <dt>Sesiones que tocaron el tope</dt><dd>${r.conTope === 0 ? html`<${Estado} tipo="bien">Ninguna<//>` : html`<${Estado} tipo="mal">${r.conTope}<//>`}</dd>
          </dl>
          <p class="nota">Los días viejos no se borran solos (la página es solo de lectura). Si algún día hiciera falta espacio, se borran desde la consola de Firebase, en monitor → v → la fecha.</p>
        <//>

        <${Bloque} titulo="Este equipo">
          <dl class="datos">
            <dt>Identificador en las visitas</dt><dd><code>${visitante ? visitante.slice(0, 4) : 'ninguno aún'}</code></dd>
          </dl>
          <label class="interruptor">
            <input type="checkbox" checked=${excluido}
              onChange=${(e) => { setExcluido(e.target.checked); escribirLocal('pdMonitorExcluir', e.target.checked ? '1' : null); }} />
            <span>No contar las visitas de este equipo</span>
          </label>
          <p class="nota">Para que tus propias visitas no inflen las cifras. Tu rastro de administrador sigue quedando. Hay que marcarlo en cada equipo y navegador.</p>
        <//>
      </div>
    <//>`;
}

/* ══ Pantallas de entrada ════════════════════════════════════════════════ */

function Puerta({ cuenta, aviso, setAviso }) {
  let cuerpo;
  if (cuenta.fase === 'cargando') cuerpo = html`<p>Comprobando la sesión…</p>`;
  else if (cuenta.fase === 'error') cuerpo = html`<p>${cuenta.detalle}</p>`;
  else if (cuenta.fase === 'ajena') {
    cuerpo = html`
      <p>La cuenta <strong>${cuenta.user.email}</strong> no tiene acceso a esta página.</p>
      <button class="boton" onClick=${salir}>Cambiar de cuenta</button>`;
  } else {
    cuerpo = html`
      <p>Página privada del cancionero. Entra con la cuenta de Google del coro.</p>
      <button class="boton" onClick=${() => entrar(setAviso)}>Entrar con Google</button>`;
  }
  return html`
    <main class="puerta">
      <${Cruz} />
      <p class="eyebrow">Cancionero Pacem Deus</p>
      <h1>Sistema</h1>
      ${cuerpo}
      ${aviso && html`<p class="aviso">${aviso}</p>`}
    </main>`;
}

function ErrorLectura({ error }) {
  if (error && error.codigo === 'permiso') {
    return html`<div class="falla">
      <h2>Firebase no deja leer el registro</h2>
      <p>Lo más probable es que las reglas v3.6.10 aún no estén publicadas. Están en <code>firebase/database.rules.v3.6.10.json</code>: se pegan completas en Firebase Console → Realtime Database → Reglas → Publicar.</p>
    </div>`;
  }
  return html`<div class="falla"><h2>No se pudo leer el registro</h2><p>${(error && (error.detalle || error.message)) || 'Error desconocido'}</p></div>`;
}

/* ══ La aplicación ═══════════════════════════════════════════════════════ */

const SECCIONES = [
  ['ahora', 'Ahora'], ['visitas', 'Visitas'], ['quien', 'Quién'], ['hicieron', 'Qué hicieron'],
  ['admins', 'Administradores'], ['sesiones', 'Sesiones'], ['errores', 'Errores'], ['sistema', 'Sistema']
];

function App() {
  const cuenta = useCuenta();
  const [aviso, setAviso] = useState('');
  const [rango, setRango] = useState(leerLocal('pdSistemaRango') || '7');
  const [st, recargar] = useMonitor(cuenta, rango);
  const sitio = useSitio();
  const [, setTic] = useState(0);

  // Para que «hace X min» avance aunque no lleguen datos nuevos.
  useEffect(() => { const t = setInterval(() => setTic((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const r = useMemo(() => (st.sesiones ? D.resumir(st.sesiones, st.dias) : null), [st.sesiones, st.dias]);
  const recurrentes = useMemo(() => {
    if (!st.sesiones) return new Set();
    const n = new Map();
    st.sesiones.forEach((s) => { if (s.tipo === 'v') n.set(s.h.v, (n.get(s.h.v) || 0) + 1); });
    return new Set(Array.from(n).filter(([, c]) => c > 1).map(([v]) => v));
  }, [st.sesiones]);

  if (cuenta.fase !== 'dentro' && cuenta.fase !== 'demo') {
    return html`<${Puerta} cuenta=${cuenta} aviso=${aviso} setAviso=${setAviso} />`;
  }

  const elegirRango = (id) => { setRango(id); escribirLocal('pdSistemaRango', id); };
  const catalogo = sitio.catalogo;
  const variosDias = st.dias && st.dias.length > 1;

  return html`
    <div class="app">
      <header class="cabeza">
        <div class="cabeza-fila">
          <div class="marca">
            <${Cruz} />
            <div><p class="eyebrow">Cancionero Pacem Deus</p><h1>Sistema</h1></div>
          </div>
          <div class="cuenta">
            ${cuenta.fase === 'demo'
              ? html`<span class="demo">Datos de muestra</span>`
              : html`<span class="c-nombre">${cuenta.user.displayName || cuenta.user.email}</span>
                     <button class="enlace" onClick=${salir}>Salir</button>`}
          </div>
        </div>
        <div class="cabeza-fila controles">
          <div class="segmentado" role="group" aria-label="Periodo">
            ${RANGOS.map((x) => html`<button aria-pressed=${rango === x.id} onClick=${() => elegirRango(x.id)}>${x.txt}</button>`)}
          </div>
          <span class="carga">
            ${st.fase === 'cargando' ? 'Cargando…' : st.cargado ? 'Actualizado ' + D.hhmm(st.cargado) : ''}
            <button class="enlace" onClick=${recargar} aria-label="Actualizar ahora">Actualizar</button>
          </span>
        </div>
        <nav class="indice" aria-label="Secciones">
          ${SECCIONES.map(([id, txt]) => html`<a href=${'#' + id}>${txt}${id === 'errores' && r && r.errores.size ? html` <b>${r.errores.size}</b>` : ''}${id === 'ahora' && r && r.ahora.length ? html` <b>${r.ahora.length}</b>` : ''}</a>`)}
        </nav>
      </header>

      <main class="contenido">
        ${st.error && html`<${ErrorLectura} error=${st.error} />`}
        ${st.fase === 'cargando' && !r && html`<p class="vacio">Leyendo el registro…</p>`}
        ${r && html`
          <${Ahora} r=${r} catalogo=${catalogo} recurrentes=${recurrentes} />
          <${Visitas} r=${r} dias=${st.dias} />
          <${Quien} r=${r} />
          <${Hicieron} r=${r} catalogo=${catalogo} />
          <${Administradores} r=${r} catalogo=${catalogo} variosDias=${variosDias} />
          <${Recientes} key=${rango} r=${r} catalogo=${catalogo} recurrentes=${recurrentes} variosDias=${variosDias} />
          <${Errores} r=${r} />
          <${Sistema} r=${r} sitio=${sitio} st=${st} />`}
      </main>

      <footer class="pie">
        <p>Registro anónimo: identificador aleatorio por navegador, sin IP, sin ubicación, sin nombres. No registra equipos con «No rastrear» activado. Módulo 39 · v3.6.10</p>
      </footer>
    </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
