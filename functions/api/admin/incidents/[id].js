import { getSessionEmail, isAdminEmail, isAllowedNtuEmail } from "../../../_shared/auth.js";
import { badRequest, json, methodNotAllowed, serverMisconfigured } from "../../../_shared/http.js";
import { adminIncident, hashSalt } from "../../../_shared/incidents.js";

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

export async function onRequestDelete({ request, env, params }) {
  if (!hashSalt(env)) {
    return serverMisconfigured("missing_hash_salt");
  }

  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return badRequest("invalid_incident_id");
  }

  const result = await env.DB.prepare(
    `UPDATE incidents
     SET status = 'hidden'
     WHERE id = ?
     RETURNING id, report_hex_id, lat, lng, type, description, status, created_at`,
  ).bind(id).first();

  if (!result) {
    return json({ error: "not_found" }, { status: 404 });
  }

  return json({ incident: adminIncident(result) });
}

export function onRequestGet() {
  return methodNotAllowed(["DELETE"]);
}

export function onRequestPost() {
  return methodNotAllowed(["DELETE"]);
}
