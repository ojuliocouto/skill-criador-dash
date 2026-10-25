// Achado 6 da auditoria (3.9.0): no passo da aparência, "Em branco: painel aberto" era o único aviso. Quem
// criava um painel com Receita sem senha não ficava sabendo que qualquer pessoa com o link vê a receita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDePainelAberto } from '../public/assets/js/lib/aviso-painel-aberto.js';
import { template as marketing } from '../public/assets/js/templates/marketing.js';
import { template as vendas } from '../public/assets/js/templates/vendas.js';
import { template as financeiro } from '../public/assets/js/templates/financeiro.js';
import { template as suporte } from '../public/assets/js/templates/suporte.js';

test('painel aberto com Receita: avisa que quem tiver o link vê a receita e diz onde pôr a senha', () => {
  const t = avisoDePainelAberto({ template: marketing, colMap: { data: 'Data', investimento: 'Inv', receita: 'Receita' } });
  assert.match(t, /Receita/);
  assert.match(t, /link/);
  assert.match(t, /senha/);
  assert.match(t, /Mais opções/);
});

test('vendas e financeiro: o dinheiro do painel também conta', () => {
  assert.match(avisoDePainelAberto({ template: vendas, colMap: { data: 'Data', valor: 'Valor' } }), /Valor/);
  assert.match(avisoDePainelAberto({ template: financeiro, colMap: { data: 'Data', entrada: 'E', saida: 'S' } }), /Entrada e Saída/);
});

test('sem aviso: com senha nova, com senha já guardada, sem coluna de dinheiro ligada, ou área sem dinheiro', () => {
  const colMap = { data: 'Data', investimento: 'Inv', receita: 'Receita' };
  assert.equal(avisoDePainelAberto({ template: marketing, colMap, senha: 'x' }), '');
  assert.equal(avisoDePainelAberto({ template: marketing, colMap, protegido: true }), '');
  assert.equal(avisoDePainelAberto({ template: marketing, colMap: { data: 'Data', investimento: 'Inv' } }), '');
  assert.equal(avisoDePainelAberto({ template: suporte, colMap: { data: 'Data', atendimentos: 'A' } }), '');
  assert.equal(avisoDePainelAberto({}), '');
});

test('o passo da aparência mostra o aviso fora de "Mais opções" e o atualiza quando a senha muda', async () => {
  const { readFileSync } = await import('node:fs');
  const fonte = readFileSync(new URL('../public/assets/js/wizard/passo-aparencia.js', import.meta.url), 'utf8');
  assert.match(fonte, /avisoDePainelAberto/);
  const iMais = fonte.indexOf('    mais,\n');
  const iAviso = fonte.indexOf('    avisoAberto,\n');
  assert.ok(iMais > 0 && iAviso > iMais, 'o aviso fica na coluna visível, depois de "Mais opções" e antes do botão');
  assert.match(fonte, /senha\.addEventListener\('input', \(\) => \{ state\.senha = senha\.value; atualizarAviso\(\); \}\)/);
});
