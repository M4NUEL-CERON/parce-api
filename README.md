# Parce API 🇨🇴

API pública y gratis de dichos colombianos (y pronto platos típicos y comidas del mundo).

## Endpoints

| Ruta | Qué devuelve |
|---|---|
| `GET /api` | Lista de recursos disponibles |
| `GET /api/dichos` | Todos los dichos. `?q=texto` busca (sin importar tildes) |
| `GET /api/dichos/hoy` | El dicho del día (cambia a medianoche, hora Colombia) |
| `GET /api/dichos/random` | Un dicho al azar |
| `GET /api/dichos/:id` | Un dicho por id |

```js
const dicho = await (await fetch('https://<tu-dominio>/api/dichos/hoy')).json();
```

## Agregar contenido

- **Un dicho nuevo:** agrégalo a `data/dichos.json` con un `id` único en minúsculas y con guiones.
- **Un recurso nuevo** (ej. platos): crea `data/platos.json` con objetos que tengan `id`. Queda disponible solo en `/api/platos`.

Corre `npm test` antes de hacer commit.
