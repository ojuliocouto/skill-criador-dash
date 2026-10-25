// Lógica pura do conector Meta Ads (Facebook/Instagram) da Graph API.
// Sem estado global, sem dependências externas. Testável em node:test.
// Aqui ficam: montar a URL de insights, seguir as páginas (com o fetch recebido por parâmetro,
// então o teste injeta um fetch falso) e mapear a resposta para o DataSet (Contrato 1).
//
// IMPORTANTE: o mapeamento não usa Date. O campo meta.fetchedAt sai como null; o handler
// (functions/api/connectors/meta-ads.js) e o Worker (workers/snapshot) carimbam a data depois.
//
// Documentação oficial lida em 25/10/2026 (versão 3.8.0):
//   Insights da conta: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights
//   Ações:             https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats/
//   Paginação:         https://developers.facebook.com/docs/graph-api/results
// Permissão necessária no token: ads_read.

// Colunas do DataSet do conector Meta, na ordem do Contrato 1. As 7 primeiras existem desde a
// 1.x e ficam na mesma ordem (dash já criado continua lendo as mesmas colunas); as 4 últimas
// entraram na 3.8.0.
const COLUMNS = [
  'Data',
  'Campanha',
  'Investimento',
  'Impressões',
  'Cliques',
  'Leads',
  'Conversões',
  'Resultados',
  'Tipo de resultado',
  'Custo por resultado',
  'CPL',
];

// Paginação: quantas linhas a Graph manda por página e quantas páginas no máximo o painel lê.
// 500 x 40 = 20.000 linhas (campanha x dia). Passou disso, o painel avisa em vez de mostrar
// um total pela metade.
export const LINHAS_POR_PAGINA = 500;
export const TETO_DE_PAGINAS = 40;

// Campos pedidos à Graph API. `results` e `cost_per_result` são a coluna "Resultados" e
// "Custo por resultado" do Gerenciador de Anúncios (dependem do objetivo da campanha).
const FIELDS = 'campaign_name,spend,impressions,clicks,actions,results,cost_per_result,date_start';

// Tipos de ação da Graph API que contam como conversão de compra.
//
// ATENÇÃO (correção de dobra de conversão): na Graph API do Meta, `omni_purchase`
// é um AGREGADO unificado que JÁ inclui as compras de pixel/site
// (`offsite_conversion.fb_pixel_purchase` e `purchase`). Se somarmos o agregado
// junto com os componentes, contamos a mesma compra em dobro, inflando ROAS/CPA.
// Por isso escolhemos UMA fonte de conversão: se houver `omni_purchase`, usamos só
// o(s) omni; caso contrário, somamos os tipos específicos abaixo.
const OMNI_ACTION_TYPE = 'omni_purchase';
const SPECIFIC_PURCHASE_ACTION_TYPES = [
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
];

// Tipos de ação de lead, com a descrição da doc oficial (AdsActionStats):
//   lead                              "All offsite leads plus all On-Facebook leads"  -> AGREGADO
//   onsite_conversion.lead_grouped    "All On-Facebook Leads"                        -> leads no Facebook
//   leadgen_grouped                   "On-Facebook leads coming from Messenger and Instant Forms"
//                                     -> PARTE dos leads no Facebook (não soma com o de cima)
//   offsite_conversion.fb_pixel_lead  "Leads"                                        -> leads do pixel (site)
// Mesma regra do omni_purchase: uma fonte só, nunca agregado + partes.
const LEAD_AGREGADO = 'lead';
const LEAD_NO_FACEBOOK = ['onsite_conversion.lead_grouped', 'leadgen_grouped']; // em ordem de preferência
const LEAD_NO_SITE = 'offsite_conversion.fb_pixel_lead';

// Nome em português do tipo de resultado (o `indicator` da Graph, sem o prefixo "actions:").
// O que não está aqui aparece com o nome cru da Meta.
const NOMES_DO_RESULTADO = {
  lead: 'Leads',
  'onsite_conversion.lead_grouped': 'Leads no formulário',
  leadgen_grouped: 'Leads no formulário',
  'offsite_conversion.fb_pixel_lead': 'Leads no site',
  'onsite_conversion.messaging_conversation_started_7d': 'Conversas por mensagem',
  'onsite_conversion.total_messaging_connection': 'Conversas por mensagem',
  omni_purchase: 'Compras',
  purchase: 'Compras',
  'offsite_conversion.fb_pixel_purchase': 'Compras no site',
  'offsite_conversion.fb_pixel_complete_registration': 'Cadastros no site',
  'offsite_conversion.fb_pixel_add_to_cart': 'Adições ao carrinho',
  'offsite_conversion.fb_pixel_initiate_checkout': 'Finalizações de compra iniciadas',
  link_click: 'Cliques no link',
  landing_page_view: 'Visualizações da página de destino',
  post_engagement: 'Engajamento com a publicação',
  video_view: 'Visualizações do vídeo',
  video_thruplay_watched_actions: 'ThruPlays',
  thruplay: 'ThruPlays',
  reach: 'Alcance',
  impressions: 'Impressões',
  like: 'Curtidas na página',
  'onsite_conversion.post_save': 'Publicações salvas',
};

