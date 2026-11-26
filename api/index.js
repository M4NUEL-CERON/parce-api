import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Cada data/<recurso>.json es un endpoint /api/<recurso>. Agregar platos = crear data/platos.json.
const DATA = join(process.cwd(), 'data');
const recursos = Object.fromEntries(
  readdirSync(DATA)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(DATA, f), 'utf8'))]),
);

const normalizar = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Mismo item para todos durante el día, con el día contado en hora de Colombia (UTC-5).
export function delDia(lista, fecha = new Date()) {
  const dia = Math.floor((fecha.getTime() - 5 * 3600e3) / 86400e3);
  return lista[dia % lista.length];
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://localhost');
  // vercel.json reescribe /api/<ruta> a /api?ruta=<ruta>
  const ruta = url.searchParams.get('ruta') ?? url.pathname.replace(/^\/api\/?/, '');
  const [nombre, accion] = ruta.split('/').filter(Boolean);

  if (!nombre) {
    return res.status(200).json({ recursos: Object.keys(recursos).map((r) => `/api/${r}`) });
  }
  const lista = recursos[nombre];
  if (!lista) return res.status(404).json({ error: `No existe /api/${nombre}, parce` });

  if (!accion) {
    let resultado = lista;
    for (const [campo, valor] of url.searchParams) {
      if (campo === 'ruta') continue;
      const v = normalizar(valor);
      const texto = (x) => normalizar(campo === 'q' ? JSON.stringify(x) : String(x[campo] ?? ''));
      // ?q= busca en todo el item; cualquier otro parámetro filtra por ese campo (ej. ?region=tolima).
      // Si hay coincidencias exactas mandan: ?departamento=santander no trae Norte de Santander.
      const exactos = campo === 'q' ? [] : resultado.filter((x) => texto(x) === v);
      resultado = exactos.length ? exactos : resultado.filter((x) => texto(x).includes(v));
    }
    return res.status(200).json(resultado);
  }
  if (accion === 'hoy') return res.status(200).json(delDia(lista));
  if (accion === 'random') return res.status(200).json(lista[Math.floor(Math.random() * lista.length)]);

  const item = lista.find((x) => x.id === accion);
  return item ? res.status(200).json(item) : res.status(404).json({ error: `No encontré "${accion}"` });
}
