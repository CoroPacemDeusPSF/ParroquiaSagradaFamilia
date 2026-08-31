# -*- coding: utf-8 -*-
"""
Monta obra real de dominio publico como fondo liturgico.

  @file     scripts/montar-obra.py
  @version  v3.6.7r50

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

# Cuanto se apaga la obra al pasarla a fondo. Vive aqui arriba y no enterrado
# en monta().
#
# Historia de estos numeros: se empezo en brillo 0,46 y se fue subiendo por
# tandas (0,55, 0,60) porque la obra se veia opaca. La causa real no era solo
# el brillo: el sitio pintaba ENCIMA un scrim liturgico con alfas de 0,72 a
# 0,93 en los extremos, y las dos capas se sumaban. En r50 el scrim CSS bajo a
# tinte ligero y la legibilidad quedo a cargo del velo adaptativo de aqui
# abajo, que mide cada imagen; a cambio la imagen de fabrica respira:
BRILLO = 0.74
SATURACION = 0.82      # antes 0,62: los colores se veian grises
CONTRASTE = 0.95       # antes 0,86: casi natural, el lavado venia de aqui

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


def _veladura(im):
    """Apaga y desatura para que la obra sea atmosfera y no protagonista."""
    im = ImageEnhance.Color(im).enhance(SATURACION)
    im = ImageEnhance.Contrast(im).enhance(CONTRASTE)
    return ImageEnhance.Brightness(im).enhance(BRILLO)


def monta(obra, variante):
    """La obra fundida en la portada como atmosfera, no como protagonista.

    ── LO QUE SE INTENTO ANTES Y POR QUE SE DESCARTO ─────────────────────

    Primero se monto la obra como lamina con filete dorado sobre campo oscuro,
    y despues se toco el CSS de la portada para reservarle la mitad derecha.
    Lo segundo funcionaba en la medida —texto y cuadro dejaban de pisarse a
    todas las anchuras— pero rompia el diseno: la portada del cancionero es
    una columna centrada, y desplazarla para hacer hueco a una imagen es
    doblar la pagina para que quepa el adorno. Al reves de como debe ser.

    ── LO QUE SE HACE AHORA ──────────────────────────────────────────────

    La obra pasa al fondo de verdad: llena el lienzo, muy apagada y algo
    desaturada, con una vineta que funde los bordes contra el color de la
    portada. Se lee como una veladura, no como un cuadro colgado. El texto
    vuelve al centro, donde siempre estuvo, y no hay nada que esquivar.

    Que la obra se recorte aqui ya no importa: a esta intensidad no se mira
    como pintura sino como textura. El respeto por la obra estaba en no
    mutilarla cuando era protagonista; de fondo, la exigencia es otra.
    """
    W, H = ENTREGA[variante]

    if variante == "desktop":
        # 16:9 contra cuadros de 0,44 a 1,41: cubrir recorta poco y lo que se
        # pierde son bordes, no el asunto. Va a sangre.
        im = _veladura(cubre(obra, W, H))
    else:
        # ── MOVIL: AL MENOS LA MITAD DEL CUADRO, A TODA PANTALLA ─────────
        # Este lienzo 9:20 ya quemo dos intentos, uno por cada extremo:
        # cubrir a sangre dejaba de un cuadro apaisado una tira central (~30%
        # visible: parecia una mancha), y encogerlo a una estampita en la
        # franja superior lo ensenaba entero pero desperdiciaba la pantalla.
        # Lo pedido es el punto medio: ver AL MENOS LA MITAD de la pintura,
        # repartida por toda la pantalla segun la proporcion de cada obra.
        #
        #   - proporcion <= 0.9 (verticales y casi cuadradas): cubrir ya
        #     ensena el 50% o mas -> a pantalla completa.
        #   - apaisadas: se dibujan al DOBLE del ancho del lienzo. Recortar
        #     un cuarto por cada lado deja visible justo la mitad, y la
        #     altura resultante -el doble del ancho entre la proporcion-
        #     reparte el cuadro por casi todo el visor. Los huecos los
        #     rellena la propia obra desenfocada.
        aspecto = obra.width / float(obra.height)
        if aspecto <= 0.9:
            im = _veladura(cubre(obra, W, H))
        else:
            im = _veladura(cubre(obra, W, H).filter(
                ImageFilter.GaussianBlur(W // 9)))

            ancho = 2 * W                    # visible: W de 2W = la mitad
            alto = max(1, int(ancho / aspecto))
            pieza = _veladura(obra.resize((ancho, alto), Image.LANCZOS))

            # Centrada en el visor real del telefono: el ~74% superior del
            # lienzo (lo de mas abajo lo recorta el navegador), medido en el
            # sitio a 375x812. Nunca pegada al borde superior.
            visor = int(H * 0.74)
            x = -(ancho - W) // 2
            y = max(int(H * 0.02), (visor - alto) // 2)

            # Bordes superior e inferior fundidos contra el desenfoque, para
            # que el corte del recorte no cruce la pantalla como una regla.
            m = Image.new("L", (W, H), 0)
            ImageDraw.Draw(m).rectangle([0, y + 10, W, y + alto - 10], fill=255)
            m = m.filter(ImageFilter.GaussianBlur(W // 24))
            capa = Image.new("RGB", (W, H), FONDO)
            capa.paste(pieza, (x, y))
            im = Image.composite(capa, im, m)

    # Vineta: los bordes se funden con el fondo de la portada en vez de
    # terminar en un canto recto contra el degradado liturgico.
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).ellipse(
        [-int(W * 0.16), -int(H * 0.26), int(W * 1.16), int(H * 1.26)], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(min(W, H) // 7))
    im = Image.composite(im, Image.new("RGB", (W, H), FONDO), m)

    # Y por ultimo el mismo mecanismo de siempre: si aun queda demasiada luz
    # bajo el texto, se le pone el velo justo que falte.
    return apaga_zona_texto(im, variante)


# Franja que ocupa el texto de la portada, en fraccion del lienzo. Medida en
# produccion: titulo, subtitulo, tarjeta liturgica y boton del salmo caen todos
# entre el 25% y el 75% del ancho.
ZONA_TEXTO = {"desktop": (0.24, 0.12, 0.76, 0.95),
              "mobile":  (0.05, 0.17, 0.95, 0.70)}
# 72 y no 62: el scrim CSS aun anade ~0,16-0,20 de tinte en la franja central,
# asi que el compuesto bajo la tarjeta queda igual que antes (~62). Medir aqui
# la imagen sola con el objetivo antiguo seria velar dos veces lo mismo.
P90_OBJETIVO = 72
VELO_MAX = 0.72


def apaga_zona_texto(im, variante):
    """Oscurece la franja del texto lo justo para que se lea.

    Se intento colocar la obra fuera del texto y no hay sitio: la interfaz
    esta CENTRADA y ocupa la mitad del ancho, y la portada cambia de
    proporcion entre 1,2 y 4,0 segun la pantalla, asi que la posicion relativa
    entre cuadro y texto cambia con cada ventana. Ninguna colocacion fija vale
    para todas.

    Asi que se deja de perseguir la geometria y se ataca el sintoma, que es lo
    unico estable: se mide cuanta luz hay bajo el texto y se aplica el velo
    minimo que haga falta. Una obra ya oscura no se toca; una clara recibe un
    velo suave y en degradado, que es como un scrim de portada de toda la vida.
    """
    x0, y0, x1, y1 = ZONA_TEXTO[variante]
    caja = (int(im.width * x0), int(im.height * y0),
            int(im.width * x1), int(im.height * y1))
    negro = Image.new("RGB", im.size, (6, 8, 5))

    def p90(imagen):
        c = imagen.crop(caja)
        c = c.resize((max(1, c.width // 6), max(1, c.height // 6)), Image.BILINEAR)
        v = sorted(0.2126 * a + 0.7152 * b + 0.0722 * d for a, b, d in c.getdata())
        return v[int(len(v) * 0.90)]

    def con_velo(alfa):
        m = Image.new("L", im.size, 0)
        ImageDraw.Draw(m).rectangle(caja, fill=int(255 * alfa))
        # Difuminar el borde del rectangulo convierte el velo en degradado, y
        # asi no deja un canto recto atravesando la pintura.
        return Image.composite(negro, im, m.filter(ImageFilter.GaussianBlur(im.width // 14)))

    actual = p90(im)
    if actual <= P90_OBJETIVO:
        return im

    # La relacion entre alfa y el percentil resultante no es lineal, asi que se
    # aplica, se vuelve a medir y se sube si hace falta.
    alfa = min(VELO_MAX, 1.0 - (P90_OBJETIVO / actual))
    for _ in range(4):
        salida = con_velo(alfa)
        if p90(salida) <= P90_OBJETIVO or alfa >= VELO_MAX:
            return salida
        alfa = min(VELO_MAX, alfa + (1.0 - alfa) * 0.5)
    return salida


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