/**
 * Monta a URL da Graph API v25.0 para buscar insights de anúncios (a primeira página).
 * @param {Object} params
 * @param {string} params.token       access token do usuário (permissão ads_read)
 * @param {string} [params.accountId] id da conta de anúncios (com ou sem prefixo act_)
 * @param {string} [params.account]   alias de accountId (nome que o wizard grava em source.meta.account)
 * @param {string} [params.since]     data inicial no formato YYYY-MM-DD
 * @param {string} [params.until]     data final no formato YYYY-MM-DD
 * @param {string} [params.level]     nível de agregação (padrão 'campaign')
 * @returns {string} URL completa pronta para o fetch
 */
export function buildInsightsUrl({ token, accountId, account, since, until, level = 'campaign' } = {}) {
  if (!token) {
    throw new Error('Meta Ads: informe o token de acesso para buscar os insights.');
  }
  // Aceita tanto accountId quanto o alias account (o wizard grava source.meta.account).
  const acc = accountId || account;
  if (!acc) {
    throw new Error('Meta Ads: informe o id da conta de anúncios (ad account id).');
  }

  // Remove o prefixo act_ se vier junto, para não duplicar ao remontar.
  const digits = String(acc).replace(/^act_/, '');
  const base = `https://graph.facebook.com/v25.0/act_${digits}/insights`;

  const params = new URLSearchParams();
  params.set('access_token', token);
  params.set('level', level);
  // Quebra os resultados por dia.
  params.set('time_increment', '1');
  params.set('fields', FIELDS);
  // Linhas por página: sem isso a Graph manda poucas por vez e o painel precisaria de dezenas de chamadas.
  params.set('limit', String(LINHAS_POR_PAGINA));
  // Atribuição unificada: a mesma que o conjunto de anúncios usa no Gerenciador. É o que faz
  // "Resultados" e "Custo por resultado" baterem com a tela do Gerenciador de Anúncios.
  params.set('use_unified_attribution_setting', 'true');

  // time_range é opcional: só entra se vierem as duas datas.
  if (since && until) {
    params.set('time_range', JSON.stringify({ since, until }));
  }

  return `${base}?${params.toString()}`;
}

// Erro com mensagem que pode ir pro navegador (não revela nada do token nem o texto cru da Meta).
// `cause` guarda o erro original para o log do servidor.
function erroPublico(mensagem, { status = 502, cause } = {}) {
  const e = new Error(mensagem, cause ? { cause } : undefined);
  e.publico = true;
  e.status = status;
  return e;
}

// Códigos de limite de uso da Graph/Marketing API (rate limit).
const CODIGOS_DE_LIMITE = new Set([4, 17, 32, 613, 80000, 80003, 80004, 80014]);

