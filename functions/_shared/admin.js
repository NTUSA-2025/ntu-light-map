import { getSessionEmail, isAllowedNtuEmail } from "./auth.js";
import { json } from "./http.js";

export async function requireAdmin(request, env) {
  const email = await getSessionEmail(request, env);
  if (!isAllowedNtuEmail(email)) {
    return { ok: false, response: json({ error: "unauthorized" }, { status: 401 }) };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.slice(normalizedEmail.lastIndexOf("@") + 1);
  const row = await env.DB.prepare(
    `SELECT 1 AS allowed
     FROM admin_users
     WHERE lower(email) = ? OR lower(email) = ?
     LIMIT 1`,
  ).bind(normalizedEmail, `*@${domain}`).first();

  if (!row) {
    return { ok: false, response: json({ error: "admin_forbidden" }, { status: 403 }) };
  }

  return { ok: true, email: normalizedEmail };
}
export function normalizeAdminWhitelistEntry(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email === "*@ntusa.ntu.edu.tw") return email;
  if (email.includes("*")) return null;
  return isAllowedNtuEmail(email) ? email : null;
}

export function whitelistEntryMatches(entry, email) {
  const normalizedEntry = String(entry || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEntry || !normalizedEmail) return false;
  if (normalizedEntry.startsWith("*@")) {
    return normalizedEmail.slice(normalizedEmail.lastIndexOf("@") + 1) === normalizedEntry.slice(2);
  }
  return normalizedEntry === normalizedEmail;
}

export function adminIncident(row) {
  return {
    id: row.id,
    report_hex_id: row.report_hex_id,
    lat: row.lat,
    lng: row.lng,
    type: row.type,
    description: row.description,
    status: row.status,
    reporter_email: row.reporter_email || "",
    followup_requested: Boolean(row.followup_requested),
    created_at: row.created_at,
  };
}
