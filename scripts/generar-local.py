# -*- coding: utf-8 -*-
"""
Generador local de fondos liturgicos, contra ComfyUI en esta misma maquina.

  @file     scripts/generar-local.py
  @version  v3.6.7r37

Sustituye a generate-backgrounds.py (OpenAI) para el trabajo del dia a dia:
aqui no se paga por imagen, asi que repetir un domingo hasta que quede bien
cuesta segundos en vez de dinero. El de OpenAI se conserva para el workflow
de GitHub, que no tiene GPU.

── DE DONDE SALE CADA IMAGEN ──────────────────────────────────────────────

1. La ESCENA viene escrita en img/liturgico/motivos.json, una por domingo,
   sacada del Evangelio COMPLETO: lugar, hora, luz, figuras y accion.

   La version anterior daba solo un objeto suelto y funcionaba a medias.
   Donde la linea nombraba un lugar salia un lugar; donde solo nombraba un
   objeto, el modelo rellenaba con su comodin —mesa de madera, cuarto oscuro,
   haz de luz— una y otra vez. El fallo era darle una frase y dejarle inventar
   el 80% restante.

2. HAY FIGURAS. Antes se prohibian las personas y los Evangelios narrativos
   quedaban cojos. Se pintan al oleo barroco y no en fotorrealismo: un rostro
   pintado no cae en el valle inquietante.

3. La COMPOSICION se impone aparte de la escena, porque encima va la interfaz.

── ORDEN DE TRABAJO ───────────────────────────────────────────────────────

Primero TODAS las apaisadas y despues las verticales. Si el lote se corta a
la mitad, todos los domingos tienen al menos su apaisada —que es la que se ve
en PC y la que va al PDF— y el modulo 36 ya sabe caer a la apaisada cuando
falta la vertical. Cortarse por la mitad deja un estado usable, no un hueco.
"""
import json, os, sys, time, urllib.parse, urllib.request, uuid
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_IMG = os.path.join(RAIZ, "img", "liturgico")
MOTIVOS = os.path.join(DIR_IMG, "motivos.json")
PROGRESO = os.path.join(DIR_IMG, "progreso.json")

API = "http://127.0.0.1:8188"

# Tamanos de generacion. Multiplos de 16, que es lo que pide el latente.
GEN = {
    "desktop": (1536, 864),     # 16:9 exacto
    "mobile":  (1024, 2272),    # ~9:20; se ajusta al recortar
}
ENTREGA = {
    "desktop": (1536, 864),
    "mobile":  (1024, 2276),    # 9:20 exacto
}
WEBP_Q = 82

# ── Motores ───────────────────────────────────────────────────────────────
# 'dev' da la mejor estetica y tarda alrededor de un minuto; 'klein' cabe
# entero en los 16 GB de VRAM y tarda seis segundos. Se elige por linea de
# ordenes para poder explorar con klein y rematar con dev.
MOTORES = {
    "dev": {
        "unet": "flux2_dev_fp8mixed.safetensors",
        "clip": "mistral_3_small_flux2_fp4_mixed.safetensors",
        "vae":  "flux2-vae.safetensors",
        "lora": "Flux2TurboComfyv2.safetensors",
        "pasos": 8,
        "guia": 4.0,
    },
    "klein": {
        "unet": "flux-2-klein-4b.safetensors",
        "clip": "qwen_3_4b.safetensors",
        "vae":  "flux2-vae.safetensors",
        "lora": None,
        "pasos": 4,
        "guia": None,       # destilado: la guia va dentro del modelo
    },
}

# ── Prompt ────────────────────────────────────────────────────────────────

# v3.6.7r35: pintura barroca CON FIGURAS. Se pide oleo y no fotorrealismo por
# una razon practica ademas de estetica: un rostro pintado no cae en el valle
# inquietante, que es donde fallan las caras generadas. Y es la tradicion en
# que esta escrito el arte sacro desde hace cuatro siglos.
ESTILO = (
    "A sacred narrative painting in the manner of Caravaggio and Rembrandt: "
    "tenebrism, a single dominant light source, deep transparent shadow, "
    "aged varnish and fine craquelure, muted earth palette of deep umber, "
    "olive black, oxblood and old gold. Faces and hands painted with the "
    "gravity of a seventeenth century master. Reverent, human, cinematic."
)

