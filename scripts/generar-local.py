# -*- coding: utf-8 -*-
"""
Generador local de fondos liturgicos, contra ComfyUI en esta misma maquina.

  @file     scripts/generar-local.py
  @version  v3.6.7r32

Sustituye a generate-backgrounds.py (OpenAI) para el trabajo del dia a dia:
aqui no se paga por imagen, asi que repetir un domingo hasta que quede bien
cuesta segundos en vez de dinero. El de OpenAI se conserva para el workflow
de GitHub, que no tiene GPU.

── QUE CAMBIA RESPECTO AL ANTERIOR ────────────────────────────────────────

1. El MOTIVO ya no lo elige el modelo. Viene escrito en img/liturgico/
   motivos.json, un objeto por domingo sacado de su pericopa. Antes el modelo
   decidia si un tema era "abstracto" y, cuando lo decidia, caia en el
   Evangelio abierto o la cruz de madera: en el primer lote de 16 domingos
   cada uno salio dos veces. Los difusores locales, ademas, ni siquiera
   podrian recordar la pericopa a partir de la cita.

2. La COMPOSICION se impone explicitamente. El fallo del primer lote no era
   solo el motivo repetido: los tres motores probados centraban el objeto, y
   el centro es justo donde va la tarjeta liturgica. Ahora se pide el sujeto
   a la derecha y las dos terceras partes izquierdas en sombra.

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

ESTILO = (
    "A sacred still life painted in the manner of a Baroque chiaroscuro oil "
    "painting: aged varnish, fine craquelure, muted earth palette of deep "
    "umber, olive black and old gold. Reverent, silent, cinematic."
)

# La composicion no es adorno: sobre estas ilustraciones se apoya la interfaz.
COMPOSICION = {
    "desktop": (
        "COMPOSITION, follow exactly: place the subject in the RIGHT THIRD of "
        "the frame. The left two thirds and the centre must stay almost black "
        "— empty shadow, no detail, nothing to read. A single warm light "
        "falls from the upper right and dies away before it reaches the "
        "middle. Wide cinematic framing, generous empty space."
    ),
    "mobile": (
        "COMPOSITION, follow exactly: a tall narrow vertical frame. Place the "
        "subject SMALL, in the UPPER portion, slightly right of centre. "
        "Everything below the upper third dissolves into pure black empty "
        "shadow with no detail at all. A single warm light from above."
    ),
}

PROHIBIDO = (
    "No people, no faces, no hands, no human figures of any kind. "
    "No lettering, no text, no writing, no numerals, no signature, no "
    "watermark: any script must be an illegible suggestion of ink at most."
)


def prompt(motivo, variante):
    return "%s\n\nSubject: %s.\n\n%s\n\n%s" % (
        ESTILO, motivo, COMPOSICION[variante], PROHIBIDO)


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


def acaba(im, variante, ruta):
    im = recorta(im, ENTREGA[variante])
    im.save(ruta, "WEBP", quality=WEBP_Q, method=6)

    # Luz en la zona de la interfaz: izquierda y centro
    caja = im.crop((0, int(im.height * .12), int(im.width * .62), int(im.height * .88)))
    caja = caja.resize((max(1, caja.width // 6), max(1, caja.height // 6)), Image.BILINEAR)
    vals = sorted(luma(p) for p in caja.getdata())
    return {
        "kb": round(os.path.getsize(ruta) / 1024),
        "mediana": round(vals[len(vals) // 2]),
        "p90": round(vals[int(len(vals) * .90)]),
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
            im = trae(encola(grafo(m, prompt(motivos[clave]["motivo"], variante),
                                   w, h, semilla)))
            info = acaba(im, variante, ruta)
            seg = time.time() - t0
            estado["hechas"] += 1
            estado["hechas_lista"].append(
                {"clave": clave, "variante": variante, "seg": round(seg, 1), **info})
            print("%3d/%-3d  %s %-8s %5.1fs  %4d KB  luz %3d/%3d" % (
                i, len(tareas), clave, variante, seg, info["kb"],
                info["mediana"], info["p90"]), flush=True)
        except Exception as e:
            estado["fallos"].append({"clave": clave, "variante": variante,
                                     "error": str(e)[:200]})
            print("%3d/%-3d  %s %-8s FALLO: %s" % (
                i, len(tareas), clave, variante, str(e)[:120]), flush=True)

        hechas = estado["hechas"] + len(estado["fallos"])
        if hechas:
            spi = (time.time() - t_ini) / hechas
            estado["seg_por_imagen"] = round(spi, 1)
            estado["faltan_min"] = round(spi * (len(tareas) - hechas) / 60, 1)
        escribe_progreso(estado)

    estado["en_curso"] = None
    estado["terminado"] = True
    estado["duracion_min"] = round((time.time() - t_ini) / 60, 1)
    escribe_progreso(estado)
    print("\nterminado: %d hechas, %d fallos, %.1f min" % (
        estado["hechas"], len(estado["fallos"]), estado["duracion_min"]))


if __name__ == "__main__":
    main()
