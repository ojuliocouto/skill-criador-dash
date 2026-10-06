// Apoio de teste: o assistente deixou de ser um arquivo só (config-wizard.js) e virou o
// orquestrador mais um módulo por passo em public/assets/js/wizard/. Os testes que ancoram no
// código-fonte do assistente leem todos os arquivos juntos por aqui.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const js = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'assets', 'js');

export const ARQUIVOS_DO_ASSISTENTE = [
  join(js, 'config-wizard.js'),
  ...readdirSync(join(js, 'wizard')).filter((f) => f.endsWith('.js')).sort().map((f) => join(js, 'wizard', f)),
];

export function fonteDoAssistente() {
  return ARQUIVOS_DO_ASSISTENTE.map((arq) => readFileSync(arq, 'utf8')).join('\n');
}
