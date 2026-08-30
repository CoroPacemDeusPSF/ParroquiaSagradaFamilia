#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
────────────────────────────────────────────────────────────────────────────
  Coro Pacem Deus — Parroquia Sagrada Familia
────────────────────────────────────────────────────────────────────────────

  @file       scripts/generate-backgrounds.py
  @brief      Genera las dos ilustraciones de portada de un domingo
  @author     Renzo Núñez Berdejo
  @project    Cancionero Dominical
  @version    v3.6.7r28

────────────────────────────────────────────────────────────────────────────

USO

  # Semanal, desde el Action
  python scripts/generate-backgrounds.py --week semana.json

  # Solo ver los prompts que se enviarian, sin gastar credito
  python scripts/generate-backgrounds.py --week semana.json --print-prompts

  # Probar el post-proceso con imagenes locales, sin llamar a la API
  python scripts/generate-backgrounds.py --week semana.json \
         --from-files apaisada.jpg vertical.jpg

REQUISITOS
  Pillow.  Variable de entorno OPENAI_API_KEY para el modo real.

────────────────────────────────────────────────────────────────────────────
POR QUE EL POST-PROCESO NO ES OPCIONAL

El generador de imagenes no entrega las proporciones que necesita la portada.
Los tamanos que admite son cuadrado, apaisado 3:2 y vertical 2:3; la portada
pide 16:9 y 9:20. Asi que:

  • APAISADA: se genera en 3:2 y se recorta en altura hasta 16:9. Se ancla
    ligeramente arriba porque en esta composicion la cabeza del sujeto esta
    en el tercio superior y es lo que no se puede perder.

  • VERTICAL: se genera en 2:3 y se EXTIENDE el lienzo hacia abajo hasta 9:20,
    continuando el degradado oscuro. No se recorta de los lados: el sujeto
    vive en el extremo superior derecho y recortar ahi lo decapitaria. Y se
    puede extender sin mentir porque el preset ya exige que el 65% inferior
    sea degradado limpio; lo que anadimos es justo eso.

