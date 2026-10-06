import { requireAdmin, adminIncident } from "../../../_shared/admin.js";
import { badRequest, json, methodNotAllowed } from "../../../_shared/http.js";

const TYPES = new Set(["accident", "harassment"]);
const STATUSES = new Set(["public", "hidden"]);
const ADMIN_INCIDENT_SELECT = `SELECT id, report_hex_id, lat, lng, type, description, status,
                                     reporter_email, followup_requested, created_at
                              FROM incidents
                              WHERE id = ?`;

function incidentId(params) {
  const id = Number(params?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function onRequestPatch({ request, env, params }) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return access.response;

  const id = incidentId(params);
  if (!id) return badRequest("invalid_incident_id");

  let input;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid_json");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return badRequest("invalid_incident_update");
  }

  const current = await env.DB.prepare(ADMIN_INCIDENT_SELECT).bind(id).first();
  if (!current) return json({ error: "incident_not_found" }, { status: 404 });

  const assignments = [];
  const values = [];
  if (Object.hasOwn(input, "type")) {
    if (!TYPES.has(input.type)) return badRequest("invalid_type");
    assignments.push("type = ?");
    values.push(input.type);
  }
  if (Object.hasOwn(input, "description")) {
    if (typeof input.description !== "string") return badRequest("invalid_description");
    const description = input.description.trim();
    if (description.length < 1 || description.length > 300) {
      return badRequest("invalid_description");
    }
    assignments.push("description = ?");
    values.push(description);
  }
  if (Object.hasOwn(input, "status")) {
    if (!STATUSES.has(input.status)) return badRequest("invalid_status");
    assignments.push("status = ?");
    values.push(input.status);
  }
  if (assignments.length === 0) return badRequest("no_editable_fields");

  await env.DB.prepare(`UPDATE incidents SET ${assignments.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();

  const updated = await env.DB.prepare(ADMIN_INCIDENT_SELECT).bind(id).first();
  return json({ incident: adminIncident(updated) });
}

export async function onRequestDelete({ request, env, params }) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return access.response;

  const id = incidentId(params);
  if (!id) return badRequest("invalid_incident_id");

  const current = await env.DB.prepare("SELECT id FROM incidents WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "incident_not_found" }, { status: 404 });

  await env.DB.prepare("DELETE FROM incidents WHERE id = ?").bind(id).run();
  return json({ deleted: true, id });
}

export function onRequestGet() {
  return methodNotAllowed(["PATCH", "DELETE"]);
}

export function onRequestPost() {
  return methodNotAllowed(["PATCH", "DELETE"]);
}

export function onRequestOptions() {
  return methodNotAllowed(["PATCH", "DELETE"]);
}
