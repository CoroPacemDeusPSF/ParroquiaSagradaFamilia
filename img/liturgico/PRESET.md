# Preset estable — fondos litúrgicos semanales

Configuración fija para generar las **dos** ilustraciones de cada domingo. Cada semana solo
cambian cuatro cosas: `featured_subject`, `liturgical_context`, los atributos iconográficos
verificados y el color de acento. Todo lo demás se queda congelado — es lo que hace que las
52 imágenes del año parezcan de la misma mano en vez de un collage.

> Base: especificación elaborada por Renzo con GPT (30-ago-2026), con dos correcciones
> medidas que se anotan más abajo.

---

## Variables semanales

| Campo | Ejemplo (30-ago-2026) | De dónde sale |
|---|---|---|
| `week_id` | `2026-W35` | — |
| `liturgical_context` | XXII Domingo del Tiempo Ordinario | `LITURGICAL_DATA[fecha].n` |
| `featured_subject` | Santa Rosa de Lima | `LITURGICAL_DATA[fecha].e` |
| `verified_identity` | Santa peruana, terciaria dominica, rasgos peruanos, hábito dominico blanco y negro | verificar a mano |
| `verified_iconographic_attributes` | corona de rosas naturales; hábito y velo dominicos; crucifijo de madera; expresión serena | verificar a mano |
| `liturgical_color` | verde | `LITURGICAL_DATA[fecha].c` |
| `theme_accent_color` | muted_burgundy | elección estética |

`subject_type`: `saint` · `christ` · `virgin_mary` · `gospel_scene` · `religious_symbol`.

---

## Estilo maestro (no tocar entre semanas)

- **Taxonomía:** `historical-scene`. Realismo sacro cinematográfico, calidad de museo,
  acabado editorial con toque pictórico. Sobriedad ante todo; **nada de kitsch**.
- **Iluminación:** clave baja, claroscuro, luz cálida direccional muy suave y contraluz sutil.
  Luminancia central **baja**. Halo **atmosférico**, nunca un disco luminoso literal.
- **Fondo:** degradado mínimo casi negro entre borgoña profundo, oxblood y carbón, con grano
  pictórico discreto. **Prohibido:** paisaje, ciudad, arquitectura de iglesia, montañas,
  jardín, fondo floral recargado, centro claro, verde dominante.
- **Decoración:** rosas y pétalos muy escasos, solo en los bordes exteriores, contraste bajísimo.
  Nunca en la zona central de contenido.
- **Sujeto:** expresión serena, contemplativa, humilde. Anatomía correcta en rostro y manos.
  **No debe parecer** modelo de moda, personaje de fantasía, anime, figura de terror ni
  estatua de plástico.

### Paleta

```
fondo escritorio   #12090D  #130B0E
fondo móvil        #0B070A  #140B10  #100A0D
medios contenidos  #4C3228  #634936  #705B48
luces              #A58E6D  #C1AC87  #8F7256
```

Reglas: el fondo se queda casi negro; el borgoña **se siente más que se ve**; los tonos claros
se reservan para rostro, hábito y crucifijo; **ninguna mancha clara detrás de títulos o
tarjetas**; nada de negro neutro plano ni colores neón.

---

## Las dos composiciones

**Se generan por separado. La vertical NO es un recorte de la apaisada** — recortarla dejaría
un rostro enorme, se comería el espacio negativo y movería a la figura detrás del texto.
Primero se genera y aprueba la apaisada; después la vertical, usando la apaisada aprobada como
referencia de estilo para que el mismo santo no cambie de rostro entre dispositivos.

### Apaisada — 16:9 — `AAAA-MM-DD-desktop.webp`

- Sujeto en el **tercio derecho**, ocupando del 20% al 28% del lienzo, de medio cuerpo,
  parcialmente recortado por el borde derecho, disolviéndose hacia abajo y hacia el centro.
- Mirada ligeramente hacia abajo y hacia el centro.
- Centro (x 0,28–0,70) **extremadamente oscuro y sin detalle**: ahí va la interfaz.
- Izquierda: espacio negativo, como mucho pétalos muy tenues en un 12% de ancho.

### Vertical — 9:20 — `AAAA-MM-DD-mobile.webp`

- **Solo un retrato pequeño de cabeza y hombros**, arriba a la derecha (x 0,68–1,00,
  y 0,02–0,30), con el velo recortado por el borde.
- **Se disuelve por completo antes del 36% de la altura.**
- El **65% inferior limpio**: solo degradado y grano. Sin rostros, manos, crucifijo, flores
  con detalle ni luces.
- Columna central (x 0,12–0,78) sin interrupciones de arriba abajo.
- Contraste del retrato **menor** que en la apaisada: marca de agua devocional, no protagonista.

### Tablets

**No hace falta una tercera imagen.** El módulo 36 elige por **orientación**, no por ancho: un
tablet en vertical es un marco alto y estrecho y recibe la composición vertical, anclada arriba
(`background-position: center top`), de modo que el recorte se come solo la parte baja, que por
diseño ya está vacía. Girado, recibe la apaisada.

---

## Entrega web — dos correcciones medidas sobre la spec original

**1. Formato: WebP, no JPEG.** Se midieron los dos originales con la misma calidad:

| | WebP q82 | JPEG q82 | AVIF q62 |
|---|---|---|---|
| Escritorio 1600×900 | **25,2 KB** | 60,3 KB | 23,6 KB |
| Móvil 841×1870 | **14,1 KB** | 62,5 KB | ~19,6 KB |

JPEG pesa entre 2,4 y 3,3 veces más. AVIF empata con WebP sin ventaja clara y con peor soporte
en equipos viejos. **WebP calidad 82, `method=6`.**

**2. No se amplía por encima del original.** El máster móvil aprobado mide 841 px de ancho;
escalarlo a los 1080 que sugiere la spec no añade detalle, solo peso. Se entrega a su tamaño
nativo. Si en el futuro se generan másters mayores (3840×2160 para escritorio, 1440×3200 para
móvil), entonces sí conviene reducir a 1600 y 1080.

**Verificar siempre las dimensiones reales.** Pedir "4K" en el prompt no garantiza 4K: los
másters aprobados salieron a 1672×941 y 841×1870.

CSS de entrega: `background-size: cover` en ambas; posición `center 28%` en apaisada y
`center top` en vertical. Lo aplica el módulo 36.

---

## Control de calidad antes de publicar

- Dimensiones y proporción reales comprobadas; espacio de color sRGB.
- Sin texto, logos, firmas ni elementos de interfaz generados.
- Identidad del santo correcta y iconografía verificada.
- Anatomía natural de rostro y manos; número de dedos correcto; crucifijo coherente.
- **Ninguna zona clara detrás de la interfaz.**
- Sin borde duro visible donde la figura se disuelve.
- Apaisada y vertical deben parecer de la misma familia artística.
- **Contraste validado con la interfaz encima**, no la imagen sola: mínimo 4,5:1 para texto
  normal. Una imagen puede ser preciosa por sí misma y fracasar como fondo.
  Si el contraste baja, se oscurece con el velo CSS antes que tocar los colores del texto.

Medido sobre la ilustración del 30-ago-2026: **10,04:1** en el tema del Evangelio y
**12,35:1** en el título del domingo.
