// D7 (teste de ponta a ponta, 02/10/2026): "contatos" não era reconhecido como Leads nem
// "avaliacoes_agendadas" como Conversões. Sinônimo em português entra, mas SINÔNIMO FRACO nunca mapeia em
// silêncio: o assistente mostra o que ligou e pede confirmação antes de seguir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMapDetalhado, autoMap } from '../public/assets/js/lib/automap.js';
import { pendentesDeConfirmacao } from '../public/assets/js/lib/mapa-colunas.js';
import { getTemplate } from '../public/assets/js/templates/index.js';
import { fonteDoAssistente } from './apoio/fonte-do-assistente.js';

const marketing = getTemplate('marketing');
const CABECALHO_DO_TESTE = ['data', 'canal', 'investimento', 'impressoes', 'cliques', 'contatos', 'avaliacoes_agendadas', 'receita'];

test('o cabeçalho do CSV do teste: contatos vira Leads e avaliacoes_agendadas vira Conversões, as duas como sinônimo fraco', () => {
  const { mapa, fracos } = autoMapDetalhado(marketing.slots, CABECALHO_DO_TESTE);
  assert.equal(mapa.leads, 'contatos');
  assert.equal(mapa.conversoes, 'avaliacoes_agendadas');
  assert.deepEqual(fracos, { leads: 'contatos', conversoes: 'avaliacoes_agendadas' });
  assert.equal(mapa.data, 'data');
  assert.equal(mapa.investimento, 'investimento');
  assert.equal(mapa.receita, 'receita');
});

test('variações em português, com e sem acento, com sublinhado e maiúscula', () => {
  const casos = [
    ['leads', ['Contatos']], ['leads', ['contato']], ['leads', ['Inscritos']], ['leads', ['inscrições']], ['leads', ['Interessados']],
    ['conversoes', ['Avaliações agendadas']], ['conversoes', ['avaliacoes_agendadas']], ['conversoes', ['Agendamentos']],
    ['conversoes', ['consultas']], ['conversoes', ['Orçamentos']], ['conversoes', ['pedidos']], ['conversoes', ['matrículas']],
  ];
  for (const [slot, colunas] of casos) {
    const { mapa } = autoMapDetalhado(marketing.slots, ['Data', ...colunas]);
    assert.equal(mapa[slot], colunas[0], `${colunas[0]} deveria ser ${slot}`);
  }
});

test('sinônimo forte (o nome de sempre) não pede confirmação', () => {
  const { mapa, fracos } = autoMapDetalhado(marketing.slots, ['Data', 'Leads', 'Conversões', 'Investimento']);
  assert.equal(mapa.leads, 'Leads');
  assert.equal(mapa.conversoes, 'Conversões');
  assert.deepEqual(fracos, {});
});

test('nunca mapeia errado em silêncio: o nome certo vence o sinônimo, e o sinônimo que sobra fica sem uso', () => {
  const { mapa, fracos } = autoMapDetalhado(marketing.slots, ['Data', 'Investimento', 'Leads', 'Contatos']);
  assert.equal(mapa.leads, 'Leads');
  assert.deepEqual(fracos, {});
  assert.ok(!Object.values(mapa).includes('Contatos'), 'Contatos não pode ir parar em outro número');
});

test('coluna que não tem nada a ver com o número continua sem ligar', () => {
  const { mapa } = autoMapDetalhado(marketing.slots, ['Data', 'Investimento', 'Observacoes', 'Responsavel']);
  assert.equal(mapa.leads, null);
  assert.equal(mapa.conversoes, null);
});

test('autoMap (a função de sempre) devolve o mesmo mapa', () => {
  assert.deepEqual(autoMap(marketing.slots, CABECALHO_DO_TESTE), autoMapDetalhado(marketing.slots, CABECALHO_DO_TESTE).mapa);
});

test('pendentesDeConfirmacao: some quando a pessoa confirma ou troca a coluna', () => {
  const fracos = { leads: 'contatos', conversoes: 'avaliacoes_agendadas' };
  const colMap = { leads: 'contatos', conversoes: 'avaliacoes_agendadas' };
  assert.deepEqual(pendentesDeConfirmacao(fracos, colMap, {}), ['leads', 'conversoes']);
  assert.deepEqual(pendentesDeConfirmacao(fracos, colMap, { leads: true }), ['conversoes']);
  assert.deepEqual(pendentesDeConfirmacao(fracos, { ...colMap, conversoes: 'receita' }, { leads: true }), []);
  assert.deepEqual(pendentesDeConfirmacao({}, colMap, {}), []);
  assert.deepEqual(pendentesDeConfirmacao(null, colMap, null), []);
});

test('o passo das colunas mostra o que ligou por semelhança e barra o Continuar até confirmar', () => {
  const src = fonteDoAssistente();
  assert.ok(src.includes('autoMapDetalhado'), 'o passo usa o mapeamento com detalhe');
  assert.ok(src.includes('pendentesDeConfirmacao'), 'o passo consulta o que falta confirmar');
  assert.ok(src.includes('Confirme as colunas'), 'a mensagem que barra o Continuar');
  assert.ok(src.includes('Está certo'), 'o botão de confirmar');
});