Ambas decisiones estan en img/liturgico/PRESET.md.
────────────────────────────────────────────────────────────────────────────
"""

import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.error

from PIL import Image, ImageFilter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "img", "liturgico")

API_URL = "https://api.openai.com/v1/images/generations"
# `or` y no el segundo argumento de .get(): en GitHub Actions una variable
# de repositorio no definida llega como cadena VACIA, no ausente, asi que
# .get(clave, defecto) devolvia "" y la API respondia "The model '' does
# not exist". Verificado en el run #2.
DEFAULT_MODEL = os.environ.get("IMAGE_MODEL") or "gpt-image-1"

# COSTE. gpt-image-1 cobra por calidad, y sin este parametro usa la alta.
# Medido: 36 imagenes agotaron 5 USD de saldo, es decir ~0,14 USD cada una,
# no los 0,04 que se habian estimado a partir de tablas de precios genericas.
# Para un fondo oscuro, de poco detalle y que ademas se cubre con un velo,
# pagar calidad alta es tirar el dinero. "medium" es el punto sensato.
# Si alguna semana pidiera mas finura: IMAGE_QUALITY=high en las variables
# del repositorio.
DEFAULT_QUALITY = os.environ.get("IMAGE_QUALITY") or "medium"

# Tamanos que admite el generador; se elige el mas cercano a cada destino.
GEN_SIZE_LANDSCAPE = "1536x1024"   # 3:2  -> se recorta a 16:9
GEN_SIZE_PORTRAIT  = "1024x1536"   # 2:3  -> se extiende a 9:20

TARGET_DESKTOP = (16, 9)
TARGET_MOBILE  = (9, 20)

DELIVER_DESKTOP_W = 1600
DELIVER_MOBILE_W  = 1024


# ── Clasificacion del domingo ──────────────────────────────────────────────
#
# EL PROBLEMA QUE ESTO RESUELVE
#
# La primera version tomaba el campo `e` del calendario como "el santo de la
# semana". Es falso: de los 53 domingos que tienen `e`, 27 dicen "Solemnidad",
# y el resto "Gaudete", "Laetare", "Fiesta", "Domingo del Buen Pastor"...
# En los 171 domingos de 2025-2028 hay UN solo santo real: Santa Rosa de Lima.
# Con aquella logica se le pedia al generador "representa la iconografia
# verificada de Solemnidad" 27 veces al ano.
#
# Y hay un problema mayor: en los domingos sin sujeto nombrado se pedia una
# "evocacion simbolica" pero sin PROHIBIR figuras humanas, y el generador
# respondio con una figura cristica sosteniendo un crucifijo de si mismo, con
# rostros fantasma de relleno. Inventar una figura sagrada generica sale mal.
#
# LA REGLA
#
#   Solo se autoriza una figura humana cuando hay un sujeto NOMBRADO con
#   iconografia canonica. En todo lo demas, composicion simbolica sin rostros.
#
# Repartido sobre los 171 domingos del calendario:
#
#   symbol         126  (73,7%)   parabolas, ensenanzas, domingos del Ordinario
#   christ_scene    38  (22,2%)   Navidad, Bautismo, Pascua, Buen Pastor...
#   marian           6  ( 3,5%)   Anunciacion, Visitacion, Asuncion, Cana
#   saint            1  ( 0,6%)   Santa Rosa de Lima
#
# Tres de cada cuatro semanas NO deben llevar figura humana.

def _norm(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


MARIAN_N = {"santa maria madre de dios", "asuncion de la virgen maria"}
MARIAN_TEMA = (
    "alegrate, llena de gracia",
    "bendita tu entre las mujeres",
    "el poderoso ha hecho obras grandes por mi",
    "la madre de jesus le dijo: no tienen vino",
)
CHRIST_N = {
    "natividad del senor", "epifania del senor", "bautismo del senor",
    "transfiguracion del senor", "domingo de ramos", "domingo de pascua",
    "la ascension del senor", "domingo de pentecostes", "corpus christi",
    "cristo rey del universo", "sagrada familia",
}
CHRIST_E = {
    "pasion del senor", "resurreccion del senor", "domingo del buen pastor",
    "domingo de la divina misericordia",
}
# Valores de `e` que NO son personas, por mucho que ocupen ese campo.
NOT_A_PERSON = {
    "solemnidad", "fiesta", "gaudete", "laetare",
    "domingo de la palabra de dios", "pasion del senor",
    "resurreccion del senor", "domingo de la divina misericordia",
    "domingo del buen pastor",
}


def classify(week):
    n = _norm(week.get("liturgical_context"))
    e = _norm(week.get("special"))
    tema = _norm(week.get("gospel_theme"))
    if e and e not in NOT_A_PERSON:
        return "saint"
    if n in MARIAN_N or tema in MARIAN_TEMA:
        return "marian"
    if n in CHRIST_N or e in CHRIST_E:
        return "christ_scene"
    return "symbol"


# ── Prompts ────────────────────────────────────────────────────────────────

# Negativo comun, reforzado contra rostros repetidos y de relleno: fue el
# artefacto concreto del primer intento, con un rostro duplicado abajo en la
# variante vertical y caras fantasma en el fondo.
NEGATIVE = (
    "text, letters, numbers, logos, signatures, watermarks, buttons, cards, "
    "borders, toolbars, interface icons, centered composition, bright center, "
    "busy scenery, dense flowers, symmetrical poster layout, "
    "duplicated faces, repeated faces, ghost faces in the background, "
    "crowd, extra people, background figures, "
    "extra fingers, missing fingers, malformed hands, asymmetrical eyes, "
    "distorted face, duplicated objects, broken crucifix, "
    "anime, cartoon, 3D plastic render, fantasy armor, fashion editorial, "
    "horror, neon colors, overly ornate Catholic kitsch, "
    "literal glowing halo disk, modern objects, cityscape, mountains, "
    "church interior, garden panorama, dominant green background, "
    "muddy underexposed image, everything pitch black, illegible subject"
)

# CAMBIO IMPORTANTE frente al primer intento: alli se repetia "almost black",
# "very low central luminance" y "vignette" — tres ordenes que se sumaban y
# ahogaban el motivo. Las imagenes salieron a 11/255 de luminancia media, casi
# invisibles. Ahora la oscuridad se CONFINA a la zona de la interfaz y se pide
# explicitamente que el motivo quede legible.
STYLE_BLOCK = (
    "Style: cinematic sacred fine-art realism, museum-quality religious "
    "painting, high-end editorial finish, subtle painterly grain, natural "
    "materials, reverent and understated rather than ornamental or kitsch. "
    "Lighting: low-key chiaroscuro. The focal motif must be CLEARLY LIT and "
    "fully readable, lifted out of the darkness by a soft warm directional "
    "light, the way a Baroque still life or a Georges de La Tour scene is lit. "
    "Darkness belongs to the empty side of the frame, NOT to the motif itself. "
    "Backdrop: minimal near-black gradient between deep burgundy, oxblood and "
    "charcoal, with very discreet painterly texture. No landscape, no "
    "architecture, no cityscape, no garden. "
    "Palette: the empty areas stay almost black (#12090D, #130B0E); burgundy is "
    "felt rather than seen; warm highlights (#A58E6D, #C1AC87) are reserved for "
    "the motif. No bright patch where the interface sits, but do not "
    "underexpose the motif to achieve that."
)


# Reserva para los temas sin objeto propio. Rota de forma DETERMINISTA con la
# fecha del domingo: sin esto, varias semanas abstractas seguidas devolvian el
# mismo motivo —una cruz con el Evangelio abierto— y la portada se repetia.
# Determinista y no aleatorio para que regenerar un domingo de al mismo objeto.
FALLBACK_MOTIFS = (
    "an open Gospel book on worn wood",
    "a plain hewn wooden cross",
    "a single clay oil lamp burning in the dark",
    "a folded linen cloth over aged oak",
    "a clay cup and a piece of broken bread",
    "a beeswax candle with a still flame",
    "an iron key resting on old parchment",
)


def _fallback_motif(week):
    # crc32 y no el valor numerico de la fecha: los domingos van de 7 en 7, y
    # con 7 motivos el modulo daba SIEMPRE el mismo indice dentro de un mes.
    # crc32 es estable entre ejecuciones y plataformas, a diferencia de hash().
    import zlib
    key = week.get("sunday_key", "")
    return FALLBACK_MOTIFS[zlib.crc32(key.encode("utf-8")) % len(FALLBACK_MOTIFS)]


def subject_block(week):
    """Que se pide representar, segun la categoria del domingo."""
    cat = classify(week)
    tema = week.get("gospel_theme", "")
    gospel = week.get("gospel", "")
    context = week.get("liturgical_context", "")
    season = week.get("season", "")

    if cat == "saint":
        return (
            "Featured subject: " + week.get("featured_subject", "") + ". "
            "Depict the verified traditional Catholic iconography of this "
            "specific saint and nothing borrowed from another. One single "
            "figure, no companions, no bystanders. Liturgical context: "
            + context + ". Gospel of the day: " + gospel + " - " + tema + "."
        )

    if cat == "marian":
        return (
            "Featured subject: the Blessed Virgin Mary in traditional Catholic "
            "iconography, for " + context + ". One single figure, serene and "
            "contemplative, no companions and no bystanders. The scene evoked "
            "is " + gospel + " - " + tema + "."
        )

    if cat == "christ_scene":
        return (
            "Featured subject: the canonical Catholic depiction of " + context +
            ", as fixed by the tradition of sacred art. The Gospel scene is "
            + gospel + " - " + tema + ". Keep the figures to the strict minimum "
            "the scene requires: no crowd, no filler bystanders, no faces in "
            "the background. Never show a figure holding an image of itself."
        )

    # ── symbol: tres de cada cuatro domingos ──
    #
    # Sin figura humana. El tema del Evangelio casi siempre trae ya una imagen
    # concreta —el sembrador, el tesoro, la vid, el pan, las lamparas— y de ahi
    # sale una naturaleza muerta sacra. Si el tema es abstracto, luz y materia.
    return (
        "Featured subject: a sacred still life. NO PEOPLE, NO FACES, NO HANDS, "
        "no human figures of any kind, not even distant or blurred ones. "
        "Build the image from the concrete objects and materials evoked by this "
        "Gospel line: " + gospel + " - " + tema + " (" + context + ", " + season +
        " season). Take the visual metaphor literally: if the line speaks of "
        "sowing, show seed and furrowed earth; of a hidden treasure, an old "
        "chest and turned soil; of a vine, vine and branches; of bread, broken "
        "bread; of lamps, oil lamps in the dark; of a stone, a hewn "
        "cornerstone; of a coin, a worn silver coin. "
        "If and only if the line is truly abstract with no object in it, fall "
        "back to: " + _fallback_motif(week) + ". "
        "One clear motif, nothing crowded."
    )


def _composition_desktop(week):
    if classify(week) == "symbol":
        return (
            "Composition: place the motif in the right third of the frame, "
            "occupying roughly 22% to 30% of the canvas width, cropped by the "
            "right edge if needed, dissolving softly into darkness toward the "
            "centre. Keep the entire central and left area empty, very dark and "
            "low-detail: a website interface sits there. Leave clean margin at "
            "the top and bottom edges, the image will be cropped in height."
        )
    return (
        "Composition: place the figure on the extreme right side, occupying "
        "roughly 20% to 28% of the canvas width, waist-up, partially cropped by "
        "the right edge, dissolving softly into darkness toward the lower and "
        "central areas. Gaze slightly downward and toward the centre. Keep the "
        "entire central and left area empty, very dark and low-detail: a "
        "website interface sits there. Leave clean margin at the top and bottom "
        "edges, the image will be cropped in height."
    )


def _composition_mobile(week):
    what = "motif" if classify(week) == "symbol" else "figure"
    return (
        "Composition: show only a small, subdued " + what + " at the extreme "
        "upper-right edge, occupying no more than the rightmost third and only "
        "the upper 30% of the image, partially cropped by the right edge. Fade "
        "it completely into darkness before one third of the image height. Keep "
        "the central column dark, clean and nearly detail-free from top to "
        "bottom. Keep the entire lower two thirds free of any subject, object "
        "or visible highlight: only a dark gradient with extremely subtle "
        "grain. The " + what + " must read as a devotional watermark rather "
        "than a hero image, but must still be clearly legible. The bottom edge "
        "must be pure dark gradient, the canvas will be extended downward."
    )


def prompt_desktop(week):
    return (
        "Standalone premium website background, landscape. No text, no user "
        "interface, no logo, no signature, no watermark.\n\n"
        + subject_block(week) + "\n\n"
        + _composition_desktop(week) + "\n\n"
        + STYLE_BLOCK + "\n\n"
        "Avoid: " + NEGATIVE
    )


def prompt_mobile(week):
    return (
        "Standalone premium mobile app background, tall portrait. No text, no "
        "user interface, no logo, no signature, no watermark.\n\n"
        + subject_block(week) + "\n\n"
        + _composition_mobile(week) + "\n\n"
        + STYLE_BLOCK + "\n\n"
        "Avoid: " + NEGATIVE + ", full body figure, large subject"
    )


# ── Llamada al generador ───────────────────────────────────────────────────

def generate(prompt, size, model, api_key, quality=None):
    cuerpo = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }
    if quality:
        cuerpo["quality"] = quality
    payload = json.dumps(cuerpo).encode("utf-8")

    req = urllib.request.Request(
        API_URL, data=payload,
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            body = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:600]
        pista = ""
        if "no credits" in detail or "insufficient_quota" in detail:
            pista = ("\nSE ACABO EL SALDO de la API. Recarga en "
                     "platform.openai.com y vuelve a lanzar: los domingos ya "
                     "generados se saltan solos, asi que no se paga dos veces.")
        elif "model" in detail:
            pista = ("\nSi el error menciona el modelo, ajusta la variable "
                     "IMAGE_MODEL del repositorio: el identificador cambia "
                     "entre generaciones.")
        elif "quality" in detail:
            pista = ("\nSi el error menciona la calidad, ajusta IMAGE_QUALITY "
                     "(low | medium | high | auto) o deja la variable vacia.")
        raise SystemExit("La API respondio HTTP %d.\n%s%s" % (e.code, detail, pista))

    item = body["data"][0]
    if "b64_json" in item:
        return base64.b64decode(item["b64_json"])
    with urllib.request.urlopen(item["url"], timeout=300) as r:
        return r.read()


# ── Post-proceso ───────────────────────────────────────────────────────────

def crop_to_aspect(im, ratio, anchor_y=0.38):
    """Recorta al alto necesario para alcanzar la proporcion pedida."""
    tw, th = ratio
    target = tw / float(th)
    w, h = im.size
    if abs(w / float(h) - target) < 0.005:
        return im
    if w / float(h) > target:
        new_w = int(round(h * target))
        x = int(round((w - new_w) * 0.5))
        return im.crop((x, 0, x + new_w, h))
    new_h = int(round(w / target))
    y = int(round((h - new_h) * anchor_y))
    return im.crop((0, y, w, y + new_h))


def extend_down_to_aspect(im, ratio):
    """
    Alarga el lienzo hacia abajo continuando el degradado oscuro, en vez de
    recortar los lados. El preset exige que la parte baja sea degradado limpio,
    asi que lo que se anade es exactamente lo que deberia haber ahi.
    """
    tw, th = ratio
    target = tw / float(th)
    w, h = im.size
    if w / float(h) <= target + 0.005:
        return im

    new_h = int(round(w / target))
    canvas = Image.new("RGB", (w, new_h), (0, 0, 0))
    canvas.paste(im, (0, 0))

    # Color de arranque: media de las ultimas filas de la imagen original
    strip = im.crop((0, h - max(4, h // 60), w, h)).resize((1, 1), Image.LANCZOS)
    r0, g0, b0 = strip.getpixel((0, 0))
    # Destino: casi negro con matiz borgona, como pide la paleta del preset
    r1, g1, b1 = 9, 5, 8

    px = canvas.load()
    span = new_h - h
    for y in range(h, new_h):
        t = (y - h) / float(span)
        t = t * t                     # cae rapido y luego se asienta
        r = int(round(r0 + (r1 - r0) * t))
        g = int(round(g0 + (g1 - g0) * t))
        b = int(round(b0 + (b1 - b0) * t))
        for x in range(w):
            px[x, y] = (r, g, b)

    # Difumina la costura para que no quede una linea horizontal visible
    seam_h = max(8, h // 40)
    box = (0, max(0, h - seam_h), w, min(new_h, h + seam_h * 3))
    seam = canvas.crop(box).filter(ImageFilter.GaussianBlur(seam_h * 0.6))
    canvas.paste(seam, box)
    return canvas


def _lumas(im, y0, y1, x0=0.0, x1=1.0):
    s = im.convert("RGB").resize((160, 160))
    p = s.load()
    out = []
    for y in range(int(160 * y0), max(int(160 * y1), int(160 * y0) + 1)):
        for x in range(int(160 * x0), max(int(160 * x1), int(160 * x0) + 1)):
            r, g, b = p[x, y]
            out.append(0.2126 * r + 0.7152 * g + 0.0722 * b)
    return out or [0.0]


def zone_luma(im, y0, y1, x0=0.0, x1=1.0):
    v = _lumas(im, y0, y1, x0, x1)
    return sum(v) / len(v)


def zone_p95(im, y0, y1, x0=0.0, x1=1.0):
    """Luminancia del 5% mas claro de la zona: dice si HAY algo iluminado ahi,
    cosa que la media no dice cuando la zona es casi toda fondo negro."""
    v = sorted(_lumas(im, y0, y1, x0, x1))
    return v[int(len(v) * 0.95) - 1]


def finish(im, variant, out_path):
    if variant == "desktop":
        im = crop_to_aspect(im, TARGET_DESKTOP, anchor_y=0.30)
        target_w = DELIVER_DESKTOP_W
    else:
        im = extend_down_to_aspect(im, TARGET_MOBILE)
        target_w = DELIVER_MOBILE_W

    w, h = im.size
    if target_w < w:                      # nunca se amplia: interpolar solo pesa
        im = im.resize((target_w, int(round(h * target_w / float(w)))), Image.LANCZOS)

    im = im.convert("RGB")
    im.save(out_path, "WEBP", quality=82, method=6)

    kb = os.path.getsize(out_path) / 1024.0
    top = zone_luma(im, 0.00, 0.30)
    centre = zone_luma(im, 0.10, 0.90, 0.28, 0.72)
    print("  %-8s %dx%d  %6.1f KB   luma arriba %3.0f/255   luma centro %3.0f/255"
          % (variant, im.size[0], im.size[1], kb, top, centre))

    # ── Que se avisa y que no ────────────────────────────────────────────
    #
    # Este control avisa SOLO de lo unico que mide con fiabilidad: que no haya
    # una zona clara donde va el texto. Eso es contraste, es objetivo y es
    # critico para la accesibilidad.
    #
    # NO dictamina si la imagen esta "demasiado oscura". Se intento con un
    # umbral y se equivocaba. Medido sobre seis imagenes reales, en la zona del
    # motivo:
    #
    #                        media   percentil 95
    #   aprobada apaisada      30        117
    #   aprobada vertical      18         51
    #   mala     apaisada      12         30
    #   mala     vertical      17         44
    #   buena    apaisada      12         42
    #   buena    vertical      11         34
    #
    # Ni la media ni el percentil separan lo bueno de lo malo: la vertical BUENA
    # queda por debajo de la MALA en ambas. Y es logico, porque el fallo de
    # aquella vertical no era la luz sino un rostro duplicado, algo que ninguna
    # estadistica de luminancia puede ver. Ajustar el umbral a seis muestras
    # seria fingir un criterio que no se tiene.
    #
    # Asi que los numeros del motivo se REPORTAN, para que quien mira el PR
    # tenga contexto, pero no emiten veredicto. El veredicto es humano.
    zona = (0.05, 0.95, 0.70, 1.00) if variant == "desktop" else (0.02, 0.32, 0.62, 1.00)
    motif_mean = zone_luma(im, *zona)
    motif_p95 = zone_p95(im, *zona)
    print("           motivo: media %3.0f  ·  percentil 95 %3.0f" % (motif_mean, motif_p95))

    warn = []
    if centre > 60:
        warn.append("el centro esta claro (%d/255): el texto de la portada puede "
                    "perder contraste" % centre)
    if top > 70:
        warn.append("la franja superior esta clara (%d/255)" % top)
    return warn


# ── Principal ──────────────────────────────────────────────────────────────

def run_batch(semanas, args):
    """Genera varios domingos seguidos. Un fallo individual NO tumba el lote:
    se anota y se sigue, porque perder 30 imagenes buenas por la 31 seria
    absurdo y ademas costaria volver a pagarlas."""
    import time

    os.makedirs(OUT_DIR, exist_ok=True)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("Falta OPENAI_API_KEY.")

    hechas, fallidas, avisos = [], [], []
    print("LOTE de %d domingos\n" % len(semanas))

    for i, week in enumerate(semanas, 1):
        key = week["sunday_key"]
        cat = classify(week)
        print("[%2d/%d] %s  %-13s %s" % (i, len(semanas), key, cat,
                                         week.get("liturgical_context", "")[:44]))

        prompts = {"desktop": prompt_desktop(week), "mobile": prompt_mobile(week)}
        ok_par = True
        for variant, gen_size in (("desktop", GEN_SIZE_LANDSCAPE),
                                  ("mobile", GEN_SIZE_PORTRAIT)):
            out = os.path.join(OUT_DIR, "%s-%s.webp" % (key, variant))
            if os.path.exists(out):
                print("        %s ya existe, se salta" % variant)
                continue
            try:
                raw = generate(prompts[variant], gen_size, args.model, api_key, args.quality)
                tmp = os.path.join(OUT_DIR, ".raw-%s.png" % variant)
                with open(tmp, "wb") as f:
                    f.write(raw)
                im = Image.open(tmp)
                avisos += ["%s %s: %s" % (key, variant, w) for w in finish(im, variant, out)]
                os.remove(tmp)
            except SystemExit as e:
                print("        FALLO en %s: %s" % (variant, str(e)[:160]))
                fallidas.append("%s %s" % (key, variant))
                ok_par = False
            except Exception as e:
                print("        FALLO en %s: %s" % (variant, str(e)[:160]))
                fallidas.append("%s %s" % (key, variant))
                ok_par = False
            # Respiro entre llamadas para no chocar con el limite por minuto.
            time.sleep(2)
        if ok_par:
            hechas.append(key)
        print()

    print("=" * 62)
    print("Domingos completos : %d de %d" % (len(hechas), len(semanas)))
    if fallidas:
        print("Imagenes fallidas  : %d  -> %s" % (len(fallidas), ", ".join(fallidas)))
    if avisos:
        print("Avisos de contraste:")
        for a in avisos:
            print("   - " + a)
    else:
        print("Avisos de contraste: ninguno")

    salida = os.environ.get("GITHUB_OUTPUT")
    if salida:
        with open(salida, "a", encoding="utf-8") as f:
            resumen = "%d domingos generados" % len(hechas)
            if fallidas:
                resumen += "; %d imagenes fallidas (%s)" % (len(fallidas), ", ".join(fallidas))
            if avisos:
                resumen += "; avisos: " + "; ".join(avisos)
            f.write("warnings=%s\n" % (resumen if (fallidas or avisos) else "ninguno"))

    # Solo se considera fallo total si no salio NADA.
    if not hechas:
        raise SystemExit("El lote no produjo ninguna imagen.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", required=True, help="JSON de scripts/liturgical-week.js")
    ap.add_argument("--print-prompts", action="store_true")
    ap.add_argument("--from-files", nargs=2, metavar=("APAISADA", "VERTICAL"),
                    help="probar el post-proceso con archivos locales, sin API")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--quality", default=DEFAULT_QUALITY,
                    help="low | medium | high | auto")
    args = ap.parse_args()

    # --week acepta un objeto (un domingo) o un array (lote). Asi el guion no
    # necesita dos rutas de entrada distintas ni el workflow partir ficheros.
    with open(args.week, encoding="utf-8") as f:
        cargado = json.load(f)
    semanas = cargado if isinstance(cargado, list) else [cargado]

    if len(semanas) > 1:
        return run_batch(semanas, args)

    week = semanas[0]

    key = week["sunday_key"]
    print("Domingo   : %s  (%s)" % (key, week["week_id"]))
    print("Contexto  : %s" % week["liturgical_context"])
    cat = classify(week)
    ETIQUETA = {
        "saint":        "santo nombrado",
        "marian":       "la Virgen",
        "christ_scene": "escena cristologica canonica",
        "symbol":       "naturaleza muerta sacra (SIN figuras humanas)",
    }
    print("Categoria : %-13s -> %s" % (cat, ETIQUETA[cat]))
    if cat == "saint":
        print("Sujeto    : %s" % week["featured_subject"])
    else:
        print("Motivo    : %s - %s" % (week.get("gospel",""), week.get("gospel_theme","")))
    print("Color     : %s" % week["liturgical_color"])
    print()

    prompts = {"desktop": prompt_desktop(week), "mobile": prompt_mobile(week)}

    if args.print_prompts:
        for v, p in prompts.items():
            print("=" * 70)
            print(v.upper())
            print("=" * 70)
            print(p)
            print()
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    warnings = []

    for variant, gen_size in (("desktop", GEN_SIZE_LANDSCAPE),
                              ("mobile", GEN_SIZE_PORTRAIT)):
        out = os.path.join(OUT_DIR, "%s-%s.webp" % (key, variant))

        if args.from_files:
            src = args.from_files[0] if variant == "desktop" else args.from_files[1]
            print("%s <- %s (sin API)" % (variant, os.path.basename(src)))
            im = Image.open(src)
        else:
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise SystemExit("Falta OPENAI_API_KEY.")
            print("%s: generando %s ..." % (variant, gen_size))
            raw = generate(prompts[variant], gen_size, args.model, api_key, args.quality)
            tmp = os.path.join(OUT_DIR, ".raw-%s.png" % variant)
            with open(tmp, "wb") as f:
                f.write(raw)
            im = Image.open(tmp)
            print("  generada  %dx%d" % im.size)

        warnings += ["%s: %s" % (variant, w) for w in finish(im, variant, out)]

        tmp = os.path.join(OUT_DIR, ".raw-%s.png" % variant)
        if os.path.exists(tmp):
            os.remove(tmp)

    print()
    if warnings:
        print("REVISAR ANTES DE APROBAR:")
        for w in warnings:
            print("  - " + w)
    else:
        print("Sin avisos: ambas quedan oscuras donde va la interfaz.")

    # Para que el Action pueda ponerlo en el cuerpo del PR
    summary = os.environ.get("GITHUB_OUTPUT")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("warnings=%s\n" % ("; ".join(warnings) if warnings else "ninguno"))


if __name__ == "__main__":
    main()
