import { json, methodNotAllowed } from "../_shared/http.js";
import { publicIncident } from "../_shared/incidents.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT id, hex_id, lat, lng, type, description, created_at
     FROM incidents
     WHERE status = 'public'
     ORDER BY created_at DESC
     LIMIT 500`,
  ).all();

  return json({ incidents: results.map(publicIncident) });
}

export function onRequestPost() {
  return methodNotAllowed(["GET"]);
}

export function onRequestOptions() {
  return methodNotAllowed(["GET"]);
}