# La composicion no es adorno: sobre estas ilustraciones se apoya la interfaz.
# Con figuras hay que reservar sitio igual, pero sin partir la escena por la
# mitad: la accion se lleva a la derecha y la izquierda queda como penumbra
# habitada —arquitectura, paisaje, oscuridad— no como un vacio recortado.
COMPOSICION = {
    "desktop": (
        "COMPOSITION, follow exactly: this is a WIDE frame and the LEFT THIRD "
        "OF IT MUST BE EMPTY. Place NO figure, no face and no lit object in "
        "the left third: it holds only unbroken darkness, a plain shadowed "
        "wall, or empty distance. Crowd every person and every incident into "
        "the RIGHT HALF, grouped tightly. The single light source is high on "
        "the right and falls off steeply, so the left edge of the canvas is "
        "almost black. Think of a painting hung so its left side is in the "
        "shadow of a doorway."
    ),
    "mobile": (
        "COMPOSITION, follow exactly: a tall narrow vertical frame. Stage the "
        "figures and the action in the UPPER THIRD. Everything below the "
        "midpoint sinks into deep empty shadow — floor, ground or darkness "
        "with no detail and no faces. The dominant light comes from above."
    ),
}

# ── QUIEN ES QUIEN (v3.6.7r36) ────────────────────────────────────────────
#
# En la primera prueba con figuras, Pilato salio identico a Cristo: pelo largo,
# barba y tunica clara, sentado en su silla. La causa no fue el modelo sino la
# escena que yo escribi: a Jesus le di sus rasgos (corona de espinas, manto
# purpura) y a Pilato NINGUNO. El varon biblico por defecto de cualquier
# generador es un hombre de pelo largo y barba con tunica, o sea su idea de
# Cristo. Sin rasgos propios, todo hombre de la escena tiende a el.
#
# Confundir a Cristo con Pilato en la portada de una parroquia no es un fallo
# estetico, asi que esto no se deja al azar de cada descripcion: va en TODOS
# los prompts y prohibe explicitamente el parecido.
FIGURAS = (
    "FIGURES, follow exactly. If Christ appears, he is the ONLY figure with "
    "long dark hair parted at the centre and a short dark beard, wearing a "
    "seamless deep crimson tunic beneath a dark blue mantle, and he is always "
    "the compositional and luminous centre. NO other figure may combine long "
    "hair, a beard and robes of those colours — every other man must be "
    "clearly distinguishable at a glance.\n"
    "Romans (Pilate, soldiers, centurions) are clean-shaven with short "
    "cropped hair, in armour or a white toga with a coloured border — never "
    "bearded, never in a plain robe.\n"
    "Pharisees, scribes and priests wear fringed prayer shawls and head "
    "coverings, with long grey beards.\n"
    "Peter is older and thickset, with short grey curly hair and a grey "
    "beard; John is young and beardless. John the Baptist is gaunt and "
    "weathered, in rough camel hair with a wide leather belt, hair matted "
    "and wild — never in a woven robe. Labourers and the poor wear coarse "
    "undyed wool, bare-legged, never crimson or blue."
)

# El texto sigue prohibido: en las pruebas se colaron marcas tipo escritura, y
# un renglon inventado en un cancionero peruano canta a IA de inmediato.
PROHIBIDO = (
    "No lettering, no text, no writing, no numerals, no signature, no "
    "watermark anywhere in the image: any script must be an illegible "
    "suggestion of ink at most. No modern clothing or modern objects, no "
    "anachronisms. Absolutely NO halo, NO nimbus, NO golden disc or ring of "
    "light behind any head: the holy are set apart by light and bearing "
    "alone. (Angels, where the scene names them, do have wings; no one else "
    "does.) Include only the people the scene names — no extra soldiers or "
    "bystanders invented to fill the frame."
)


def prompt(escena, variante):
    return "%s\n\nScene: %s\n\n%s\n\n%s\n\n%s" % (
        ESTILO, escena, FIGURAS, COMPOSICION[variante], PROHIBIDO)


# ── Grafo de ComfyUI ──────────────────────────────────────────────────────

