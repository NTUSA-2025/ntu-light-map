import { getSessionEmail, isAdminEmail, isAllowedNtuEmail } from "../../_shared/auth.js";
import { json, methodNotAllowed, serverMisconfigured } from "../../_shared/http.js";
import { adminIncident, hashSalt } from "../../_shared/incidents.js";

async function requireAdmin(request, env) {
  const email = await getSessionEmail(request, env);
  if (!isAllowedNtuEmail(email)) {
    return { ok: false, response: json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!isAdminEmail(email, env)) {
    return { ok: false, response: json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, email };
}

export async function onRequestGet({ request, env }) {
  if (!hashSalt(env)) {
    return serverMisconfigured("missing_hash_salt");
  }

  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const { results } = await env.DB.prepare(
    `SELECT id, report_hex_id, lat, lng, type, description, status, created_at
     FROM incidents
     ORDER BY created_at DESC
     LIMIT 500`,
  ).all();

  return json({ incidents: results.map(adminIncident) });
}

export function onRequestPost() {
  return methodNotAllowed(["GET"]);
}

export function onRequestDelete() {
  return methodNotAllowed(["GET"]);
}
