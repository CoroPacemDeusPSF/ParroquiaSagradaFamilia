# -*- coding: utf-8 -*-
"""
Monta obra real de dominio publico como fondo liturgico.

  @file     scripts/montar-obra.py
  @version  v3.6.7r41

── POR QUE SE MONTA Y NO SE RECORTA ──────────────────────────────────────

Los cuadros van de 0,44 a 1,41 de proporcion y la portada pide 1,78. Ninguno
encaja. Recortar un Caravaggio a panoramico seria destrozarlo, asi que no se
recorta: se monta entero sobre campo oscuro, como una lamina colgada en una
sala en penumbra.

Eso resuelve tres cosas de una vez:

  - la obra queda intacta, que es lo respetuoso y lo que mejor se ve,
  - el hueco de la interfaz nace vacio y oscuro POR DISENO —a la izquierda en
    apaisado, abajo en vertical— y ya no hay que forzarlo con velos ni rogarle
    a un modelo que obedezca,
  - parece deliberado, de museo, y encaja con el lenguaje del cancionero.

── POR QUE LA CURACION NO SE AUTOMATIZA ──────────────────────────────────

La obra de cada domingo se elige a mano en obras.json. Buscar por palabras no
sirve: pedir "Caravaggio Supper at Emmaus" devolvio un Rottenhammer con
licencia CC BY-SA. Aqui solo se descarga lo ya decidido, y se COMPRUEBA la
licencia antes de guardar nada: si no es libre, se aborta ese domingo.
"""
import io, json, os, re, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_IMG = os.path.join(RAIZ, "img", "liturgico")
OBRAS = os.path.join(DIR_IMG, "obras.json")

UA = {"User-Agent": "CoroPacemDeus/1.0 (renzo.nunez@solidunicorn.com)"}

ENTREGA = {"desktop": (1536, 864), "mobile": (1024, 2276)}
FONDO = (10, 13, 9)
ORO = (150, 116, 52)
WEBP_Q = 86

# Licencias que permiten el uso sin condiciones. CC0 es tan libre como el
# dominio publico: el Met libera asi y algunas de sus copias son las mejores.
LIBRES = ("public domain", "cc0", "pd-", "no restrictions")


