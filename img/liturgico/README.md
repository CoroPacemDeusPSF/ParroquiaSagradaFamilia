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
