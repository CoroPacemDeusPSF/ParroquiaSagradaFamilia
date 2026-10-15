# -*- coding: utf-8 -*-
"""
Imagen de vista previa (1200x630) de un canto, con la estetica de la
cabecera de su ficha en el cancionero.

  @file     scripts/imagen_canto.py
  @version  v3.6.9r2

La usa scripts/generar-enlaces-cantos.py para la etiqueta og:image de cada
pagina c/cpd-XXX.html. Copia la cabecera de la ficha (.song-header):

  - fondo con el degradado verde a 105 grados (--theme-song-header-bg-*),
  - barra vertical a la izquierda (--theme-song-header-bar-*),
  - momento liturgico arriba, en EB Garamond cursiva espaciada y verde
    claro (.song-moment-label, --theme-song-header-moment),
  - titulo en Cinzel seminegrita, color hueso (--theme-song-header-title),
    con la misma sombra suave.

Una diferencia deliberada con la ficha:

  - SIN NUMERO DE CANTO. El 57 de la ficha es la posicion en el cancionero y
    cambia cada vez que se inserta un canto antes. Si fuera en la imagen,
    cada canto nuevo regeneraria decenas de imagenes (y engordaria el repo
    con binarios) y las vistas previas ya compartidas quedarian con un
    numero viejo. El titulo y el momento, en cambio, no cambian.

Fuentes:
  - Cinzel: del base64 de js/modules/26b-cinzel-font.js, la misma que usan
    los PDF. Una sola fuente de verdad.
  - EB Garamond cursiva: scripts/fuentes/EBGaramond-Italic.ttf (Google
    Fonts, licencia OFL en OFL-EBGaramond.txt). Es variable; se usa su peso
    por defecto, 400, el mismo de la ficha. v3.6.9r2: antes el momento iba
    en Cinzel porque esta fuente no estaba en el repo; Renzo pidio la
    cursiva de la ficha.
"""
import base64
import io
import os
import re

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULO_FUENTES = os.path.join(RAIZ, "js", "modules", "26b-cinzel-font.js")
GARAMOND_CURSIVA = os.path.join(RAIZ, "scripts", "fuentes", "EBGaramond-Italic.ttf")

ANCHO, ALTO = 1200, 630

# Colores de la cabecera de la ficha (css/tokens.css, tema verde).
FONDO_DESDE = (0x14, 0x22, 0x0E)
FONDO_MEDIO = (0x1E, 0x34, 0x16)
FONDO_HASTA = (0x2A, 0x4A, 0x20)
BARRA_DESDE = (0x7A, 0xA8, 0x58)
BARRA_HASTA = (0x5C, 0x8A, 0x3A)
COLOR_MOMENTO = (0xB0, 0xD8, 0x88)
COLOR_TITULO = (0xEC, 0xF4, 0xDC)
COLOR_MARCA = (0xA8, 0xD0, 0x80)

MARGEN_IZQ = 120
MARGEN_DER = 100
ANCHO_TEXTO = ANCHO - MARGEN_IZQ - MARGEN_DER

_fuentes = {}
_fondo = None


def _bytes_fuente(variante):
    with io.open(MODULO_FUENTES, encoding="utf-8") as f:
        js = f.read()
    m = re.search(r"\b%s:\s*'([A-Za-z0-9+/=]+)'" % variante, js)
    if not m:
        raise SystemExit("No encuentro Cinzel '%s' en %s" % (variante, MODULO_FUENTES))
    return base64.b64decode(m.group(1))


def fuente(variante, tam):
    clave = (variante, tam)
    if clave not in _fuentes:
        _fuentes[clave] = ImageFont.truetype(io.BytesIO(_bytes_fuente(variante)), tam)
    return _fuentes[clave]


def garamond_cursiva(tam):
    clave = ("garamond-italic", tam)
    if clave not in _fuentes:
        f = ImageFont.truetype(GARAMOND_CURSIVA, tam)
        try:
            f.set_variation_by_axes([400])    # peso de la ficha, explicito
        except (OSError, AttributeError):
            pass                              # sin soporte de ejes: 400 ya es el defecto
        _fuentes[clave] = f
    return _fuentes[clave]


