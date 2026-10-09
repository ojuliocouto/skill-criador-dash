#!/usr/bin/env node
/**
 * Imprime o SHA-256 (hexadecimal) de uma senha: o valor que vai em `auth.hash` no POST de um painel com senha
 * (o servidor nunca recebe a senha em texto: ver references/seguranca.md). É a mesma conta que o navegador faz
 * (texto UTF-8, então "açaí" dá o mesmo hash dos dois lados).
 *
 *   CD_SENHA='a senha' node <dir-da-skill>/scripts/hash-senha.mjs
 *   printf '%s' 'a senha' | node <dir-da-skill>/scripts/hash-senha.mjs
 *
 * A senha vem do ambiente (CD_SENHA) ou da entrada padrão, nunca de um argumento: argumento fica no histórico do
 * terminal e na lista de processos. Só o hash sai na tela.
 */
import { createHash } from 'node:crypto';

async function lerEntrada() {
  if (process.stdin.isTTY) return '';
  let texto = '';
  for await (const pedaco of process.stdin) texto += pedaco;
  return texto.replace(/\r?\n$/, '');
}

const senha = process.env.CD_SENHA !== undefined ? process.env.CD_SENHA : await lerEntrada();
if (!senha) {
  console.error('Falta a senha. Passe pela variável CD_SENHA (CD_SENHA=\'sua senha\' node hash-senha.mjs) ou pela entrada padrão (printf \'%s\' \'sua senha\' | node hash-senha.mjs).');
  process.exit(2);
}
process.stdout.write(createHash('sha256').update(senha, 'utf8').digest('hex') + '\n');
