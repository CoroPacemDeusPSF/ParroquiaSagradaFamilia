# -*- coding: utf-8 -*-
"""
Genera una pagina de enlace por canto, para que al compartirlo la vista previa
diga de que canto se trata.

  @file     scripts/generar-enlaces-cantos.py
  @version  v3.6.9r1

  v3.6.9r1: cada canto tiene ademas su propia imagen de vista previa
  (c/img/cpd-XXX.jpg) con el titulo al estilo de su ficha, en lugar de la
  imagen generica del cancionero. Ver scripts/imagen_canto.py.

── POR QUE HACE FALTA ─────────────────────────────────────────────────────

El boton de compartir de cada canto copiaba dominical.html#d57. Eso nunca
podia mostrar el canto en la vista previa de WhatsApp, Telegram o Facebook:

  - lo que va despues de # no llega al servidor, asi que para el robot que
    arma la vista previa todos los enlaces de cantos son la misma pagina;
  - ese robot no ejecuta JavaScript: solo lee las etiquetas <meta> fijas del
    HTML, y las de dominical.html hablan del cancionero entero.

GitHub Pages no tiene servidor que pueda cambiar esas etiquetas segun el
canto. Lo que si puede es servir un archivo distinto por canto. Por eso cada
canto tiene su pagina c/cpd-XXX.html con sus propias og:title y
og:description; el robot lee eso, y la persona que abre el enlace es enviada
al canto dentro del cancionero.

El envio se hace con JavaScript y NO con <meta http-equiv="refresh">: algunos
robots (Facebook) siguen el refresh y terminarian leyendo las etiquetas
genericas de dominical.html, que es justo lo que se quiere evitar.

── QUIEN LO CORRE ─────────────────────────────────────────────────────────

Nadie a mano. El workflow .github/workflows/enlaces-cantos.yml lo ejecuta en
GitHub cada vez que llega a main un cambio en data/songs.json (o en este
guion), y si las paginas cambian las sube el mismo. Asi un canto nuevo tiene
su vista previa aunque nadie se acuerde de este archivo.

Correrlo en local solo hace falta para probar:

    python scripts/generar-enlaces-cantos.py

Reescribe todas las paginas (es idempotente) y avisa de las que sobran si un
canto dejara de existir; no borra nada por su cuenta.

Si alguien comparte un canto cuya pagina aun no existe (el minuto que tarda
el workflow, o si fallara), 404.html lo detecta y lleva igual al canto: el
enlace nunca se rompe, solo la vista previa saldria generica.
"""
import html
import io
import json
import hashlib
import os
import re

import imagen_canto  # scripts/imagen_canto.py — la imagen de vista previa (v3.6.9r1)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(RAIZ, "data", "songs.json")
SALIDA = os.path.join(RAIZ, "c")
SALIDA_IMG = os.path.join(SALIDA, "img")

SITIO = "https://coropacemdeuspsf.github.io/ParroquiaSagradaFamilia"
LARGO_MAX = 150  # las vistas previas cortan la descripcion hacia aqui

# Subir este numero si cambia el diseno de la imagen: entra en el ?v= de
# og:image, y una URL nueva obliga a WhatsApp y compania a bajarla otra vez.
DISENO_IMAGEN = "1"


def texto_plano(fragmento):
    sin_tags = re.sub(r"<[^>]+>", " ", fragmento)
    return " ".join(html.unescape(sin_tags).split())


