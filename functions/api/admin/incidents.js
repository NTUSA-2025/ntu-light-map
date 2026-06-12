import { requireAdmin } from "../../_shared/admin.js";
import { json, methodNotAllowed } from "../../_shared/http.js";
import { adminIncident } from "../../_shared/incidents.js";

export async function onRequestGet({ request, env }) {
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
