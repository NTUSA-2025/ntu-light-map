import { requireAdmin } from "../../../_shared/admin.js";
import { badRequest, json, methodNotAllowed } from "../../../_shared/http.js";
import { adminIncident } from "../../../_shared/incidents.js";

export async function onRequestDelete({ request, env, params }) {
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
