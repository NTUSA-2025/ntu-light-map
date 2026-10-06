import { requireAdmin, adminIncident } from "../../../_shared/admin.js";
import { json, methodNotAllowed } from "../../../_shared/http.js";

export async function onRequestGet({ request, env }) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return access.response;

  const { results } = await env.DB.prepare(
    `SELECT id, report_hex_id, lat, lng, type, description, status,
            reporter_email, followup_requested, created_at
     FROM incidents
     ORDER BY created_at DESC, id DESC`,
  ).all();

  return json({ incidents: results.map(adminIncident) });
}

export function onRequestPost() {
  return methodNotAllowed(["GET"]);
}

export function onRequestOptions() {
  return methodNotAllowed(["GET"]);
}
