// O que o servidor marca no HTML da página do painel ANTES de o navegador pintar o primeiro
// quadro. Puro e testável: recebe a config crua do KV e devolve as marcas. Quem aplica é o
// HTMLRewriter do middleware.
//
//   modo / tema   o modo que o dono escolheu (config.tema 'claro' ou 'escuro'). Com ele no
//                 <html> o painel já nasce no modo certo, sem piscar o errado. 'auto' ou
//                 ausente não marca nada: decide o navegador de quem abre.
//   saudacao      quem a tela de abertura cumprimenta (config.saudacao ou o nome do painel).
//                 null com a saudação desligada.
//   accent        a cor da marca, pra saudação já sair na cor certa.
//   logo          o logotipo, pra saudação.
//
// Privacidade: painel protegido por senha só entrega o modo (um claro ou escuro não identifica
// ninguém). Nome, cor e logotipo ficam atrás da senha, como na listagem pública.
//
// As regras de texto e de modo são as mesmas do navegador (lib/saudacao.js e
// lib/tema-inicial.js); há teste de paridade em test/abertura-do-painel.test.js.

import { LIMITE_DA_SAUDACAO } from './aparencia-shape.mjs';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CONTROLE = /[\u0000-\u001f\u007f]/;
const VAZIO = Object.freeze({ modo: null, tema: null, saudacao: null, porte: null, accent: null, logo: null, logoFundo: null });

// Porte do texto da saudação (mesma régua de porteDaSaudacao no navegador): nome comprido encolhe.
function porteDoNome(nome) {
  const n = nome.length;
  if (n <= 12) return null;
  return n <= 24 ? 'media' : 'longa';
}

function nomeSaudado(config) {
  const s = config.saudacao;
  const serve = typeof s === 'string' && s.trim().length >= 1 && s.length <= LIMITE_DA_SAUDACAO && !/[<>]/.test(s) && !CONTROLE.test(s);
  if (serve) return s.replace(/\s+/g, ' ').trim();
  return typeof config.name === 'string' ? config.name.trim() : '';
}

function logoSeguro(logo) {
  if (typeof logo !== 'string') return null;
  const v = logo.trim();
  if (/^https:\/\/[^\s]+$/i.test(v) || /^data:image\/[a-z0-9.+-]+[;,]/i.test(v)) return v;
  return null;
}

/**
 * @param {object|null} config  config crua do KV (ou null se o painel não existe)
 * @param {{protegido?:boolean}} [ctx]
 * @returns {{modo:'claro'|'escuro'|null, tema:'light'|'dark'|null, saudacao:string|null, porte:'media'|'longa'|null, accent:string|null, logo:string|null, logoFundo:'claro'|'escuro'|null}}
 */
export function marcasIniciais(config, { protegido = false } = {}) {
  if (!config || typeof config !== 'object') return { ...VAZIO };
  const modo = config.tema === 'claro' || config.tema === 'escuro' ? config.tema : null;
  const tema = modo === 'claro' ? 'light' : (modo === 'escuro' ? 'dark' : null);
  if (protegido) return { ...VAZIO, modo, tema };
  const nome = config.saudacaoLigada === false ? '' : nomeSaudado(config);
  const logo = logoSeguro(config.logo);
  return {
    modo,
    tema,
    saudacao: nome || null,
    porte: nome ? porteDoNome(nome) : null,
    accent: typeof config.accent === 'string' && HEX.test(config.accent) ? config.accent : null,
    logo,
    logoFundo: logo && (config.logoFundo === 'claro' || config.logoFundo === 'escuro') ? config.logoFundo : null,
  };
}
