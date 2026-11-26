// Arma data/departamentos.json, data/municipios.json y data/rios.json desde fuentes oficiales.
// Uso: node scripts/datos.js <carpeta>   (luego: node scripts/mapa.js <carpeta>/adm1.topojson <carpeta>/rios-trazado.json)
// <carpeta> debe tener:
//   divipola.json   https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000  (DANE, DIVIPOLA, CC BY-SA 4.0)
//   dep/, mun/      PPED-AreaDep-2018-2050_VP.xlsx y PPED-AreaMun-2018-2042_VP.xlsx descomprimidos (DANE, proyecciones 2025)
//   adm1.topojson   geoBoundaries COL ADM1 (fronteras del IGAC 2024, CC BY 4.0)
//   rios.geojson    Natural Earth 5.1.2 ne_10m_rivers_lake_centerlines (dominio público)
import { readFileSync, writeFileSync } from 'node:fs';
const S = process.argv[2], REPO = '.';
const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));

// Lee la hoja 3 de un .xlsx ya descomprimido (un xlsx es un zip de XML), sin dependencias.
function filas(dir) {
  const dec = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const ss = readFileSync(`${dir}/xl/sharedStrings.xml`, 'utf8');
  const compartidas = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  const col = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return [...readFileSync(`${dir}/xl/worksheets/sheet3.xml`, 'utf8').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((fila) => {
    const celdas = [];
    for (const c of fila[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? c[3]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      if (v !== undefined) celdas[col(c[1])] = /t="s"/.test(c[2]) ? compartidas[+v] : dec(v);
    }
    return celdas;
  });
}

const sinTildes = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const slug = (s) => sinTildes(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const AÑO = '2026';
const divipola = leer(`${S}/divipola.json`);
const popDep = Object.fromEntries(filas(`${S}/dep`).filter((r) => r[2] === AÑO && r[3] === 'Total').map((r) => [r[0], { nombre: r[1], pob: +r[4] }]));
const popMun = Object.fromEntries(filas(`${S}/mun`).filter((r) => r[4] === AÑO && r[5] === 'Total').map((r) => [r[2], { nombre: r[3], pob: +r[6] }]));

const ID = { '11': 'bogota', '88': 'san-andres' };
const NOMBRE = { '11': 'Bogotá D.C.', '88': 'San Andrés, Providencia y Santa Catalina' };
const idDep = (c) => ID[c] ?? slug(popDep[c].nombre);
const REGION = {
  Caribe: ['08', '13', '20', '23', '44', '47', '70'],
  Insular: ['88'],
  Pacífica: ['27', '76', '19', '52'],
  Andina: ['05', '11', '15', '17', '25', '41', '54', '63', '66', '68', '73'],
  Orinoquía: ['81', '85', '50', '99'],
  Amazonía: ['91', '18', '94', '95', '86', '97'],
};
const regionDe = (c) => Object.keys(REGION).find((r) => REGION[r].includes(c));
const capitalDe = (c) => (c === '25' ? '11001' : `${c}001`); // la capital de Cundinamarca es Bogotá, no 25001

// Fronteras completas del IGAC para superficie y cruce con ríos
const topo = leer(`${S}/adm1.topojson`);
const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
const arcos = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]); });
const arco = (i) => (i < 0 ? arcos[~i].slice().reverse() : arcos[i]);
const anillo = (r) => r.flatMap(arco);
const nombreACodigo = Object.fromEntries(Object.entries(popDep).map(([c, d]) => [sinTildes(d.nombre), c]));
nombreACodigo[sinTildes('Distrito Capital de Bogotá')] = '11';
nombreACodigo[sinTildes('San Andrés, Providencia y Santa Catalina')] = '88';
const poligonos = {};
for (const g of Object.values(topo.objects)[0].geometries) {
  const c = nombreACodigo[sinTildes(g.properties.shapeName)];
  if (!c) throw new Error(`Sin código: ${g.properties.shapeName}`);
  poligonos[c] = (g.type === 'Polygon' ? [g.arcs] : g.arcs).map((p) => p.map(anillo));
}
const R = 6378137, rad = Math.PI / 180;
const areaAnillo = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) { const [x1, y1] = r[i], [x2, y2] = r[i + 1]; s += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad)); } return Math.abs(s * R * R / 2); };
const area = (c) => poligonos[c].reduce((t, [ext, ...huecos]) => t + areaAnillo(ext) - huecos.reduce((h, r) => h + areaAnillo(r), 0), 0) / 1e6;
const dentroAnillo = ([x, y], r) => { let d = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d; } return d; };
const departamentoEn = (p) => Object.keys(poligonos).find((c) => poligonos[c].some(([ext, ...h]) => dentroAnillo(p, ext) && !h.some((r) => dentroAnillo(p, r))));

