// Planilha modelo de cada área (passo 2 do assistente: "Baixar planilha modelo"). O Pages só
// serve o que está em public/, então os exemplos de examples/ têm cópia em public/modelos/.
// Este teste trava a cópia (igual byte a byte) e garante que o modelo de cada área tem as
// colunas obrigatórias do template (e que o reconhecimento automático acha todas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV } from '../functions/lib/csv.mjs';
import { templates, DOMAINS } from '../public/assets/js/templates/index.js';
import { autoMap } from '../public/assets/js/lib/automap.js';
import { validateRequired } from '../public/assets/js/lib/mapa-colunas.js';
import { caminhoDoModelo, nomeDoArquivoModelo } from '../public/assets/js/lib/area-resumo.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('caminhoDoModelo: endereço do modelo de cada área', () => {
  assert.equal(caminhoDoModelo('marketing'), '/modelos/marketing-exemplo.csv');
  assert.equal(nomeDoArquivoModelo('vendas'), 'vendas-exemplo.csv');
  assert.equal(caminhoDoModelo('../segredo'), null, 'área desconhecida não vira caminho');
  assert.equal(caminhoDoModelo(undefined), null);
});

for (const id of DOMAINS) {
  test(`modelo de ${id}: existe em public/modelos e é cópia fiel de examples/`, () => {
    const servido = join(raiz, 'public', caminhoDoModelo(id));
    assert.ok(existsSync(servido), `falta ${caminhoDoModelo(id)}`);
    const original = readFileSync(join(raiz, 'examples', nomeDoArquivoModelo(id)));
    assert.ok(readFileSync(servido).equals(original), 'a cópia servida divergiu do exemplo: copie de novo');
  });

  test(`modelo de ${id}: tem todas as colunas obrigatórias do template`, () => {
    const { columns, rows } = parseCSV(readFileSync(join(raiz, 'public', caminhoDoModelo(id)), 'utf8'));
    assert.ok(rows.length >= 5, 'modelo com linhas de exemplo');
    const colMap = autoMap(templates[id].slots, columns);
    assert.deepEqual(validateRequired(templates[id].slots, colMap), [], 'obrigatória não reconhecida no modelo');
    const semColuna = templates[id].slots.filter((s) => !colMap[s.key]).map((s) => s.label);
    assert.deepEqual(semColuna, [], 'o modelo mostra o painel completo: toda coluna do template presente');
  });
}
