import { getSessionEmail, isAllowedNtuEmail } from "../../_shared/auth.js";
import { badRequest, json, methodNotAllowed } from "../../_shared/http.js";
import {
  clientIp,
  hashValue,
  publicIncident,
  validateIncidentInput,
} from "../../_shared/incidents.js";

const RATE_LIMIT_COUNT = 5;

export async function onRequestPost({ request, env }) {
  const email = await getSessionEmail(request, env);
  if (!isAllowedNtuEmail(email)) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const validated = validateIncidentInput(input);
  if (!validated.ok) {
    return badRequest("invalid_incident", validated.errors);
  }

  const salt = env.HASH_SALT || "";
  const reporterHash = await hashValue(email, salt);
  const ipHash = await hashValue(clientIp(request), salt);

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM incidents
     WHERE created_at >= datetime('now', '-10 minutes')
       AND (reporter_email_hash = ? OR ip_hash = ?)`,
  ).bind(reporterHash, ipHash).first();

  if (Number(recent?.count || 0) >= RATE_LIMIT_COUNT) {
    return json({ error: "rate_limited" }, { status: 429 });
  }

  const incident = validated.incident;
  const result = await env.DB.prepare(
    `INSERT INTO incidents
      (hex_id, lat, lng, type, description, status, reporter_email_hash, ip_hash)
     VALUES (?, ?, ?, ?, ?, 'public', ?, ?)
     RETURNING id, hex_id, lat, lng, type, description, created_at`,
  )
    .bind(
      incident.hex_id,
      incident.lat,
      incident.lng,
      incident.type,
      incident.description,
      reporterHash,
      ipHash,
    )
    .first();

  return json({ incident: publicIncident(result) }, { status: 201 });
}

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
}

export function onRequestOptions() {
  return methodNotAllowed(["POST"]);
}
