// POST /api/admin-check: confere a chave de administrador sem mutar nada.
// A lógica e a decisão de segurança estão em functions/lib/admin-check.mjs.
import { checarAdmin } from '../lib/admin-check.mjs';

export async function onRequest(context) {
  return checarAdmin(context.env, context.request);
}
