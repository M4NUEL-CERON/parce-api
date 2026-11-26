import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import handler, { delDia } from './api/index.js';

function llamar(url) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ url }, res);
}

test('lista recursos', () => assert.ok(llamar('/api').body.recursos.includes('/api/dichos')));
test('ruta reescrita por vercel', () => assert.equal(llamar('/api?ruta=dichos/no-dar-papaya').body.dicho, 'No dar papaya'));
test('busca sin tildes', () => assert.ok(llamar('/api/dichos?q=CAMARON').body.length >= 1));
test('filtra por campo', () => {
  const tolima = llamar('/api/platos?region=tolima').body;
  assert.ok(tolima.length >= 2 && tolima.every((p) => p.region === 'Tolima'));
  assert.ok(llamar('/api/platos?region=bogota').body.some((p) => p.id === 'ajiaco')); // sin tilde
  assert.deepEqual(llamar('/api/platos?region=tolima&q=arveja').body.map((p) => p.id), ['lechona', 'tamal-tolimense']);
  assert.deepEqual(llamar('/api/platos?region=narnia').body, []);
  assert.deepEqual(llamar('/api/dichos?region=antioquia').body.map((d) => d.id), ['hagale-pues', 'ave-maria-pues', 'que-mas-pues', 'que-charro']);
});
test('cada dicho tiene región', () => assert.ok(llamar('/api/dichos').body.every((d) => d.region)));
test('coincidencia exacta manda sobre la parcial', () => {
  const santander = llamar('/api/municipios?departamento=santander').body;
  assert.equal(santander.length, 87);
  assert.ok(santander.every((m) => m.departamento === 'santander'));
  assert.ok(llamar('/api/municipios?departamento=santan').body.some((m) => m.departamento === 'norte-de-santander'));
});
test('geografía: departamentos, municipios, ríos y mapa encajan', () => {
  const deptos = llamar('/api/departamentos').body;
  const munis = llamar('/api/municipios').body;
  const rios = llamar('/api/rios').body;
  assert.equal(deptos.length, 33);
  assert.equal(llamar('/api/departamentos/cundinamarca').body.capital_codigo, '11001'); // capital: Bogotá, no 25001
  assert.equal(deptos.reduce((s, d) => s + d.poblacion_2026, 0), munis.reduce((s, m) => s + m.poblacion_2026, 0));
  const ids = new Set(deptos.map((d) => d.id));
  assert.ok(munis.every((m) => ids.has(m.departamento)));
  assert.ok(deptos.every((d) => munis.some((m) => m.id === d.capital_codigo && m.capital)));
  assert.ok(rios.every((r) => r.departamentos.every((d) => ids.has(d) && deptos.find((x) => x.id === d).rios.includes(r.id))));
  const mapa = JSON.parse(readFileSync('mapa/colombia.topo.json', 'utf8'));
  assert.deepEqual(new Set(mapa.objects.departamentos.geometries.map((g) => g.properties.id)), ids);
  assert.deepEqual(new Set(mapa.objects.rios.geometries.map((g) => g.properties.id)), new Set(rios.map((r) => r.id)));
});
test('hoy, random y 404', () => {
  assert.ok(llamar('/api/dichos/hoy').body.id);
  assert.ok(llamar('/api/dichos/random').body.id);
  assert.equal(llamar('/api/dichos/no-existe').code, 404);
  assert.equal(llamar('/api/nada').code, 404);
});
test('delDia cambia a medianoche de Colombia', () => {
  const l = [1, 2];
  assert.equal(delDia(l, new Date('2026-11-19T04:59:00Z')), delDia(l, new Date('2026-11-18T12:00:00Z')));
  assert.notEqual(delDia(l, new Date('2026-11-19T05:00:00Z')), delDia(l, new Date('2026-11-18T12:00:00Z')));
});
test('cada item tiene id único', () => {
  for (const f of readdirSync('data')) {
    const ids = JSON.parse(readFileSync(`data/${f}`, 'utf8')).map((x) => x.id);
    assert.ok(ids.every(Boolean), `${f}: falta id`);
    assert.equal(new Set(ids).size, ids.length, `${f}: ids repetidos`);
  }
});
