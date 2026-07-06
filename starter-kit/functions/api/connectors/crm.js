// Conector de CRM (2a onda, ainda não implementado).
// Quando implementado, deve consultar a API do CRM (deals, contatos, etapas) e
// devolver um DataSet no mesmo formato do Contrato 1
// ({ columns, rows, meta:{ source:'crm', ... } }).
export async function onRequest() {
  return new Response(
    JSON.stringify({ error: 'Conector CRM é de 2a onda, ainda não implementado.' }),
    { status: 501, headers: { 'content-type': 'application/json' } }
  );
}
