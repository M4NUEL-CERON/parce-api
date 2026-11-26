// Genera mapa/colombia.topo.json a partir del TopoJSON de geoBoundaries (fronteras del IGAC, CC BY 4.0).
// Uso: node scripts/mapa.js geoBoundaries-COL-ADM1.topojson rios-trazado.json
// rios-trazado.json: { "<id del río>": [[[lon, lat], ...], ...] } con los tramos dentro de Colombia (Natural Earth).
// Simplifica cada arco por separado: como los arcos son compartidos, los departamentos siguen encajando sin huecos.
import { readFileSync, writeFileSync } from 'node:fs';

const TOLERANCIA = 0.006; // grados (~650 m); a 900 px de ancho un píxel son ~0.017°
const TOLERANCIA_ISLAS = 0.0003; // ~30 m: San Andrés y Providencia se dibujan ampliadas 20 veces
const CUANTIZACION = 1e5;

const sinTildes = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export const idDepartamento = (nombre) =>
  nombre === 'Distrito Capital de Bogotá' ? 'bogota'
  : nombre.startsWith('San Andrés') ? 'san-andres'
  : sinTildes(nombre).replace(/[^a-z0-9]+/g, '-');

// Douglas-Peucker sobre una polilínea abierta; siempre conserva los extremos.
export function simplificar(puntos, tol) {
  if (puntos.length < 3) return puntos;
  const [ax, ay] = puntos[0], [bx, by] = puntos.at(-1);
  const dx = bx - ax, dy = by - ay, largo = Math.hypot(dx, dy);
  let max = 0, idx = 0;
  for (let i = 1; i < puntos.length - 1; i++) {
    const [px, py] = puntos[i];
    const d = largo ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / largo : Math.hypot(px - ax, py - ay);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [puntos[0], puntos.at(-1)];
  return [...simplificar(puntos.slice(0, idx + 1), tol).slice(0, -1), ...simplificar(puntos.slice(idx), tol)];
}

// Un arco cerrado (isla) se parte en su punto más lejano para que no colapse a una línea.
function simplificarArco(p, tol) {
  const cerrado = p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1];
  if (!cerrado) return simplificar(p, tol);
  let lejos = 1, max = 0;
  p.forEach(([x, y], i) => { const d = Math.hypot(x - p[0][0], y - p[0][1]); if (d > max) { max = d; lejos = i; } });
  const a = simplificar(p.slice(0, lejos + 1), tol), b = simplificar(p.slice(lejos), tol);
  const anillo = [...a.slice(0, -1), ...b];
  return anillo.length >= 4 ? anillo : p.filter((_, i) => i % Math.ceil(p.length / 4) === 0).concat([p[0]]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const topo = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const geometrias = topo.objects[Object.keys(topo.objects)[0]].geometries;
  const deIslas = new Set(geometrias.filter((g) => idDepartamento(g.properties.shapeName) === 'san-andres').flatMap((g) => g.arcs.flat(2)).map((i) => (i < 0 ? ~i : i)));
  const arcos = topo.arcs.map((arco, i) => {
    let x = 0, y = 0;
    return simplificarArco(arco.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]), deIslas.has(i) ? TOLERANCIA_ISLAS : TOLERANCIA);
  });
  // Cada tramo de río es un arco propio, después de los de las fronteras.
  const rios = Object.entries(JSON.parse(readFileSync(process.argv[3], 'utf8'))).map(([id, tramos]) => ({
    type: 'MultiLineString', properties: { id },
    arcs: tramos.map((t) => arcos.push(simplificar(t, TOLERANCIA)) - 1).map((i) => [i]),
  }));

  const todos = arcos.flat();
  const [x0, y0] = [Math.min(...todos.map((p) => p[0])), Math.min(...todos.map((p) => p[1]))];
  const [x1, y1] = [Math.max(...todos.map((p) => p[0])), Math.max(...todos.map((p) => p[1]))];
  const k = [(x1 - x0) / (CUANTIZACION - 1), (y1 - y0) / (CUANTIZACION - 1)];
  const cuantizados = arcos.map((arco) => {
    let px = 0, py = 0;
    return arco.map(([x, y]) => {
      const qx = Math.round((x - x0) / k[0]), qy = Math.round((y - y0) / k[1]);
      const d = [qx - px, qy - py]; px = qx; py = qy; return d;
    });
  });

  const objeto = topo.objects[Object.keys(topo.objects)[0]];
  const salida = {
    type: 'Topology',
    transform: { scale: k, translate: [x0, y0] },
    objects: {
      departamentos: {
        type: 'GeometryCollection',
        geometries: objeto.geometries.map((g) => ({
          type: g.type, arcs: g.arcs,
          properties: { id: idDepartamento(g.properties.shapeName) }, // nombre y demás datos: /api/departamentos/<id>
        })),
      },
      rios: { type: 'GeometryCollection', geometries: rios },
    },
    arcs: cuantizados,
  };
  writeFileSync('mapa/colombia.topo.json', JSON.stringify(salida));
  console.log(`${arcos.reduce((n, a) => n + a.length, 0)} puntos, ${salida.objects.departamentos.geometries.length} departamentos, ${rios.length} ríos`);
}
