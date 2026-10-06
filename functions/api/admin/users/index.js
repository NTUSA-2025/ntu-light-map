import { requireAdmin, normalizeAdminWhitelistEntry, whitelistEntryMatches } from "../../../_shared/admin.js";
import { badRequest, json, methodNotAllowed } from "../../../_shared/http.js";

export async function onRequestGet({ request, env }) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return access.response;

  const { results } = await env.DB.prepare(
    `SELECT email, created_by, created_at
     FROM admin_users
     ORDER BY email COLLATE NOCASE ASC`,
  ).all();

  return json({ users: results });
}

export async function onRequestPost({ request, env }) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return access.response;

  let input;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const email = normalizeAdminWhitelistEntry(input?.email);
  if (!email) return badRequest("invalid_whitelist_email");

  const existing = await env.DB.prepare(
    "SELECT 1 AS found FROM admin_users WHERE lower(email) = ? LIMIT 1",
  ).bind(email).first();
  if (existing) return json({ error: "whitelist_entry_exists" }, { status: 409 });

  try {
    await env.DB.prepare(
      "INSERT INTO admin_users (email, created_by) VALUES (?, ?)",
    ).bind(email, access.email).run();
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return json({ error: "whitelist_entry_exists" }, { status: 409 });
    }
    throw error;
  }

  const user = await env.DB.prepare(
    "SELECT email, created_by, created_at FROM admin_users WHERE lower(email) = ? LIMIT 1",
  ).bind(email).first();
  return json({ user }, { status: 201 });
}

export async function onRequestDelete({ request, env }) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return access.response;

  let input;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const email = normalizeAdminWhitelistEntry(input?.email);
  if (!email) return badRequest("invalid_whitelist_email");

  const { results } = await env.DB.prepare(
    "SELECT lower(email) AS email FROM admin_users",
  ).all();
  const remaining = results.filter(user => user.email !== email);
  if (remaining.length === 0) {
    return json({ error: "cannot_remove_last_whitelist_entry" }, { status: 409 });
  }
  if (!remaining.some(user => normalizeAdminWhitelistEntry(user.email)
    && whitelistEntryMatches(user.email, access.email))) {
    return json({ error: "cannot_remove_current_access" }, { status: 409 });
  }

  const deletion = await env.DB.prepare(
    "DELETE FROM admin_users WHERE lower(email) = ?",
  ).bind(email).run();
  if (!Number(deletion.meta?.changes || 0)) {
    return json({ error: "whitelist_entry_not_found" }, { status: 404 });
  }
  return json({ deleted: true, email });
}

export function onRequestOptions() {
  return methodNotAllowed(["GET", "POST", "DELETE"]);
}

