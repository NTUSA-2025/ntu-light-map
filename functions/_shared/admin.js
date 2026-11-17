import { getSessionEmail, isAllowedNtuEmail } from "./auth.js";
import { googleGroupsConfigured, isInAdminGroup } from "./google.js";
import { json } from "./http.js";

export async function requireAdmin(request, env) {
  const email = await getSessionEmail(request, env);
  if (!isAllowedNtuEmail(email)) {
    return { ok: false, response: json({ error: "unauthorized" }, { status: 401 }) };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.slice(normalizedEmail.lastIndexOf("@") + 1);
  // Legacy domain wildcards only apply until Google group checks are configured, so access
  // narrows to group members automatically instead of locking everyone out beforehand.
  const wildcard = googleGroupsConfigured(env) ? null : `*@${domain}`;
  const row = await env.DB.prepare(
    `SELECT 1 AS allowed
     FROM admin_users
     WHERE lower(email) = ? OR lower(email) = ?
     LIMIT 1`,
  ).bind(normalizedEmail, wildcard).first();
  if (row) {
    return { ok: true, email: normalizedEmail, via: "whitelist" };
  }

  let groupMember = false;
  try {
    groupMember = await isInAdminGroup(env, normalizedEmail);
  } catch (error) {
    // A Google outage must not grant access; exact whitelist entries above keep working.
    console.error("admin_group_check_failed", { message: error?.message });
  }
  if (!groupMember) {
    return { ok: false, response: json({ error: "admin_forbidden" }, { status: 403 }) };
  }

  return { ok: true, email: normalizedEmail, via: "group" };
}

// New whitelist entries must be exact NTU emails; domain-wide access comes from Google groups.
export function normalizeAdminWhitelistEntry(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.includes("*")) return null;
  return isAllowedNtuEmail(email) ? email : null;
}

// Deletion also accepts legacy wildcard rows so they can be cleaned up from the UI.
export function normalizeRemovableWhitelistEntry(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.startsWith("*@") && !email.slice(2).includes("*")) return email;
  return normalizeAdminWhitelistEntry(email);
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
