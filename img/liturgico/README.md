# img/liturgico/

Ilustración de portada de cada domingo. La consume `js/modules/36-liturgical-background.js`.

## Nombres de archivo

```
AAAA-MM-DD.webp        ← escritorio, 1600 px de ancho
AAAA-MM-DD@900.webp    ← móvil,      900 px de ancho
```

La fecha es la del **domingo**, no la del día en que se sube. El módulo 36 calcula el
próximo domingo (o hoy, si hoy es domingo) y busca ese archivo. Elige la variante `@900`
cuando `ancho_de_ventana × densidad ≤ 1000`.

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

El recorte es `background-size: cover` centrado al 28% de la altura, así que en móvil
(vertical) se recortan los lados: **lo importante debe caer en la franja central**.

## Cómo se genera cada semana

El prompt se arma con los datos que ya están en `window.LITURGICAL_DATA` (módulo 21):
nombre del domingo (`n`), santoral (`e`), tema del Evangelio (`tema`), tiempo litúrgico
(`t`) y color (`c`). Para el 30 de agosto de 2026 sería *XXII Domingo del Tiempo
Ordinario · Santa Rosa de Lima · «El que quiera venir conmigo, que cargue con su cruz» ·
Ordinario · Verde*.

Al variar solo el sujeto y mantener congelado el bloque de estilo, las 52 imágenes del año
se parecen entre sí y el sitio conserva una identidad. Si cada semana llega con un estilo
distinto, la portada se vuelve un collage.

Para pasar de un original a los dos WebP, el guion está en el historial de la sesión del
30-ago-2026: recorte, redimensionado LANCZOS a 1600 y 900, y guardado en WebP calidad 82
con `method=6`.