def primeras_lineas(body_html, cuantas=2):
    """Primeros versos de la letra (los <p> de la primera estrofa o coro)."""
    lineas = [texto_plano(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", body_html, re.S)]
    lineas = [l for l in lineas if l]
    return lineas[:cuantas]


def momento_legible(moment):
    return moment.replace("✦", "").strip()


def descripcion(canto):
    momento = momento_legible(canto["moment"])
    versos = primeras_lineas(canto.get("body_html", ""))
    cierre = "Cancionero del Coro Pacem Deus"
    if not versos:
        return "%s · %s" % (momento, cierre)
    # Sin la coma o el punto y coma con que suele terminar un verso: dentro
    # de las comillas queda como una frase cortada a medias.
    cita = " / ".join(versos).rstrip(" ,;:")
    fijo = len(momento) + len(cierre) + 10
    if len(cita) + fijo > LARGO_MAX:
        cita = cita[:max(20, LARGO_MAX - fijo)].rstrip(" ,;:/") + "…"
    return "%s · «%s» · %s" % (momento, cita, cierre)


PLANTILLA = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<!-- Generado por scripts/generar-enlaces-cantos.py a partir de data/songs.json.
     No editar a mano: se sobrescribe. -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo} — Coro Pacem Deus</title>
<meta name="description" content="{desc}">
<meta name="robots" content="noindex">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="Coro Pacem Deus">
<meta property="og:locale" content="es_PE">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{imagen}">
<meta property="og:image:secure_url" content="{imagen}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Coro Pacem Deus — {titulo}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{titulo}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{imagen}">
<link rel="canonical" href="{url}">
<script>location.replace({destino_js});</script>
<style>
  html, body {{ margin: 0; height: 100%; background: #0E1A0C; color: #CFE4BC;
    font-family: Georgia, 'Times New Roman', serif; }}
  main {{ min-height: 100%; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; padding: 0 1.5rem; }}
  p {{ margin: .4rem 0; }}
  a {{ color: #86BC63; }}
</style>
</head>
<body>
<main>
  <p>{momento}</p>
  <p><strong>{titulo}</strong></p>
  <p><a href="{destino}">Abrir el canto en el cancionero</a></p>
</main>
</body>
</html>
"""


def escribir_imagen(canto):
    """Escribe c/img/cpd-XXX.jpg y devuelve su URL publica con ?v=.

    Solo reescribe el archivo si los bytes cambian: Pillow genera el mismo
    JPEG para el mismo titulo y momento, asi que un canto que no cambio no
    produce diferencias en git.
    """
    momento = momento_legible(canto["moment"])
    datos = imagen_canto.imagen(canto["title"], momento)
    ruta = os.path.join(SALIDA_IMG, canto["cpd"] + ".jpg")
    previo = None
    if os.path.exists(ruta):
        with open(ruta, "rb") as f:
            previo = f.read()
    if previo != datos:
        with open(ruta, "wb") as f:
            f.write(datos)
    firma = hashlib.sha1(("%s|%s|%s" % (DISENO_IMAGEN, canto["title"], momento))
                         .encode("utf-8")).hexdigest()[:8]
    return "%s/c/img/%s.jpg?v=%s" % (SITIO, canto["cpd"], firma)


def pagina(canto, url_imagen):
    cpd, did = canto["cpd"], canto["did"]
    titulo = html.escape(canto["title"], quote=True)
    destino = "../cancioneros/dominical.html#" + did
    return PLANTILLA.format(
        titulo=titulo,
        desc=html.escape(descripcion(canto), quote=True),
        url="%s/c/%s.html" % (SITIO, cpd),
        imagen=html.escape(url_imagen, quote=True),
        destino=html.escape(destino, quote=True),
        destino_js=json.dumps(destino),
        momento=html.escape(momento_legible(canto["moment"]), quote=True),
    )


def main():
    with io.open(SONGS, encoding="utf-8") as f:
        cantos = json.load(f)
    os.makedirs(SALIDA_IMG, exist_ok=True)

    esperados = set()
    for canto in cantos:
        nombre = canto["cpd"] + ".html"
        esperados.add(nombre)
        url_imagen = escribir_imagen(canto)
        with io.open(os.path.join(SALIDA, nombre), "w", encoding="utf-8", newline="\n") as f:
            f.write(pagina(canto, url_imagen))

    sobran = sorted(n for n in os.listdir(SALIDA) if n.endswith(".html") and n not in esperados)
    sobran += sorted("img/" + n for n in os.listdir(SALIDA_IMG)
                     if n.endswith(".jpg") and n[:-4] + ".html" not in esperados)
    print("%d paginas e imagenes escritas en c/" % len(esperados))
    if sobran:
        print("Sobran %d (cantos que ya no existen; borrarlas a mano si corresponde):" % len(sobran))
        for n in sobran:
            print("   c/" + n)


if __name__ == "__main__":
    main()
