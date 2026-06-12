import { adminUser, requireAdmin } from "../../../_shared/admin.js";
import { badRequest, json, methodNotAllowed } from "../../../_shared/http.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export async function onRequestDelete({ request, env, params }) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const email = normalizeEmail(params.email);
  if (!email) {
    return badRequest("invalid_email");
  }

  const result = await env.DB.prepare(
    `DELETE FROM admin_users
     WHERE email = ?
       AND (SELECT COUNT(*) FROM admin_users) > 1
     RETURNING email, created_by, created_at`,
  ).bind(email).first();

  if (!result) {
    const existing = await env.DB.prepare(
      `SELECT email
       FROM admin_users
       WHERE email = ?`,
    ).bind(email).first();
    if (existing) {
      return json({ error: "cannot_remove_last_admin" }, { status: 409 });
    }
    return json({ error: "not_found" }, { status: 404 });
  }

  return json({ admin: adminUser(result) });
}

export function onRequestGet() {
  return methodNotAllowed(["DELETE"]);
}

export function onRequestPost() {
  return methodNotAllowed(["DELETE"]);
}