def _mezcla(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _fondo_base():
    """Degradado de la cabecera, calculado una vez y reutilizado."""
    global _fondo
    if _fondo is not None:
        return _fondo.copy()
    # linear-gradient(105deg, ...): direccion casi horizontal, un poco
    # inclinada. Se calcula a escala 1/4 y se amplia: el degradado es suave
    # y asi tarda una fraccion.
    import math
    w, h = ANCHO // 4, ALTO // 4
    ang = math.radians(105)
    dx, dy = math.sin(ang), -math.cos(ang)
    largo = abs(w * dx) + abs(h * dy)
    peq = Image.new("RGB", (w, h))
    px = peq.load()
    for y in range(h):
        for x in range(w):
            t = ((x - w / 2) * dx + (y - h / 2) * dy) / largo + 0.5
            t = min(1.0, max(0.0, t))
            px[x, y] = (_mezcla(FONDO_DESDE, FONDO_MEDIO, t * 2) if t < 0.5
                        else _mezcla(FONDO_MEDIO, FONDO_HASTA, (t - 0.5) * 2))
    _fondo = peq.resize((ANCHO, ALTO), Image.BICUBIC)

    # Barra vertical izquierda: 4 px en la ficha, a escala de la imagen.
    d = ImageDraw.Draw(_fondo)
    for y in range(ALTO):
        d.line([(0, y), (11, y)], fill=_mezcla(BARRA_DESDE, BARRA_HASTA, y / (ALTO - 1)))
    return _fondo.copy()


def _ancho_espaciado(texto, f, tracking):
    if not texto:
        return 0
    return sum(f.getlength(c) for c in texto) + tracking * (len(texto) - 1)


def _dibujar_espaciado(d, xy, texto, f, tracking, fill):
    x, y = xy
    for c in texto:
        d.text((x, y), c, font=f, fill=fill)
        x += f.getlength(c) + tracking


def _partir(texto, f, ancho):
    palabras, lineas, actual = texto.split(), [], ""
    for p in palabras:
        prueba = (actual + " " + p).strip()
        if f.getlength(prueba) <= ancho or not actual:
            actual = prueba
        else:
            lineas.append(actual)
            actual = p
    if actual:
        lineas.append(actual)
    return lineas


def _titulo_que_cabe(titulo):
    """Mayor tamano con el que el titulo cabe en tres lineas como maximo."""
    for tam in range(96, 47, -4):
        f = fuente("bold", tam)
        lineas = _partir(titulo, f, ANCHO_TEXTO)
        if len(lineas) <= 3 and all(f.getlength(l) <= ANCHO_TEXTO for l in lineas):
            return f, tam, lineas
    f = fuente("bold", 48)
    return f, 48, _partir(titulo, f, ANCHO_TEXTO)[:3]


def imagen(titulo, momento):
    """Devuelve los bytes JPEG de la vista previa del canto."""
    lienzo = _fondo_base()

    # Momento como en la ficha: EB Garamond cursiva, letter-spacing .2em, en
    # mayusculas y minusculas tal cual (no en versales).
    TAM_MOM = 40
    f_mom = garamond_cursiva(TAM_MOM)
    track_mom = TAM_MOM * 0.2
    f_tit, tam_tit, lineas = _titulo_que_cabe(titulo)
    alto_linea = int(tam_tit * 1.2)           # line-height: 1.2, como en la ficha

    # Bloque momento + titulo centrado en la franja que deja libre el pie.
    alto_mom, hueco = 40, 22
    alto_bloque = alto_mom + hueco + alto_linea * len(lineas)
    zona_alta, zona_baja = 40, 500
    y0 = zona_alta + (zona_baja - zona_alta - alto_bloque) // 2

    d = ImageDraw.Draw(lienzo)
    _dibujar_espaciado(d, (MARGEN_IZQ, y0), momento, f_mom, track_mom, COLOR_MOMENTO)

    # Sombra del titulo (text-shadow: 0 1px 10px rgba(0,0,0,.30)), a escala.
    y_tit = y0 + alto_mom + hueco
    sombra = Image.new("L", (ANCHO, ALTO), 0)
    ds = ImageDraw.Draw(sombra)
    for i, linea in enumerate(lineas):
        ds.text((MARGEN_IZQ, y_tit + i * alto_linea + 3), linea, font=f_tit, fill=255)
    sombra = sombra.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.45))
    lienzo.paste((0, 0, 0), (0, 0), sombra)

    d = ImageDraw.Draw(lienzo)
    for i, linea in enumerate(lineas):
        d.text((MARGEN_IZQ, y_tit + i * alto_linea), linea, font=f_tit, fill=COLOR_TITULO)

    # Pie: filete fino y la firma del coro.
    y_pie = 548
    d.line([(MARGEN_IZQ, y_pie - 22), (MARGEN_IZQ + 64, y_pie - 22)], fill=BARRA_HASTA, width=2)
    f_marca = fuente("regular", 22)
    _dibujar_espaciado(d, (MARGEN_IZQ, y_pie), "CORO PACEM DEUS  \u00b7  CANCIONERO DOMINICAL",
                       f_marca, 22 * 0.18, COLOR_MARCA)

    salida = io.BytesIO()
    lienzo.save(salida, "JPEG", quality=88, optimize=True, progressive=True)
    return salida.getvalue()