// Só segue link de próxima página que seja da própria Graph API (https://graph.facebook.com).
function ehGraph(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /^graph\.([a-z0-9-]+\.)?facebook\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Busca TODAS as páginas de insights seguindo `paging.next`, com teto de páginas.
 * Página 1 com erro: lança Error com o texto da Meta (o handler troca por uma mensagem genérica,
 * pra não virar oráculo de validação de token). Erro da página 2 em diante, teto estourado ou link
 * estranho: lança erro PÚBLICO (e.publico = true) com mensagem clara em português.
 * Nunca devolve dado pela metade.
 * @param {string} url  URL da primeira página (buildInsightsUrl)
 * @param {(url:string, init?:object)=>Promise<Response>} fetchFn  fetch (injetado: o teste passa um falso)
 * @param {{tetoDePaginas?:number}} [opts]
 * @returns {Promise<{data:Object[], paginas:number}>}
 */
export async function buscarTodasAsPaginas(url, fetchFn, { tetoDePaginas = TETO_DE_PAGINAS } = {}) {
  const data = [];
  const vistas = new Set();
  let proxima = url;
  let pagina = 0;

  while (proxima) {
    pagina += 1;
    vistas.add(proxima);

    let body = null;
    let res;
    try {
      res = await fetchFn(proxima, { redirect: 'follow' });
      body = await res.json();
    } catch (e) {
      if (pagina === 1) throw new Error('Meta Ads: a Graph API não respondeu em JSON.', { cause: e });
      throw erroPublico(`Meta Ads: a Meta parou de responder na página ${pagina} da leitura. Nada foi gravado pela metade. Clique em Atualizar daqui a alguns minutos.`, { cause: e });
    }

    const erroDaMeta = body && body.error;
    if (erroDaMeta || (res && res.ok === false && !Array.isArray(body && body.data))) {
      const msg = (erroDaMeta && erroDaMeta.message) || `HTTP ${res && res.status}`;
      if (pagina === 1) throw new Error(msg);
      const causa = new Error(msg);
      if (erroDaMeta && CODIGOS_DE_LIMITE.has(Number(erroDaMeta.code))) {
        throw erroPublico(`Meta Ads: a Meta atingiu o limite de chamadas desta conta na página ${pagina} da leitura. Espere uns 15 minutos e clique em Atualizar. Se repetir, encurte o período.`, { cause: causa });
      }
      throw erroPublico(`Meta Ads: a Meta devolveu erro na página ${pagina} da leitura. Nada foi gravado pela metade. Tente de novo em alguns minutos; se repetir, encurte o período (campos De e Até).`, { cause: causa });
    }

    if (Array.isArray(body && body.data)) data.push(...body.data);

    const next = body && body.paging && body.paging.next;
    if (!next) break;
    if (!ehGraph(next)) {
      throw erroPublico('Meta Ads: a resposta trouxe um link de próxima página fora da Graph API. A leitura parou por segurança.');
    }
    if (vistas.has(next)) {
      throw erroPublico(`Meta Ads: a Meta repetiu a mesma página (${pagina + 1}) e a leitura parou para não entrar em laço. Clique em Atualizar.`);
    }
    if (pagina >= tetoDePaginas) {
      throw erroPublico(
        `Meta Ads: o período tem mais de ${tetoDePaginas} páginas de dados (mais de ${(tetoDePaginas * LINHAS_POR_PAGINA).toLocaleString('pt-BR')} linhas de campanha por dia). Encurte o período (campos De e Até) ou crie um painel para cada conta.`,
        { status: 400 }
      );
    }
    proxima = next;
  }

  return { data, paginas: pagina };
}

// Número de um texto da Graph ("12", "12.5"); qualquer coisa que não é número vira null.
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Dinheiro e custo em string crua com ponto e 2 casas (o mesmo formato do spend da Graph).
const dinheiro = (n) => (Number.isFinite(n) ? n.toFixed(2) : '');

function somaDoTipo(actions, tipo) {
  let total = 0;
  let achou = false;
  for (const a of actions) {
    if (a && a.action_type === tipo) {
      achou = true;
      total += num(a.value) || 0;
    }
  }
  return achou ? total : null;
}

/**
 * Leads de uma linha, sem contar o mesmo lead duas vezes.
 * Com o agregado `lead`, vale só ele. Sem ele: leads no Facebook (lead_grouped, ou leadgen_grouped
 * se só esse vier) + leads do pixel.
 * @param {Object[]} actions  lista AdsActionStats ({ action_type, value })
 * @returns {number}
 */
export function contarLeads(actions) {
  const lista = Array.isArray(actions) ? actions : [];
  const agregado = somaDoTipo(lista, LEAD_AGREGADO);
  if (agregado != null) return agregado;
  let noFacebook = 0;
  for (const tipo of LEAD_NO_FACEBOOK) {
    const v = somaDoTipo(lista, tipo);
    if (v != null) { noFacebook = v; break; }
  }
  const noSite = somaDoTipo(lista, LEAD_NO_SITE) || 0;
  return noFacebook + noSite;
}

function contarConversoes(actions) {
  // Escolhe UMA fonte, nunca soma agregado + componentes (ver nota em OMNI_ACTION_TYPE).
  const omni = actions.filter((a) => a && a.action_type === OMNI_ACTION_TYPE);
  const fonte = omni.length > 0
    ? omni
    : actions.filter((a) => a && SPECIFIC_PURCHASE_ACTION_TYPES.includes(a.action_type));
  let total = 0;
  for (const a of fonte) total += num(a.value) || 0;
  return total;
}

function nomeDoResultado(indicador) {
  const cru = String(indicador || '').replace(/^actions:/, '');
  return NOMES_DO_RESULTADO[cru] || cru;
}

// Lê um item de `results` ou `cost_per_result` (AdsInsightsResult).
// A doc oficial tipa o campo como list<AdsInsightsResult> sem descrever os subcampos, então
// aceitamos os dois desenhos:
//   A) { indicator, values: [{ value, attribution_windows }] }  (o que a Graph devolve na prática)
//   B) { action_type, value }                                    (desenho de AdsActionStats)
// Com várias janelas de atribuição, vale a 'default' (ou a primeira): janelas NÃO se somam.
function lerItemDeResultado(item) {
  if (item == null) return null;
  if (typeof item !== 'object') {
    const v = num(item);
    return v == null ? null : { indicador: '', valor: v };
  }
  const indicador = item.indicator || item.action_type || '';
  let valor = null;
  if (Array.isArray(item.values)) {
    const escolhido = item.values.find((x) => x && Array.isArray(x.attribution_windows) && x.attribution_windows.includes('default'))
      || item.values[0];
    valor = escolhido && typeof escolhido === 'object' ? num(escolhido.value) : num(escolhido);
  } else {
    valor = num(item.value);
  }
  return valor == null ? null : { indicador, valor };
}

function lerResultados(campo) {
  const lista = Array.isArray(campo) ? campo : (campo == null ? [] : [campo]);
  return lista.map(lerItemDeResultado).filter(Boolean);
}

/**
 * Resultados, tipo e custo por resultado de uma linha.
 * Com `results` da Meta: soma os itens (normalmente um só) e usa o cost_per_result da Meta quando
 * há um tipo só; com vários tipos, o custo é investimento / total.
 * Sem `results` (campanha antiga ou conta sem o campo): cai nos Leads, depois nas Compras, e o
 * tipo diz que é cálculo do painel. Sem nada: 0 e custo vazio.
 */
function resultadosDaLinha(item, investimento, leads, conversoes) {
  const resultados = lerResultados(item.results);
  if (resultados.length > 0) {
    const total = resultados.reduce((s, r) => s + r.valor, 0);
    const nomes = [...new Set(resultados.map((r) => nomeDoResultado(r.indicador)).filter(Boolean))];
    let custo = null;
    if (resultados.length === 1) {
      const custos = lerResultados(item.cost_per_result);
      const doMesmo = custos.find((c) => c.indicador === resultados[0].indicador) || (custos.length === 1 ? custos[0] : null);
      if (doMesmo) custo = doMesmo.valor;
    }
    if (custo == null && total > 0 && investimento != null) custo = investimento / total;
    return { total, tipo: nomes.join(' + '), custo };
  }
  if (leads > 0) {
    return { total: leads, tipo: 'Leads (calculado pelo painel)', custo: investimento != null ? investimento / leads : null };
  }
  if (conversoes > 0) {
    return { total: conversoes, tipo: 'Compras (calculado pelo painel)', custo: investimento != null ? investimento / conversoes : null };
  }
  return { total: 0, tipo: '', custo: null };
}

/**
 * Converte a resposta JSON da Graph API para o DataSet do Contrato 1.
 * Cada item de `data` vira uma linha com valores em string crua.
 * @param {Object} apiJson  resposta da Graph API ({ data: [...] } ou { error: {...} }); com várias
 *                          páginas, buscarTodasAsPaginas junta tudo antes ({ data: [...todas] })
 * @returns {{ columns: string[], rows: Object[], meta: Object }}
 */
export function mapInsightsToDataSet(apiJson) {
  const json = apiJson || {};

  // A Graph API sinaliza falha com { error: { message } }.
  if (json.error && json.error.message) {
    throw new Error(json.error.message);
  }

  const data = Array.isArray(json.data) ? json.data : [];

  const rows = data.map((item) => {
    const actions = Array.isArray(item.actions) ? item.actions : [];
    const investimento = num(item.spend);
    const leads = contarLeads(actions);
    const conversoes = contarConversoes(actions);
    const res = resultadosDaLinha(item, investimento, leads, conversoes);

    return {
      Data: item.date_start != null ? String(item.date_start) : '',
      Campanha: item.campaign_name != null ? String(item.campaign_name) : '',
      Investimento: item.spend != null ? String(item.spend) : '',
      'Impressões': item.impressions != null ? String(item.impressions) : '',
      Cliques: item.clicks != null ? String(item.clicks) : '',
      Leads: String(leads),
      'Conversões': String(conversoes),
      Resultados: String(res.total),
      'Tipo de resultado': res.tipo,
      'Custo por resultado': res.custo != null ? dinheiro(res.custo) : '',
      CPL: leads > 0 && investimento != null ? dinheiro(investimento / leads) : '',
    };
  });

  return {
    columns: [...COLUMNS],
    rows,
    // fetchedAt fica null: o handler carimba a data após o fetch.
    meta: { source: 'meta', fetchedAt: null, rowCount: rows.length },
  };
}