def _limpia(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def _consulta(partes):
    u = "https://commons.wikimedia.org/w/api.php?" + "&".join(partes)
    return json.load(urllib.request.urlopen(
        urllib.request.Request(u, headers=UA), timeout=120))


def resuelve(entrada):
    """Encuentra en Commons el archivo de la obra elegida.

    No se puede escribir a mano el nombre exacto de 73 archivos: llevan
    erratas ('Caravaggo'), guiones tipograficos y sufijos de proyecto. Se
    busca por titulo y autor y se elige el mejor candidato que cumpla LAS DOS
    condiciones: licencia libre y autor coincidente. Sin coincidencia de autor
    no se acepta nada, porque pedir 'Caravaggio Supper at Emmaus' llego a
    devolver un Rottenhammer.
    """
    if entrada.get("archivo"):
        return entrada["archivo"]

    esperado = entrada["autor_esperado"].lower()
    d = _consulta(["action=query", "format=json", "generator=search",
                   "gsrsearch=" + urllib.parse.quote(entrada["buscar"]),
                   "gsrlimit=12", "gsrnamespace=6",
                   "prop=imageinfo", "iiprop=url|size|extmetadata"])
    cand = []
    for p in (d.get("query", {}).get("pages") or {}).values():
        ii = p["imageinfo"][0]
        em = ii.get("extmetadata", {})
        lic = _limpia(em.get("LicenseShortName", {}).get("value", ""))
        autor = _limpia(em.get("Artist", {}).get("value", ""))
        titulo = p["title"][5:]
        if not any(t in lic.lower() for t in LIBRES):
            continue
        if esperado not in (titulo + " " + autor).lower():
            continue
        # Los PDF y las estampas de libro se descartan: no son la pintura.
        if titulo.lower().endswith((".pdf", ".svg", ".tif", ".tiff")):
            continue
        if ii["width"] < 900 or ii["height"] < 900:
            continue
        cand.append((ii["width"] * ii["height"], titulo))
    if not cand:
        raise RuntimeError("sin candidato libre de %s para: %s"
                           % (entrada["autor_esperado"], entrada["buscar"]))
    return max(cand)[1]


def ficha(titulo_archivo):
    """Metadatos y bytes de un archivo concreto de Commons."""
    d = _consulta(["action=query", "format=json",
                   "titles=" + urllib.parse.quote("File:" + titulo_archivo),
                   "prop=imageinfo", "iiprop=url|size|extmetadata",
                   "iiurlwidth=3000"])
    paginas = list((d.get("query", {}) or {}).get("pages", {}).values())
    if not paginas or "imageinfo" not in paginas[0]:
        raise RuntimeError("no existe en Commons: " + titulo_archivo)
    ii = paginas[0]["imageinfo"][0]
    em = ii.get("extmetadata", {})
    lic = _limpia(em.get("LicenseShortName", {}).get("value", "?"))

    if not any(t in lic.lower() for t in LIBRES):
        raise RuntimeError("licencia NO libre (%s) en %s" % (lic, titulo_archivo))

    datos = urllib.request.urlopen(
        urllib.request.Request(ii.get("thumburl") or ii["url"], headers=UA), timeout=300).read()
    return {
        "imagen": Image.open(io.BytesIO(datos)).convert("RGB"),
        "licencia": lic,
        "archivo": titulo_archivo,
        "autor": _limpia(em.get("Artist", {}).get("value", "")),
        "credito": _limpia(em.get("Credit", {}).get("value", ""))[:120],
        "pagina": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(titulo_archivo),
    }


def cubre(im, w, h):
    """Escala y recorta como object-fit: cover."""
    k = max(w / float(im.width), h / float(im.height))
    im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2,
                    (im.width - w) // 2 + w, (im.height - h) // 2 + h))


def monta(obra, variante):
    """La obra entera sobre un fondo hecho con ella misma, desenfocado.

    ── POR QUE NO UN MARCO SOBRE CAMPO LISO ──────────────────────────────

    El primer montaje ponia la lamina con filete dorado sobre negro liso. Se
    medio en produccion y no funcionaba, por dos razones:

      1. La interfaz del cancionero esta CENTRADA, no a la izquierda: la
         tarjeta liturgica ocupa del 28% al 72% del ancho. Reservar el tercio
         izquierdo era reservar donde no hay texto.
      2. La portada cambia de proporcion entre 1,2 y 4,0 segun la pantalla, y
         el navegador recorta con `cover`. En pantallas anchas se comia el
         filete de arriba y abajo; en estrechas, el cuadro se salia por la
         derecha. Un borde duro solo se ve entero en una proporcion.

    Con una tarjeta que ocupa el 44% central no cabe una lamina grande sin
    solaparse. Asi que el cuadro va DETRAS, como en cualquier portada, y la
    legibilidad la da el velo que el sitio ya aplica.

    Para no recortar la obra, el fondo se hace con ella misma: una copia muy
    ampliada, desenfocada y oscurecida rellena el lienzo entero, y encima va
    la obra COMPLETA, sin cortar. Cualquier recorte del navegador se come
    fondo, nunca pintura, y a cualquier proporcion parece intencionado.
    """
    W, H = ENTREGA[variante]

    # Fondo: la propia obra, desbordada, desenfocada y apagada.
    fondo = cubre(obra, W, H).filter(ImageFilter.GaussianBlur(max(W, H) // 26))
    fondo = ImageEnhance.Brightness(fondo).enhance(0.30)
    fondo = ImageEnhance.Color(fondo).enhance(0.55)
    lienzo = Image.blend(Image.new("RGB", (W, H), FONDO), fondo, 0.82)

    # La obra completa, dentro de la zona que sobrevive a cualquier recorte.
    if variante == "desktop":
        # Medido contra los dos recortes extremos del navegador: en pantalla
        # ancha solo sobrevive el 59% central del ALTO, y en estrecha el 67%
        # central del ANCHO. La obra se dimensiona para caber dentro de esa
        # interseccion, de modo que se ve ENTERA en cualquier pantalla.
        caja_w, caja_h = int(W * 0.38), int(H * 0.58)
        centro_x = int(W * 0.65)          # a la derecha del texto centrado
    else:
        caja_w, caja_h = int(W * 0.80), int(H * 0.30)
        centro_x = W // 2

    k = min(caja_w / float(obra.width), caja_h / float(obra.height))
    ancho, alto = int(obra.width * k), int(obra.height * k)
    obra = obra.resize((ancho, alto), Image.LANCZOS)

    x = max(0, min(W - ancho, centro_x - ancho // 2))
    y = (H - alto) // 2 if variante == "desktop" else int(H * 0.06)

    # Sombra suave que despega la obra del fondo, sin trazar un borde.
    sombra = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sombra).rectangle(
        [x - 14, y - 14, x + ancho + 14, y + alto + 14], fill=190)
    lienzo = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), lienzo,
                             sombra.filter(ImageFilter.GaussianBlur(22)))

    lienzo.paste(obra, (x, y))
    ImageDraw.Draw(lienzo).rectangle(
        [x - 1, y - 1, x + ancho, y + alto], outline=ORO, width=2)
    return lienzo


def main():
    if not os.path.exists(OBRAS):
        raise SystemExit("falta " + OBRAS)
    with open(OBRAS, encoding="utf-8") as f:
        catalogo = json.load(f)

    claves = sys.argv[1:] or [k for k in sorted(catalogo) if not k.startswith("_")]
    creditos, fallos = {}, []

    for clave in claves:
        entrada = catalogo.get(clave)
        if not entrada:
            print("%s  sin obra asignada" % clave)
            continue
        try:
            d = ficha(resuelve(entrada))
        except Exception as e:
            fallos.append((clave, entrada["obra"], str(e)[:150]))
            print("%s  ABORTADO: %s" % (clave, str(e)[:110]))
            continue

        for variante in ("desktop", "mobile"):
            ruta = os.path.join(DIR_IMG, "%s-%s.webp" % (clave, variante))
            monta(d["imagen"], variante).save(ruta, "WEBP", quality=WEBP_Q, method=6)

        creditos[clave] = {
            "obra": entrada["obra"], "autor": entrada["autor"],
            "museo": entrada.get("museo", ""), "licencia": d["licencia"],
            "archivo": d["archivo"], "pagina": d["pagina"],
        }
        print("%s  %-40s %-14s %5dx%-5d" % (
            clave, entrada["obra"][:40], d["licencia"][:14],
            d["imagen"].width, d["imagen"].height))

    if creditos:
        p = os.path.join(DIR_IMG, "creditos.json")
        previo = {}
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                previo = json.load(f)
        previo.update(creditos)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(previo, f, ensure_ascii=False, indent=1, sort_keys=True)
        print("\n%d montadas  ·  creditos.json tiene %d obras" % (len(creditos), len(previo)))

    if fallos:
        print("\n%d SIN RESOLVER — hay que elegirles otra obra:" % len(fallos))
        for clave, obra, err in fallos:
            print("   %s  %-38s %s" % (clave, obra[:38], err[:70]))


if __name__ == "__main__":
    main()
