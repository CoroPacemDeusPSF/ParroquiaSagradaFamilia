# deprecated/

Código que **ya no se carga ni se ejecuta**. Se conserva aquí, fuera de las carpetas
vivas, para que nadie lo reactive por error creyéndolo vigente. Git guarda el historial
completo: se pueden borrar en cualquier momento sin perder nada.

Movido aquí en **v3.6.7r19** (30 de agosto de 2026).

| Archivo | Venía de | Por qué está muerto |
|---|---|---|
| `34-dev-pin.js` | `js/modules/` | Viejo Modo PIN (PIN de 6 dígitos con SHA-256 contra Firebase `/dev-pin/hash`). Lo reemplazó el módulo 35, Google Sign-In, en v3.6.7. Nunca estuvo enlazado en `dominical.html`. Define helpers de consola (`__setDevPin`, `__clearDevPin`, `__lockDev`, `__devPinStatus`) que **no existen** en el sitio actual. |
| `dev-pin.css` | `css/components/` | Estilos del anterior. Nunca importado en `dominical.bundle.css`. |
| `regen-ai-catalog.js` | `scripts/` | Regeneraba la constante `AI_CATALOG` del módulo 19 desde `songs.json`. En v3.6.7r18 el catálogo pasó a construirse **en runtime** desde `window.PACEM_SONGS_DATA`, así que esa constante ya no existe y el script no tiene nada que regenerar. Su lógica de extracción (compositor, versículo, tags) vive ahora dentro del propio módulo 19. |
| `database.rules.LEGACY-SIN-AUTH.json` | `firebase/database.rules.json` | **Ruleset antiguo y abierto.** Sus `.write` validan únicamente el *formato* del path (`$cpdId.matches(...)`) — **cero `auth.uid`**. Ocupaba el nombre canónico `database.rules.json`, así que cualquiera podía reaplicarlo creyéndolo vigente y dejar la base escribible por quien conociera el formato. Ver `firebase/README.md`. |

## Riesgo de reactivar cualquiera de estos

- Reactivar el módulo 34 mete una **segunda barrera de autenticación redundante** en paralelo
  al Google Sign-In del módulo 35, con dos fuentes de verdad sobre quién es administrador.
- Reaplicar `database.rules.LEGACY-SIN-AUTH.json` **abre la base de datos a escritura anónima**.
