<!--
  ────────────────────────────────────────────────────────────────────────────
  Coro Pacem Deus — Parroquia Sagrada Familia
  ────────────────────────────────────────────────────────────────────────────

    @file       README.md
    @brief      Documentación principal del repositorio
    @author     Renzo Núñez Berdejo
    @project    Cancionero Dominical
    @version    v3.2.40r6

  ────────────────────────────────────────────────────────────────────────────
-->

# Coro Pacem Deus — Cancioneros Litúrgicos

Repositorio del **Coro Pacem Deus**, asociado a la Parroquia de la Sagrada Familia. Contiene los cancioneros digitales utilizados por el coro durante celebraciones litúrgicas.

🌐 **Sitio publicado**: <https://coropacemdeuspsf.github.io/ParroquiaSagradaFamilia/>

---

## Cancioneros disponibles

| Cancionero | Estado | Cantos | Uso |
|---|---|---|---|
| **Dominical** | 🟢 Activo (vivo) | 111 | Liturgia dominical regular |
| Semana Santa | 🟡 Histórico | — | Triduo Pascual |
| Navidad | 🟡 Histórico | — | Tiempo de Navidad |
| Vigilia Pascual | 🟡 Histórico | — | Vigilia Pascual |

El **Cancionero Dominical** es el único en evolución activa y sirve como template arquitectural para futuros cancioneros.

---

## Arquitectura (Cancionero Dominical)

El cancionero dominical sigue una arquitectura modular con 4 capas claramente separadas:

```
┌─────────────────────────────────────────────────────────────┐
│  ESTRUCTURA   →  cancioneros/dominical.html  (shell, 25 KB)  │
│  PRESENTACIÓN →  css/  (modular, 19 archivos por componente) │
│  COMPORTAMIENTO →  js/modules/  (26 módulos especializados)  │
│  DATOS        →  data/songs.json  (111 cantos como JSON)     │
└─────────────────────────────────────────────────────────────┘
```

### Estructura de archivos

```
ParroquiaSagradaFamilia/
├── index.html                     # Página principal (selector de cancioneros)
├── cancioneros/
│   └── dominical.html             # Shell del cancionero dominical
├── css/
│   ├── tokens.css                 # Sistema de design tokens
│   ├── base.css                   # Reset y estilos globales
│   ├── dominical.bundle.css       # Orquestador de imports
│   ├── components/                # 16 componentes CSS aislados
│   │   ├── chords.css
│   │   ├── song-card.css
│   │   ├── setlist.css
│   │   └── ...
│   └── pages/
│       └── dominical.css          # Overrides finales del dominical
├── js/
│   ├── main.js                    # Bootstrap del index
│   └── modules/
│       ├── 00-songs-renderer.js   # Renderiza cantos desde JSON
│       ├── 01-analytics-init.js
│       ├── ...
│       └── 25-event-delegation.js # Sistema centralizado de eventos
├── data/
│   └── songs.json                 # 111 cantos (letras, acordes, contexto)
├── scripts/                       # Herramientas de mantenimiento
│   ├── next-cpd.js                # Calcula próximo ID disponible
│   └── sort-songs.js              # Ordena cantos alfabéticamente
└── salmos/                        # MP3s de salmos (PAX/PPC)
    ├── a-tiempos/
    ├── a-ordinario/
    └── ...
```

---

## Servir localmente

El sitio requiere un servidor HTTP (no funciona con `file://` por las cargas asíncronas):

```bash
cd ParroquiaSagradaFamilia
python -m http.server 8000
```

Abrir: <http://localhost:8000/cancioneros/dominical.html>

---

## Mantenimiento del Cancionero Dominical

### Agregar un canto nuevo

1. **Calcular el próximo ID disponible**:
   ```bash
   node scripts/next-cpd.js
   ```

2. **Editar `data/songs.json`** y agregar un objeto con el siguiente esquema:
   ```json
   {
     "cpd": "cpd-114",
     "did": "d114",
     "title": "Título del Canto",
     "moment": "Comunión",
     "youtube": "https://youtu.be/XXXX",
     "added": "2026-04-29",
     "body_html": "<div class=\"chorus\"><p>...</p></div>",
     "chords_html": "<b>♫ Título</b>\n\n<b>═══ CORO ═══</b>\n...",
     "context_html": "<p class=\"ctx-title\">Título</p>..."
   }
   ```

3. **(Opcional) Reordenar alfabéticamente** dentro de su sección:
   ```bash
   node scripts/sort-songs.js --dry      # ver qué cambiaría
   node scripts/sort-songs.js            # aplicar cambios
   ```

4. **Probar localmente** y luego publicar:
   ```bash
   git add data/songs.json
   git commit -m "Agregar canto: <Título>"
   git push
   ```

### Editar acordes online (Modo Coro)

Las ediciones de acordes y letras hechas a través de la interfaz web se guardan en **Firebase Realtime Database** y tienen **prioridad sobre el JSON**. Esto permite:

- Corregir errores en vivo durante un ensayo sin necesidad de tocar el código
- Mantener un historial de revisiones
- Compartir cambios entre dispositivos automáticamente

El JSON contiene los valores **por defecto**; Firebase contiene las **ediciones recientes**.

### Convenciones del proyecto

- **IDs estables**: `cpd-XXX` (Dominical) y `cps-XXX` (Semana Santa). **NUNCA reasignar un ID existente** — Firebase los usa como claves primarias.
- **Notación de acordes**:
  - Mayores: `DO`, `RE7`, `SOL#`, `FA`, `SIb`, `DO7+`
  - Menores: `Dom`, `Rem7`, `Mim`, `Lam7`, `Fa#m`
  - Slash chords: `Lam/SOL`, `FA/LA`
- **Pronombres divinos**: siempre con mayúscula (`Tú`, `Te`, `Tu`, `Su`, `Él`).
- **Versiones**:
  - `X.Y.Z` para features y fixes
  - `X.Y.ZrN` para micro-revisiones (cambios visuales o de texto)

---

## Sistema de capas: JSON ↔ Firebase ↔ DOM

```
1. JSON (data/songs.json)
        ↓ (al cargar la página)
2. Renderer construye las cards en el DOM con valores POR DEFECTO
        ↓ (después del render)
3. Firebase override sobreescribe acordes/letras editados online
        ↓
4. Estado final que ve el usuario
```

Este flujo garantiza que las ediciones en vivo nunca se pierdan al hacer cambios al código.

---

## Stack técnico

- **Hosting**: GitHub Pages (estático)
- **Base de datos**: Firebase Realtime Database (REST API, sin SDK)
- **Audio de salmos**: MP3s de PAX y PPC, reproductor custom
- **Lecturas**: Enlace a [dominicos.org](https://www.dominicos.org)
- **Tipografías**: Cinzel, EB Garamond, Proza Libre, Cormorant Garamond, Edwardian Script ITC / Pinyon Script
- **Sin frameworks** — JavaScript vanilla y CSS modular puro

---

## Autoría y licencia

Diseño y desarrollo: **Renzo Núñez Berdejo** — director del Coro Pacem Deus.

Este repositorio es uso interno del coro y de la Parroquia Sagrada Familia.

> *Cantamos al Amor de los Amores.*
