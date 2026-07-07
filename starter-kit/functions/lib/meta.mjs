// Lógica pura do conector Meta Ads (Facebook/Instagram) da Graph API.
// Sem rede, sem estado global, sem dependências externas. Testável em node:test.
// A parte de fetch fica no handler (functions/api/connectors/meta-ads.js); aqui
// só montamos a URL de insights e mapeamos a resposta para o DataSet (Contrato 1).
//
// IMPORTANTE: este módulo não usa Date (indisponível neste contexto). O campo
// meta.fetchedAt sai como null; o handler carimba a data depois de buscar.

// Colunas fixas do DataSet do conector Meta, na ordem do Contrato 1.
const COLUMNS = [
  'Data',
  'Campanha',
  'Investimento',
  'Impressões',
  'Cliques',
  'Leads',
  'Conversões',
];

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

/**
 * Monta a URL da Graph API v20.0 para buscar insights de anúncios.
 * @param {Object} params
 * @param {string} params.token       access token do usuário
 * @param {string} [params.accountId] id da conta de anúncios (com ou sem prefixo act_)
 * @param {string} [params.account]   alias de accountId (nome que o wizard grava em source.meta.account)
 * @param {string} [params.since]     data inicial no formato YYYY-MM-DD
 * @param {string} [params.until]     data final no formato YYYY-MM-DD
 * @param {string} [params.level]     nível de agregação (padrão 'campaign')
 * @returns {string} URL completa pronta para o fetch
 */
export function buildInsightsUrl({ token, accountId, account, since, until, level = 'campaign' } = {}) {
  if (!token) {
    throw new Error('Meta Ads: informe o access token para buscar os insights.');
  }
  // Aceita tanto accountId quanto o alias account (o wizard grava source.meta.account).
  const acc = accountId || account;
  if (!acc) {
    throw new Error('Meta Ads: informe o id da conta de anúncios (ad account id).');
  }

  // Remove o prefixo act_ se vier junto, para não duplicar ao remontar.
  const digits = String(acc).replace(/^act_/, '');
  const base = `https://graph.facebook.com/v20.0/act_${digits}/insights`;

  const params = new URLSearchParams();
  params.set('access_token', token);
  params.set('level', level);
  // Quebra os resultados por dia.
  params.set('time_increment', '1');
  params.set('fields', 'campaign_name,spend,impressions,clicks,actions,date_start');

  // time_range é opcional: só entra se vierem as duas datas.
  if (since && until) {
    params.set('time_range', JSON.stringify({ since, until }));
  }

  return `${base}?${params.toString()}`;
}

/**
 * Converte a resposta JSON da Graph API para o DataSet do Contrato 1.
 * Cada item de `data` vira uma linha com valores em string crua.
 * @param {Object} apiJson  resposta da Graph API ({ data: [...] } ou { error: {...} })
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

    // Leads: primeiro action_type === 'lead'.
    const leadAction = actions.find((a) => a && a.action_type === 'lead');
    const leads = leadAction ? String(leadAction.value) : '0';

    // Conversões: escolhe UMA fonte, nunca soma agregado + componentes.
    // Se houver omni_purchase (agregado unificado), usa só os omni entre si
    // (itens/janelas distintos do mesmo agregado). Caso contrário, soma os
    // tipos específicos ('purchase' e 'offsite_conversion.fb_pixel_purchase').
    // Ver nota em OMNI_ACTION_TYPE sobre a dobra de conversão.
    const omniActions = actions.filter(
      (a) => a && a.action_type === OMNI_ACTION_TYPE
    );
    const sourceActions =
      omniActions.length > 0
        ? omniActions
        : actions.filter(
            (a) => a && SPECIFIC_PURCHASE_ACTION_TYPES.includes(a.action_type)
          );

    let conversoesSum = 0;
    for (const a of sourceActions) {
      conversoesSum += Number(a.value) || 0;
    }
    const conversoes = sourceActions.length > 0 ? String(conversoesSum) : '0';

    return {
      Data: item.date_start != null ? String(item.date_start) : '',
      Campanha: item.campaign_name != null ? String(item.campaign_name) : '',
      Investimento: item.spend != null ? String(item.spend) : '',
      'Impressões': item.impressions != null ? String(item.impressions) : '',
      Cliques: item.clicks != null ? String(item.clicks) : '',
      Leads: leads,
      'Conversões': conversoes,
    };
  });

  return {
    columns: [...COLUMNS],
    rows,
    // fetchedAt fica null: o handler carimba a data após o fetch.
    meta: { source: 'meta', fetchedAt: null, rowCount: rows.length },
  };
}
