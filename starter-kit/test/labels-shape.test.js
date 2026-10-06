// Servidor: forma de config.labels (nomes trocados pela pessoa no assistente). O servidor não
// conhece os templates, então valida só a forma: chave curta, texto curto, sem sinal de tag e
// sem caractere de controle. Chave que não existe no modelo é ignorada na hora de desenhar.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validarLabels, LIMITE_DO_ROTULO, MAX_ROTULOS } from '../functions/lib/labels-shape.mjs';
import { onRequest as dashboards } from '../functions/api/dashboards.js';
import { rotuloValido, LIMITE_DO_ROTULO as LIMITE_NO_BROWSER } from '../public/assets/js/lib/rotulos.js';

test('validarLabels: ausente, vazio e forma certa passam', () => {
  assert.equal(validarLabels({}), null);
  assert.equal(validarLabels({ labels: null }), null);
  assert.equal(validarLabels({ labels: {} }), null);
  assert.equal(validarLabels({ labels: { conversoes: 'Alunas novas', CPA: 'Custo por aluna' } }), null);
  assert.equal(validarLabels({ labels: { receita: 'a'.repeat(LIMITE_DO_ROTULO) } }), null);
});

test('validarLabels: recusa o que não é mapa de texto', () => {
  assert.match(validarLabels({ labels: ['Alunas'] }), /labels/);
  assert.match(validarLabels({ labels: 'Alunas' }), /labels/);
  assert.match(validarLabels({ labels: { conversoes: 12 } }), /conversoes/);
  assert.match(validarLabels({ labels: { conversoes: { x: 1 } } }), /conversoes/);
});

test('validarLabels: recusa texto vazio, comprido demais, com tag ou com caractere de controle', () => {
  assert.ok(validarLabels({ labels: { conversoes: '' } }));
  assert.ok(validarLabels({ labels: { conversoes: '   ' } }));
  assert.ok(validarLabels({ labels: { conversoes: 'a'.repeat(LIMITE_DO_ROTULO + 1) } }));
  assert.ok(validarLabels({ labels: { conversoes: '<script>alert(1)</script>' } }));
  assert.ok(validarLabels({ labels: { conversoes: 'a > b' } }));
  assert.ok(validarLabels({ labels: { conversoes: 'linha\nquebrada' } }));
  assert.ok(validarLabels({ labels: { conversoes: 'tab\taqui' } }));
});

test('validarLabels: recusa chave fora do padrão e mapa grande demais', () => {
  assert.ok(validarLabels({ labels: { 'chave com espaço': 'Ok' } }));
  assert.ok(validarLabels({ labels: { '<img>': 'Ok' } }));
  assert.ok(validarLabels({ labels: { ['k'.repeat(41)]: 'Ok' } }));
  const muitos = Object.fromEntries(Array.from({ length: MAX_ROTULOS + 1 }, (_, i) => [`k${i}`, 'Ok']));
  assert.match(validarLabels({ labels: muitos }), new RegExp(String(MAX_ROTULOS)));
});

test('paridade: o navegador e o servidor aceitam e recusam os mesmos textos', () => {
  assert.equal(LIMITE_NO_BROWSER, LIMITE_DO_ROTULO);
  const casos = [
    'Alunas novas', 'a'.repeat(LIMITE_DO_ROTULO), 'a'.repeat(LIMITE_DO_ROTULO + 1), '', '   ', '<b>', 'a > b',
    'R&D', 'Ticket "médio"', 'linha\nquebrada', 'Custo/aluna', 'Peças (un.)',
  ];
  for (const texto of casos) {
    const servidor = validarLabels({ labels: { conversoes: texto } }) === null;
    assert.equal(rotuloValido(texto), servidor, `divergência em ${JSON.stringify(texto)}`);
  }
});

function ambiente() {
  const map = new Map();
  const kv = {
    async get(k) { return map.get(k) ?? null; },
    async put(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
    async list() { return { keys: [] }; },
  };
  const env = { DASHBOARDS_KV: kv, ADMIN_TOKEN: 't' };
  const base = {
    name: 'Pilates', domain: 'marketing',
    source: { type: 'csv', data: 'Data,Investimento,Conversões\n01/07/2026,"10,00",1' },
    colMap: { data: 'Data', investimento: 'Investimento', conversoes: 'Conversões' },
  };
  const post = (body) => dashboards({ request: new Request('https://x/api/dashboards', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 't' }, body: JSON.stringify(body),
  }), env });
  const get = (id) => dashboards({ request: new Request(`https://x/api/dashboards?id=${id}`), env });
  return { map, base, post, get };
}

test('POST /api/dashboards: grava labels e devolve no GET (reconfigurar traz os nomes de volta)', async () => {
  const { map, base, post, get } = ambiente();
  const res = await post({ ...base, labels: { conversoes: 'Alunas novas' } });
  assert.equal(res.status, 200);
  const salvo = JSON.parse([...map.values()][0]);
  assert.deepEqual(salvo.labels, { conversoes: 'Alunas novas' });
  const lido = await (await get(salvo.id)).json();
  assert.deepEqual(lido.labels, { conversoes: 'Alunas novas' });
});

test('POST /api/dashboards: labels com forma inválida devolve 400 e não grava', async () => {
  const { map, base, post } = ambiente();
  const res = await post({ ...base, labels: { conversoes: '<img src=x onerror=alert(1)>' } });
  assert.equal(res.status, 400);
  const corpo = await res.json();
  assert.match(corpo.error, /labels/);
  assert.equal(map.size, 0);
});

test('POST /api/dashboards: sem labels continua como sempre', async () => {
  const { map, base, post } = ambiente();
  const res = await post(base);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse([...map.values()][0]).labels, undefined);
});
