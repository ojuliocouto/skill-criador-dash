// Conector Meta Ads (2a onda, ainda não implementado).
// Quando implementado, deve autenticar na Graph API da Meta, buscar insights de
// campanha e devolver um DataSet no mesmo formato do Contrato 1
// ({ columns, rows, meta:{ source:'meta-ads', ... } }).
export async function onRequest() {
  return new Response(
    JSON.stringify({ error: 'Conector Meta Ads é de 2a onda, ainda não implementado.' }),
    { status: 501, headers: { 'content-type': 'application/json' } }
  );
}
