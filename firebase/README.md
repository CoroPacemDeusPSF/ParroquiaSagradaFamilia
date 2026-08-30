# firebase/

> **Las reglas que están en vigor NO viven en este repo.**
> Viven en Firebase Console → Realtime Database → Rules, proyecto `coropacemdeusdominical`.
> Lo que hay en esta carpeta son **instantáneas históricas**, y ninguna coincide con las vivas.

Estado a **v3.6.7r19** (30 de agosto de 2026):

| Archivo | Qué es | ¿Aplicable? |
|---|---|---|
| `database.rules.v3.6.7.json` | Plantilla del ruleset seguro (con `auth != null && auth.uid === ...`), pero con el marcador **`TU-UID-AQUI` sin sustituir en 8 sitios**. Además usa comentarios en forma de *keys* (`"// AHORA:": "..."`), que Firebase rechaza. | **No.** Hay que sustituir el UID y quitar las keys-comentario antes de siquiera pegarlo. |
| `database.rules.v3.6.6r7.json` | Instantánea de transición. | No. Histórico. |

El ruleset **abierto** que antes ocupaba el nombre canónico `database.rules.json` se movió a
`deprecated/database.rules.LEGACY-SIN-AUTH.json` precisamente para que nadie lo reaplique por
error: sus `.write` solo validan el formato del path y **no comprueban `auth.uid`**, así que
publicarlo deja la base escribible por cualquiera que conozca el formato de las rutas.

## Qué protegen las reglas vivas

Resumen de lo que está publicado en la Console (según el handoff, `CLAUDE.md` §9):

```
Default DENY:  .read=false, .write=false para cualquier path no listado

chord-overrides/$cpdId     read público,  write solo el UID de Renzo
lyrics-overrides/$cpdId    read público,  write solo el UID de Renzo
chord-history/$cpdId/$ts   read público,  write solo el UID de Renzo
lyrics-history/$cpdId/$ts  read público,  write solo el UID de Renzo
setlist/$dateKey           read público,  write solo el UID de Renzo
setlist-bodas/$dateKey     read público,  write solo el UID de Renzo
agent-feedback             sin lectura,   write create-only sin auth
liturgical-card-feedback   sin lectura,   write create-only sin auth
```

## Pendiente

Dejar en el repo un `database.rules.json` que sea **exactamente** el ruleset vivo, con el UID
real ya puesto y sin keys-comentario. No se ha hecho porque reconstruirlo desde la
documentación sin poder contrastarlo contra la Console arriesga publicar algo distinto de lo
que hoy protege la base. La forma correcta es **exportar el ruleset vivo desde Firebase
Console** y guardarlo aquí tal cual.
