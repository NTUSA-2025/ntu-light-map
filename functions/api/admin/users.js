import { adminUser, requireAdmin } from "../../_shared/admin.js";
import { isAllowedNtuEmail } from "../../_shared/auth.js";
import { badRequest, json, methodNotAllowed } from "../../_shared/http.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  const { results } = await env.DB.prepare(
    `SELECT email, created_by, created_at
     FROM admin_users
     ORDER BY created_at DESC`,
  ).all();

  return json({ admins: results.map(adminUser) });
}

export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  let input;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const email = normalizeEmail(input?.email);
  if (!isAllowedNtuEmail(email)) {
    return badRequest("invalid_email");
  }

  await env.DB.prepare(
    `INSERT INTO admin_users (email, created_by)
     VALUES (?, ?)
     ON CONFLICT(email) DO NOTHING`,
  ).bind(email, admin.email).run();

  const result = await env.DB.prepare(
    `SELECT email, created_by, created_at
     FROM admin_users
     WHERE email = ?`,
  ).bind(email).first();

  return json({ admin: adminUser(result) }, { status: 201 });
}

export function onRequestDelete() {
  return methodNotAllowed(["GET", "POST"]);
}