def grafo(m, texto, w, h, semilla):
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {
                "unet_name": m["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {
                "clip_name": m["clip"], "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": m["vae"]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": texto}},
        "7": {"class_type": "Flux2Scheduler", "inputs": {
                "steps": m["pasos"], "width": w, "height": h}},
        "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": semilla}},
        "10": {"class_type": "EmptyFlux2LatentImage", "inputs": {
                 "width": w, "height": h, "batch_size": 1}},
        "11": {"class_type": "SamplerCustomAdvanced", "inputs": {
                 "noise": ["9", 0], "guider": ["6", 0], "sampler": ["8", 0],
                 "sigmas": ["7", 0], "latent_image": ["10", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {
                 "images": ["12", 0], "filename_prefix": "pd"}},
    }
    modelo = ["1", 0]
    if m["lora"]:
        g["1b"] = {"class_type": "LoraLoaderModelOnly", "inputs": {
                     "model": ["1", 0], "lora_name": m["lora"], "strength_model": 1.0}}
        modelo = ["1b", 0]

    if m["guia"] is not None:           # dev: guia explicita + BasicGuider
        g["5"] = {"class_type": "FluxGuidance", "inputs": {
                    "conditioning": ["4", 0], "guidance": m["guia"]}}
        g["6"] = {"class_type": "BasicGuider", "inputs": {
                    "model": modelo, "conditioning": ["5", 0]}}
    else:                                # klein destilado: cfg 1, negativo a cero
        g["5"] = {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}}
        g["6"] = {"class_type": "CFGGuider", "inputs": {
                    "model": modelo, "positive": ["4", 0],
                    "negative": ["5", 0], "cfg": 1.0}}
    return g


def encola(g):
    cuerpo = json.dumps({"prompt": g, "client_id": str(uuid.uuid4())}).encode()
    req = urllib.request.Request(API + "/prompt", data=cuerpo,
                                 headers={"Content-Type": "application/json"})
    try:
        pid = json.load(urllib.request.urlopen(req, timeout=300))["prompt_id"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode()[:400])

    t0 = time.time()
    while True:
        h = json.load(urllib.request.urlopen(API + "/history/" + pid, timeout=60))
        if pid in h:
            est = h[pid].get("status", {})
            if est.get("status_str") == "error":
                raise RuntimeError(json.dumps(est, ensure_ascii=False)[:400])
            return h[pid]["outputs"]["13"]["images"][0]
        if time.time() - t0 > 1200:
            raise RuntimeError("tiempo agotado")
        time.sleep(1.5)


def trae(info):
    q = "/view?filename=%s&subfolder=%s&type=%s" % (
        urllib.parse.quote(info["filename"]),
        urllib.parse.quote(info.get("subfolder", "")), info["type"])
    import io
    with urllib.request.urlopen(API + q, timeout=300) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


# ── Acabado ───────────────────────────────────────────────────────────────

def luma(p):
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]


