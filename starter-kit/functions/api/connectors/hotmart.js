// Conector Hotmart (2a onda, ainda não implementado).
// Quando implementado, deve autenticar na API da Hotmart, buscar as vendas
// (histórico de transações) e devolver um DataSet no mesmo formato do Contrato 1
// ({ columns, rows, meta:{ source:'hotmart', ... } }).
export async function onRequest() {
  return new Response(
    JSON.stringify({ error: 'Conector Hotmart é de 2a onda, ainda não implementado.' }),
    { status: 501, headers: { 'content-type': 'application/json' } }
  );
}
