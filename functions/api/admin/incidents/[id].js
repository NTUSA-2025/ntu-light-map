import { requireAdmin } from "../../../_shared/admin.js";
import { badRequest, json, methodNotAllowed } from "../../../_shared/http.js";
import { adminIncident } from "../../../_shared/incidents.js";

const INCIDENT_STATUSES = new Set(["public", "hidden"]);

function parseIncidentId(params) {
  const id = Number(params.id);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

async function updateIncidentStatus(env, id, status) {
  const result = await env.DB.prepare(
    `UPDATE incidents
     SET status = ?
     WHERE id = ?
     RETURNING id, report_hex_id, lat, lng, type, description, status, created_at`,
  ).bind(status, id).first();

  if (!result) {
    return json({ error: "not_found" }, { status: 404 });
  }

  return json({ incident: adminIncident(result) });
}

export async function onRequestPatch({ request, env, params }) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const id = parseIncidentId(params);
  if (!id) {
    return badRequest("invalid_incident_id");
  }

  const input = await request.json().catch(() => ({}));
  const status = String(input?.status || "");
  if (!INCIDENT_STATUSES.has(status)) {
    return badRequest("invalid_status");
  }

  return updateIncidentStatus(env, id, status);
}

export async function onRequestDelete({ request, env, params }) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const id = parseIncidentId(params);
  if (!id) {
    return badRequest("invalid_incident_id");
  }

  return updateIncidentStatus(env, id, "hidden");
}

export function onRequestGet() {
  return methodNotAllowed(["DELETE", "PATCH"]);
}

export function onRequestPost() {
  return methodNotAllowed(["DELETE", "PATCH"]);
}
