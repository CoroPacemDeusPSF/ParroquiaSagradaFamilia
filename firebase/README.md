# firebase/

> Las reglas en vigor se publican en Firebase Console → Realtime Database → Rules,
> proyecto `coropacemdeusdominical`. Desde el **1 de noviembre de 2026** el archivo
> `database.rules.v3.6.10.json` de esta carpeta es **exactamente** lo publicado.

Estado a **v3.6.10** (1 de noviembre de 2026):

| Archivo | Qué es | ¿Aplicable? |
|---|---|---|
| `database.rules.v3.6.10.json` | **Reglas vivas desde el 1-nov-2026** (texto publicado idéntico al archivo, comprobado en la consola). Las v3.6.8r1 sin un solo cambio, más el nodo `/monitor` de la página Sistema (módulo 39): lectura solo para Renzo, escritura solo-crear con forma validada, hora del servidor, tope de 200 eventos por sesión y rastro de administradores autenticado. | **Sí.** Es lo publicado. |
| `database.rules.v3.6.8r1.json` | Reglas anteriores (5-sep-2026). Nodo `/admins`, `setlist-bodas` e historiales solo para administradores; su encabezado explica cómo sumar administradores. Ojo: su cabecera larga contiene un cierre de comentario de bloque (línea 48); lo que se publicó entonces llevaba una cabecera corta. | No. Histórico. |
| `database.rules.v3.6.6r7.json` | Instantánea de transición, anterior a Firebase Auth. | No. Histórico. |

El snapshot `database.rules.v3.6.7.json` se eliminó en v3.6.8r7: nunca se aplicó, tenía el
marcador `TU-UID-AQUI` sin sustituir y comentarios en forma de *keys* que Firebase rechaza.
Sigue en el historial de git si hiciera falta consultarlo.

El ruleset **abierto** que antes ocupaba el nombre canónico `database.rules.json` está en
`deprecated/database.rules.LEGACY-SIN-AUTH.json` para que nadie lo reaplique por error: sus
`.write` no comprueban `auth`, así que publicarlo deja la base escribible por cualquiera.

## Qué protegen las reglas vivas (v3.6.8r1)

```
Default DENY:  .read=false, .write=false para cualquier path no listado
ADMIN := auth != null && root.child('admins').child(auth.uid).val() === true

admins/$uid                read solo la propia entrada, write=false (solo desde la Console)
chord-overrides/$cpdId     read público,  write ADMIN
lyrics-overrides/$cpdId    read público,  write ADMIN
chord-history/$cpdId/$ts   read ADMIN,    write ADMIN
lyrics-history/$cpdId/$ts  read ADMIN,    write ADMIN
setlist/$dateKey           read público,  write ADMIN   (los coristas no tienen cuenta)
setlist-bodas/$dateKey     read ADMIN,    write ADMIN   (sufijo opcional -N en la fecha)
agent-feedback             sin lectura,   write create-only sin auth
liturgical-card-feedback   sin lectura,   write create-only sin auth
```

Lo que añade v3.6.10:

```
monitor                          read solo el UID de Renzo
monitor/v/$dia/$sid/h            create-only, sin auth; t === now; campos y largos validados
monitor/v/$dia/$sid/e/$n         create-only, sin auth; n de 0 a 199; exige la cabecera h
monitor/a/$dia/$uid/$sid/...     igual, pero auth.uid === $uid y /admins/$uid === true
```

Los días viejos de `/monitor` no se borran solos: se borran a mano desde la Console
(que no pasa por las reglas) si algún día hiciera falta espacio.

Para cambiar las reglas: editar un archivo nuevo `database.rules.vX.Y.ZrN.json`, publicarlo
desde la Console y, recién verificado, dejarlo aquí como el vigente. Orden innegociable:
código primero, verificación en producción, reglas al final.