def recorta(im, destino):
    """A la proporcion exacta de entrega, sin deformar."""
    dw, dh = destino
    r_dest, r_orig = dw / float(dh), im.width / float(im.height)
    if r_orig > r_dest:
        nw = int(round(im.height * r_dest))
        im = im.crop(((im.width - nw) // 2, 0, (im.width - nw) // 2 + nw, im.height))
    elif r_orig < r_dest:
        nh = int(round(im.width / r_dest))
        im = im.crop((0, 0, im.width, nh))      # se conserva la parte alta
    return im.resize((dw, dh), Image.LANCZOS)


# Zona sobre la que se apoya la interfaz, en fraccion del lienzo.
ZONA_UI = {
    "desktop": (0.00, 0.12, 0.40, 0.88),   # tercio izquierdo: la tarjeta
    "mobile":  (0.00, 0.30, 1.00, 1.00),   # mitad inferior
}
P90_OBJETIVO = 55       # medido: los bodegones daban ~35 y se leian de sobra
VELO_MAX = 0.80


def mide(im, variante):
    x0, y0, x1, y1 = ZONA_UI[variante]
    c = im.crop((int(im.width * x0), int(im.height * y0),
                 int(im.width * x1), int(im.height * y1)))
    c = c.resize((max(1, c.width // 6), max(1, c.height // 6)), Image.BILINEAR)
    v = sorted(luma(p) for p in c.getdata())
    return v[len(v) // 2], v[int(len(v) * .90)]


def apaga_zona_ui(im, variante):
    """Oscurece con un degradado la zona donde se apoya la interfaz.

    Se pide en el prompt que esa zona quede vacia y oscura, y la mayoria de las
    veces se obedece: en las pruebas el percentil 90 bajo de 97 a 13 y de 49 a
    19 solo con reforzar la instruccion. Pero no SIEMPRE: la misma instruccion
    dejo el pretorio de Pilato en 111, porque una escena con guardias y
    antorchas llena el cuadro por naturaleza.

    Depender de que el modelo obedezca 73 veces seguidas no es un plan. Aqui se
    mide lo que salio y se aplica solo el velo que falte, igual que hace la
    portada del PDF. Una imagen que ya cumple no se toca.
    """
    _, p90 = mide(im, variante)
    if p90 <= P90_OBJETIVO:
        return im, 0.0

    # El degradado tiene MESETA sobre toda la zona de la interfaz y solo
    # despues se apaga. El primer intento decaia desde el borde mismo, asi
    # que en el lado interior de la zona medida apenas oscurecia: el pretorio
    # se quedo en 96 pese a un velo nominal de 0,50.
    #
    # Y el alfa no se calcula de una vez: la relacion entre alfa y el
    # percentil resultante no es lineal, asi que se aplica, se vuelve a medir
    # y se sube si hace falta. Tres pasadas bastan siempre.
    negro = Image.new("RGB", im.size, (6, 8, 5))
    alfa = min(VELO_MAX, 1.0 - (P90_OBJETIVO / p90))

    for _ in range(3):
        # La rampa se construye en una tira de un pixel y se estira: hacerlo
        # pixel a pixel en Python sobre 1,3 Mpx cuesta segundos por imagen.
        if variante == "desktop":
            tira = Image.new("L", (im.width, 1))
            px = tira.load()
            meseta, fin = int(im.width * .38), int(im.width * .54)
            for x in range(im.width):
                if x <= meseta:
                    k = 1.0
                elif x >= fin:
                    k = 0.0
                else:
                    k = 1.0 - (x - meseta) / float(fin - meseta)
                px[x, 0] = int(255 * alfa * k ** 1.3)
        else:
            tira = Image.new("L", (1, im.height))
            px = tira.load()
            ini, meseta = int(im.height * .30), int(im.height * .50)
            for y in range(im.height):
                if y <= ini:
                    k = 0.0
                elif y >= meseta:
                    k = 1.0
                else:
                    k = (y - ini) / float(meseta - ini)
                px[0, y] = int(255 * alfa * k ** 0.9)

        prueba = Image.composite(negro, im, tira.resize(im.size))
        _, p90 = mide(prueba, variante)
        if p90 <= P90_OBJETIVO or alfa >= VELO_MAX:
            return prueba, alfa
        alfa = min(VELO_MAX, alfa + (1.0 - alfa) * 0.5)

    return prueba, alfa


def acaba(im, variante, ruta):
    im = recorta(im, ENTREGA[variante])
    im, alfa = apaga_zona_ui(im, variante)
    im.save(ruta, "WEBP", quality=WEBP_Q, method=6)

    mediana, p90 = mide(im, variante)
    return {
        "kb": round(os.path.getsize(ruta) / 1024),
        "mediana": round(mediana),
        "p90": round(p90),
        "velo": round(alfa, 2),
    }


# ── Progreso ──────────────────────────────────────────────────────────────

def escribe_progreso(estado):
    tmp = PROGRESO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    os.replace(tmp, PROGRESO)     # atomico: el navegador nunca lee a medias


# ── Principal ─────────────────────────────────────────────────────────────

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--motor", default="dev", choices=list(MOTORES))
    ap.add_argument("--desde", default=None)
    ap.add_argument("--hasta", default=None)
    ap.add_argument("--solo", nargs="*", help="claves sueltas AAAA-MM-DD")
    ap.add_argument("--variantes", nargs="*", default=["desktop", "mobile"])
    ap.add_argument("--rehacer", action="store_true", help="regenerar aunque exista")
    args = ap.parse_args()

    m = MOTORES[args.motor]
    with open(MOTIVOS, encoding="utf-8") as f:
        motivos = json.load(f)
    claves = sorted(k for k in motivos if not k.startswith("_"))
    if args.solo:
        claves = [k for k in claves if k in args.solo]
    if args.desde:
        claves = [k for k in claves if k >= args.desde]
    if args.hasta:
        claves = [k for k in claves if k <= args.hasta]

    # Apaisadas primero, todas, y despues las verticales
    tareas = [(v, k) for v in args.variantes for k in claves]
    if not args.rehacer:
        tareas = [(v, k) for v, k in tareas
                  if not os.path.exists(os.path.join(DIR_IMG, "%s-%s.webp" % (k, v)))]

    estado = {
        "motor": args.motor, "total": len(tareas), "hechas": 0,
        "empezado": time.strftime("%H:%M:%S"), "en_curso": None,
        "seg_por_imagen": None, "faltan_min": None, "terminado": False,
        "hechas_lista": [], "fallos": [],
    }
    escribe_progreso(estado)
    print("motor %s   %d imagenes\n" % (args.motor, len(tareas)), flush=True)

    t_ini = time.time()
    for i, (variante, clave) in enumerate(tareas, 1):
        estado["en_curso"] = {"clave": clave, "variante": variante, "n": i}
        escribe_progreso(estado)

        w, h = GEN[variante]
        # Semilla derivada de la fecha: repetir el lote da el mismo resultado,
        # y cambiar solo un domingo no altera a los demas.
        semilla = int(clave.replace("-", "")) * 10 + (0 if variante == "desktop" else 1)
        ruta = os.path.join(DIR_IMG, "%s-%s.webp" % (clave, variante))

        t0 = time.time()
        try:
            im = trae(encola(grafo(m, prompt(motivos[clave]["escena"], variante),
                                   w, h, semilla)))
            info = acaba(im, variante, ruta)
            seg = time.time() - t0
            estado["hechas"] += 1
            estado["hechas_lista"].append(
                {"clave": clave, "variante": variante, "seg": round(seg, 1), **info})
            print("%3d/%-3d  %s %-8s %5.1fs  %4d KB  luz %3d/%3d  velo %.2f" % (
                i, len(tareas), clave, variante, seg, info["kb"],
                info["mediana"], info["p90"], info["velo"]), flush=True)
        except Exception as e:
            estado["fallos"].append({"clave": clave, "variante": variante,
                                     "error": str(e)[:200]})
            print("%3d/%-3d  %s %-8s FALLO: %s" % (
                i, len(tareas), clave, variante, str(e)[:120]), flush=True)

        # La estimacion se hace POR VARIANTE y no con la media global: una
        # vertical tiene 2,3 Mpx contra 1,3 de una apaisada y tarda un tercio
        # mas. Promediarlas juntas daba un tiempo restante demasiado optimista
        # justo cuando quedan solo verticales.
        hechas = estado["hechas"] + len(estado["fallos"])
        if hechas:
            estado["seg_por_imagen"] = round((time.time() - t_ini) / hechas, 1)
            medias, faltan_seg = {}, 0.0
            for v in args.variantes:
                t = [x["seg"] for x in estado["hechas_lista"] if x["variante"] == v]
                medias[v] = round(sum(t) / len(t), 1) if t else None
            # Para una variante que aun no ha empezado se usa la que si tiene
            # datos: es mejor estimacion que ninguna.
            respaldo = next((m for m in medias.values() if m), 0)
            pendientes = tareas[i:]
            for v, _ in pendientes:
                faltan_seg += medias.get(v) or respaldo
            estado["seg_por_variante"] = medias
            estado["faltan_min"] = round(faltan_seg / 60, 1)
        escribe_progreso(estado)

    estado["en_curso"] = None
    estado["terminado"] = True
    estado["duracion_min"] = round((time.time() - t_ini) / 60, 1)
    escribe_progreso(estado)
    print("\nterminado: %d hechas, %d fallos, %.1f min" % (
        estado["hechas"], len(estado["fallos"]), estado["duracion_min"]))


if __name__ == "__main__":
    main()