// Ríos: trazado de Natural Earth (dominio público); longitud y desembocadura de Wikidata (CC0)
const RIOS = [
  { ne: 'Magdalena', id: 'magdalena', nombre: 'Magdalena', longitud_km: 1528, desembocadura: 'Mar Caribe', vertiente: 'Caribe' },
  { ne: 'Cauca', id: 'cauca', nombre: 'Cauca', longitud_km: 965, desembocadura: 'Río Magdalena', vertiente: 'Caribe' },
  { ne: 'Atrato', id: 'atrato', nombre: 'Atrato', longitud_km: 644, desembocadura: 'Golfo de Urabá', vertiente: 'Caribe' },
  { ne: 'Mira', id: 'mira', nombre: 'Mira', longitud_km: 400, desembocadura: 'Océano Pacífico', vertiente: 'Pacífico' },
  { ne: 'Meta', id: 'meta', nombre: 'Meta', longitud_km: 1000, desembocadura: 'Río Orinoco', vertiente: 'Orinoco' },
  { ne: 'Orinoco', id: 'orinoco', nombre: 'Orinoco', longitud_km: 2140, desembocadura: 'Océano Atlántico', vertiente: 'Orinoco' },
  { ne: 'Caquetá', id: 'caqueta', nombre: 'Caquetá', longitud_km: 2820, desembocadura: 'Río Amazonas', vertiente: 'Amazonas' },
  { ne: 'Putumayo', id: 'putumayo', nombre: 'Putumayo', longitud_km: 1610, desembocadura: 'Río Amazonas', vertiente: 'Amazonas' },
  { ne: 'Amazonas', id: 'amazonas', nombre: 'Amazonas', longitud_km: 6400, desembocadura: 'Océano Atlántico', vertiente: 'Amazonas' },
  { ne: 'Guainía', id: 'guaviare', nombre: 'Guaviare', longitud_km: 1497, desembocadura: 'Río Orinoco', vertiente: 'Orinoco' }, // Natural Earth lo rotula «Guainía», pero el trazado (nace en el Meta, cae al Orinoco) es el Guaviare
  { ne: 'Uaupés', id: 'vaupes', nombre: 'Vaupés', longitud_km: 1050, desembocadura: 'Río Negro', vertiente: 'Amazonas' },
];
const ne = leer(`${S}/rios.geojson`).features;
const trazados = {};
const rios = RIOS.map(({ ne: n, ...rio }) => {
  // Puede haber varias líneas con el mismo nombre (el Amazonas tiene un tramo suelto en Brasil): la más larga
  const puntos = (x) => JSON.stringify(x.geometry.coordinates).length;
  const f = ne.filter((x) => x.properties.name === n || x.properties.name_es === n).sort((a, b) => puntos(b) - puntos(a))[0];
  if (!f) throw new Error(`Sin trazado: ${n}`);
  const lineas = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const deptos = [];
  const tramos = []; // solo los tramos dentro de Colombia
  for (const l of lineas) {
    let tramo = [];
    for (const p of l) {
      const c = departamentoEn(p) ?? 
        [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]].map(([dx, dy]) => departamentoEn([p[0] + dx, p[1] + dy])).find(Boolean); // ríos de frontera: se buscan a ~5.5 km
      if (c) { tramo.push(p); if (!deptos.includes(c)) deptos.push(c); }
      else if (tramo.length) { tramos.push(tramo); tramo = []; }
    }
    if (tramo.length > 1) tramos.push(tramo);
  }
  trazados[rio.id] = tramos.filter((t) => t.length > 1);
  // El trazado aproximado roza Vaupés en un solo punto; el Caquetá no pasa por ahí. (El punto único en Cesar sí es real: Gamarra.)
  const falsos = { caqueta: ['97'] }[rio.id] ?? [];
  return { ...rio, departamentos: deptos.filter((c) => !falsos.includes(c)).map(idDep) };
});

const departamentos = Object.keys(popDep).sort().map((c) => {
  const cap = capitalDe(c);
  return {
    id: idDep(c), nombre: NOMBRE[c] ?? popDep[c].nombre, codigo: c,
    capital: popMun[cap].nombre, capital_codigo: cap, region: regionDe(c),
    poblacion_2026: popDep[c].pob, superficie_km2: Math.round(area(c)),
    municipios: divipola.filter((m) => m.cod_dpto === c && m.tipo_municipio !== 'Área no municipalizada').length,
    rios: rios.filter((r) => r.departamentos.includes(idDep(c))).map((r) => r.id),
  };
});
const capitales = new Set(Object.keys(popDep).map(capitalDe));
const municipios = divipola.map((m) => ({
  id: m.cod_mpio, nombre: popMun[m.cod_mpio]?.nombre ?? m.nom_mpio, departamento: idDep(m.cod_dpto),
  tipo: m.tipo_municipio, capital: capitales.has(m.cod_mpio),
  lat: +m.latitud.replace(',', '.'), lon: +m.longitud.replace(',', '.'),
  poblacion_2026: popMun[m.cod_mpio]?.pob ?? null,
}));

const linea = (o) => '  ' + JSON.stringify(o);
const guardar = (f, l) => writeFileSync(`${REPO}/data/${f}`, '[\n' + l.map(linea).join(',\n') + '\n]\n');
guardar('departamentos.json', departamentos);
guardar('municipios.json', municipios);
guardar('rios.json', rios);
writeFileSync(`${S}/rios-trazado.json`, JSON.stringify(trazados));

const sinPob = municipios.filter((m) => m.poblacion_2026 === null);
console.log(departamentos.length, 'departamentos;', municipios.length, 'municipios;', rios.length, 'ríos;', sinPob.length, 'municipios sin población:', sinPob.map((m) => m.id + ' ' + m.nombre).join(', '));
console.log('Suma población deptos', departamentos.reduce((a, d) => a + d.poblacion_2026, 0), '| suma munis', municipios.reduce((a, m) => a + (m.poblacion_2026 ?? 0), 0));
console.log('Superficie total', departamentos.reduce((a, d) => a + d.superficie_km2, 0));
