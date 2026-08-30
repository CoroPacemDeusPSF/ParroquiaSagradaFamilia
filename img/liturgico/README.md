# img/liturgico/

Ilustración de portada de cada domingo. La consume `js/modules/36-liturgical-background.js`.

## Nombres de archivo

```
AAAA-MM-DD-desktop.webp   ← marco apaisado, 16:9
AAAA-MM-DD-mobile.webp    ← marco vertical, 9:20
```

La fecha es la del **domingo**, no la del día en que se sube. El módulo 36 calcula el
próximo domingo (o hoy, si hoy es domingo) y elige la variante por **orientación de la
ventana**, no por ancho: marco vertical → `-mobile`, marco apaisado → `-desktop`. Por eso un
tablet en vertical no necesita una tercera imagen. Al girar el dispositivo se reevalúa.

Si falta la vertical, se intenta la apaisada antes de rendirse.

**Las dos son composiciones independientes, no recortes la una de la otra.** Ver `PRESET.md`.

**Si el archivo de una semana no existe no pasa nada:** el módulo lo detecta al precargar,
no pinta la capa, y la portada se queda con el degradado del color litúrgico. No hay
imagen rota ni hueco. Faltar es un estado normal, no un error.

## Requisitos de la imagen

| | |
|---|---|
| Proporción | apaisada, ~16:9 |
| Formato | WebP, calidad 82 |
| Peso | por debajo de 300 KB la grande |
| **Clave tonal** | **oscura, obligatorio** |
| Composición | sujeto a un lado, **espacio negativo oscuro en el centro** |

Lo de la clave tonal no es gusto, es accesibilidad. El texto de la portada es crema, y va
encima. Sobre la ilustración de Santa Rosa del 30-ago-2026 —franja superior a 16/255 de
luminancia— el contraste medido es **10,0:1** en el tema del Evangelio y **12,4:1** en el
título; WCAG AA pide 4,5:1 y AAA 7:1. Una imagen clara hundiría eso, y el velo del CSS es
un refuerzo, no una muleta: no puede rescatar un cielo a 240/255.

El recorte es `background-size: cover`: la apaisada se ancla al 28% de la altura y la
vertical arriba (`center top`), de modo que en la vertical el recorte se come solo la parte
baja — que por diseño ya está vacía.

## Cómo se genera cada semana

El prompt se arma con los datos que ya están en `window.LITURGICAL_DATA` (módulo 21):
nombre del domingo (`n`), santoral (`e`), tema del Evangelio (`tema`), tiempo litúrgico
(`t`) y color (`c`). Para el 30 de agosto de 2026 sería *XXII Domingo del Tiempo
Ordinario · Santa Rosa de Lima · «El que quiera venir conmigo, que cargue con su cruz» ·
Ordinario · Verde*.

Al variar solo el sujeto y mantener congelado el bloque de estilo, las 52 imágenes del año
se parecen entre sí y el sitio conserva una identidad. Si cada semana llega con un estilo
distinto, la portada se vuelve un collage.

El preset completo —estilo maestro, paleta, encuadres, prompts y control de calidad— está en
**`PRESET.md`**, en esta misma carpeta.


---

## Generación automática

`.github/workflows/fondos-liturgicos.yml` genera las dos ilustraciones cada **lunes a las
06:00 de Lima** y abre un **Pull Request** para que las apruebes. Fusionarlo redespliega el
sitio; no fusionarlo deja la portada con el degradado del color litúrgico, que es un estado
válido.

### Puesta en marcha (una sola vez)

1. En **Settings → Secrets and variables → Actions → Secrets**, crear
   `OPENAI_API_KEY` con la clave del generador de imágenes.
2. Opcional, en la pestaña **Variables**: `IMAGE_MODEL` si hay que cambiar el modelo.
   Por defecto `gpt-image-1`. Se dejó configurable porque el identificador cambia entre
   generaciones y no conviene tenerlo enterrado en el código.

### Probarlo sin gastar crédito

En **Actions → Fondos litúrgicos semanales → Run workflow**, marcar **dry_run**: imprime los
dos prompts que enviaría y no llama a la API. Se puede pasar también un domingo concreto en
`sunday` para adelantar una semana o rehacer una pasada.

### Lo que hace, paso a paso

1. `scripts/liturgical-week.js` saca del módulo 21 los datos del próximo domingo — nombre,
   santoral, evangelio, tema, tiempo y color. Ejecuta el módulo en un sandbox de Node en vez
   de parsearlo con expresiones regulares, así que un cambio de formato no lo rompe en
   silencio. Si el domingo cae fuera del calendario local, falla con un mensaje claro.
2. `scripts/generate-backgrounds.py` arma los dos prompts con el preset, llama al generador y
   post-procesa.
3. Comprueba la luminancia de la franja superior y de la columna central, y si salen claras
   lo avisa **en el cuerpo del PR**.
4. Sube la rama `fondos/AAAA-MM-DD` y abre el PR con la ficha de la semana y la lista de
   verificación.

**Si las dos imágenes de ese domingo ya están en el repositorio, no genera nada.** Para
rehacerlas hay que borrarlas primero — es una decisión consciente, no un accidente.

### El post-proceso no es opcional

El generador no entrega las proporciones que necesita la portada: admite cuadrado, apaisado
3:2 y vertical 2:3, y aquí hacen falta 16:9 y 9:20.

- **Apaisada:** se genera en 3:2 y se recorta en altura hasta 16:9, anclando arriba, porque
  la cabeza del sujeto vive en el tercio superior y es lo que no se puede perder.
- **Vertical:** se genera en 2:3 y se **extiende el lienzo hacia abajo** hasta 9:20,
  continuando el degradado oscuro. No se recorta de los lados: el sujeto está en el extremo
  superior derecho y recortar ahí lo decapitaría. Se puede extender sin mentir porque el
  preset ya exige que el 65% inferior sea degradado limpio — lo que se añade es justo eso.
  La costura se difumina para que no quede una línea horizontal.

Ambos caminos están verificados: 2:3 → 0,4499 (9:20 es 0,4500) con la costura invisible, y
3:2 → 1,7778, que es 16:9 exacto.

### Coste

Dos imágenes por semana, unos **0,08 USD semanales** — alrededor de **4 USD al año**.

> GitHub desactiva los workflows programados en repositorios sin actividad durante 60 días.
> Si el cancionero pasa dos meses sin commits, hay que reactivarlo desde la pestaña Actions.
