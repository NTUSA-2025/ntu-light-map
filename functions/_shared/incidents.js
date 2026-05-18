import { REPORT_HEX_IDS } from "./reportHexIds.js";

export const INCIDENT_TYPES = new Set([
  "accident",
  "harassment",
]);

export function validateIncidentInput(input) {
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  const reportHexId = Number(input?.report_hex_id);
  const type = String(input?.type || "");
  const description = String(input?.description || "").trim();

  const errors = {};
  if (!Number.isInteger(reportHexId) || !REPORT_HEX_IDS.has(reportHexId)) {
    errors.report_hex_id = "invalid_report_hex_id";
  }
  if (!Number.isFinite(lat) || lat < 25.01 || lat > 25.026) {
    errors.lat = "lat_out_of_bounds";
  }
  if (!Number.isFinite(lng) || lng < 121.53 || lng > 121.549) {
    errors.lng = "lng_out_of_bounds";
  }
  if (!INCIDENT_TYPES.has(type)) {
    errors.type = "invalid_type";
  }
  if (description.length < 1 || description.length > 300) {
    errors.description = "description_length";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    incident: {
      report_hex_id: reportHexId,
      lat,
      lng,
      type,
      description,
    },
  };
}

export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return request.headers.get("cf-connecting-ip") || forwarded?.split(",")[0]?.trim() || "unknown";
}

export function hashSalt(env) {
  const salt = typeof env?.HASH_SALT === "string" ? env.HASH_SALT.trim() : "";
  return salt || null;
}

export function requireHashSalt(env) {
  const salt = hashSalt(env);
  if (!salt) {
    throw new Error("missing_hash_salt");
  }
  return salt;
}

export async function hashValue(value, salt) {
  const normalizedSalt = typeof salt === "string" ? salt.trim() : "";
  if (!normalizedSalt) {
    throw new Error("missing_hash_salt");
  }
  const data = new TextEncoder().encode(`${normalizedSalt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function publicIncident(row) {
  return {
    id: row.id,
    report_hex_id: row.report_hex_id,
    lat: row.lat,
    lng: row.lng,
    type: row.type,
    description: row.description,
    created_at: row.created_at,
  };
}
