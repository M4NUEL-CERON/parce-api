# Parce API 🇨🇴

API pública y gratis de dichos y platos típicos colombianos (y pronto comidas del mundo).

Las fotos de los platos son de Wikimedia Commons; cada plato trae su autor y licencia en `imagen`.

## Endpoints

| Ruta | Qué devuelve |
|---|---|
| `GET /api` | Lista de recursos disponibles |
| `GET /api/dichos` | Todos los dichos. `?q=texto` busca (sin importar tildes) |
| `GET /api/dichos/hoy` | El dicho del día (cambia a medianoche, hora Colombia) |
| `GET /api/dichos/random` | Un dicho al azar |
| `GET /api/dichos/:id` | Un dicho por id |
| `GET /api/platos` | Platos típicos con foto, ingredientes y preparación (también `/hoy`, `/random`, `/:id` y `?q=`) |
| `GET /api/<recurso>?<campo>=valor` | Filtra por cualquier campo, sin importar tildes. Ej. `/api/platos?region=tolima`. Se combina con `?q=` |

```js
const dicho = await (await fetch('https://<tu-dominio>/api/dichos/hoy')).json();
```

## Agregar contenido

- **Un dicho nuevo:** agrégalo a `data/dichos.json` con un `id` único en minúsculas y con guiones.
- **Un recurso nuevo** (ej. platos): crea `data/platos.json` con objetos que tengan `id`. Queda disponible solo en `/api/platos`.

Corre `npm test` antes de hacer commit.
