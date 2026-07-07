// Teste de PARIDADE entre o registry de fontes e os CARDS de conexao do wizard
// (passo 2 do config-wizard.js). Fecha o grave de fluxo: hoje da pra registrar
// uma fonte nova em sources/index.js + api-client + Worker, passar em todos os
// testes e no deploy, e MESMO ASSIM o usuario nunca ver um card pra conectar
// aquela fonte (fonte inalcancavel pela UI). As guardas existentes cobrem os
// fetchers (ver sources.test.js e worker-parity.test.js), mas NAO cobrem o card.
//
// Este teste ancora no comportamento REAL do wizard. Lendo o config-wizard.js,
// cada fonte viva no passo 2 e um card com um botao "Conectar" cujo handler
// chama `onConnected(ds, { type: '<type>', ... })`. Ou seja, o que de fato liga
// o card a uma fonte e:
//   1. o botao "Conectar" do card, identificado por um id proprio, e
//   2. o objeto de fonte { type: '<type>' } gravado no state ao conectar.
// Assertamos os DOIS por type. Se alguem adicionar um type novo no registry e
// esquecer o card, este teste FALHA apontando o type sem card. Se remover um
// card de um type ainda vivo no registry, tambem falha.
//
// IMPORTANTE (mapeamento nao e 1:1): os ids dos botoes NAO batem com o type
// capitalizado. O type 'sheets' usa o botao 'connectSheet' (SINGULAR, sem o s),
// 'csv' usa 'connectCsv' e 'meta' usa 'connectMeta'. Por isso o vinculo
// type -> id do botao esta documentado explicitamente no mapa CARD_BUTTON_ID
// abaixo, em vez de derivado por regra fragil. A cobertura de type novo NAO
// depende desse mapa: um type novo sem entrada no mapa quebra o teste (ver o
// loop de cobertura), forcando quem adiciona a fonte a declarar o card aqui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sourceTypes, getSource } from '../public/assets/js/sources/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIZARD_PATH = join(__dirname, '../public/assets/js/config-wizard.js');
const wizardSrc = readFileSync(WIZARD_PATH, 'utf8');

// Fontes que NAO sao um card de conexao no passo 2:
//   - 'd1' e o modo HISTORICO (leitura do proprio banco), escolhido no passo 4
//     via <select id="dashStorage">, nao um card de "conectar fonte".
// Toda fonte fora desta lista PRECISA de um card no wizard.
const NAO_SAO_CARD = new Set(['d1']);

// Types vivos que devem aparecer como card no passo 2.
const CARD_TYPES = sourceTypes().filter((t) => !NAO_SAO_CARD.has(t));

// Mapeamento EXPLICITO type -> id do botao "Conectar" do card, lido direto do
// config-wizard.js. Nao e derivado por regra porque o wizard usa ids que nao
// batem com o type (ex: 'sheets' -> 'connectSheet', singular). Uma fonte viva
// nova PRECISA ganhar uma entrada aqui (e um card la); senao o loop de cobertura
// abaixo falha nela.
const CARD_BUTTON_ID = {
  sheets: 'connectSheet',
  csv: 'connectCsv',
  meta: 'connectMeta',
};

// Sanidade: garante que os padroes de ancoragem casam com o codigo atual, senao
// o teste estaria "verde por engano" (procurando string que nunca existiu).
test('sanidade: os padroes de ancoragem existem mesmo no wizard (sheets)', () => {
  assert.ok(
    wizardSrc.includes(`id: '${CARD_BUTTON_ID.sheets}'`),
    'esperava encontrar o botao connectSheet no wizard; o padrao de id mudou?',
  );
  assert.match(
    wizardSrc,
    /\{\s*type:\s*'sheets'/,
    'esperava encontrar o objeto de fonte { type: \'sheets\' } no wizard; o padrao mudou?',
  );
});

test('ha pelo menos uma fonte viva pra virar card (o teste nao esta vazio)', () => {
  assert.ok(CARD_TYPES.length >= 1, 'nenhum type vivo encontrado no registry de fontes');
});

// Cobertura principal: toda fonte viva do registry tem card no wizard.
// Se um type novo entrar no registry sem card, ESTE loop falha nele.
for (const type of CARD_TYPES) {
  test(`fonte viva '${type}' tem card de conexao no wizard (passo 2)`, () => {
    // Toda fonte viva precisa de uma entrada no mapa de botoes. Um type NOVO no
    // registry sem card (e sem entrada aqui) cai neste assert: e o gatilho que
    // pega a regressao "fonte inalcancavel pela UI".
    const btnId = CARD_BUTTON_ID[type];
    assert.ok(
      btnId,
      `fonte '${type}' esta no registry mas nao tem card mapeado no wizard: ` +
        `adicione o card no config-wizard.js (passo 2) e a entrada em CARD_BUTTON_ID. ` +
        `Sem card, a fonte fica inalcancavel pela UI (usuario nunca consegue conectar).`,
    );

    // 1. Botao "Conectar" do card, ancorado no id real (ex: id: 'connectSheet').
    assert.ok(
      wizardSrc.includes(`id: '${btnId}'`),
      `fonte '${type}' esta no registry mas NAO tem card no wizard: ` +
        `nao achei o botao com id '${btnId}' no config-wizard.js. ` +
        `Fonte inalcancavel pela UI (usuario nunca consegue conectar).`,
    );

    // 2. Objeto de fonte { type: '<type>' } gravado ao conectar. Confirma que o
    //    card realmente registra ESTE type (nao so um botao solto), fechando o
    //    vinculo card -> fonte.
    const typeLiteral = new RegExp(`\\{\\s*type:\\s*'${type}'`);
    assert.match(
      wizardSrc,
      typeLiteral,
      `fonte '${type}' tem botao mas nao grava { type: '${type}' } ao conectar; ` +
        `o card nao esta ligado a esta fonte.`,
    );
  });
}

// Direcao inversa: nenhum card do wizard pode apontar pra um type que nao existe
// (mais) no registry. Varre os literais { type: '<x>' } do wizard e exige que
// cada um seja uma fonte conhecida. Assim, remover uma fonte do registry sem
// remover o card tambem quebra aqui.
test('todo card do wizard aponta pra uma fonte que existe no registry', () => {
  const encontrados = new Set();
  const re = /\{\s*type:\s*'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(wizardSrc)) !== null) {
    encontrados.add(m[1]);
  }
  assert.ok(encontrados.size >= 1, 'nenhum literal { type: ... } encontrado no wizard');
  for (const type of encontrados) {
    assert.ok(
      getSource(type),
      `wizard tem card gravando { type: '${type}' } que nao existe no registry de fontes`,
    );
  }
});
