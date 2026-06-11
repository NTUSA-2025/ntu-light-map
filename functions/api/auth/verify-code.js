import { createSession, isAdminEmail, isAllowedNtuEmail, sessionCookie } from "../../_shared/auth.js";
import { badRequest, json, methodNotAllowed, serverMisconfigured } from "../../_shared/http.js";
import { hashSalt, hashValue } from "../../_shared/incidents.js";

export async function onRequestPost({ request, env }) {
  let input;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const email = String(input?.email || "").trim().toLowerCase();
  const code = String(input?.code || "").trim();
  if (!isAllowedNtuEmail(email) || !/^\d{6}$/.test(code)) {
    return badRequest("invalid_code");
  }
  const salt = hashSalt(env);
  if (!salt) {
    return serverMisconfigured("missing_hash_salt");
  }

  const row = await env.DB.prepare(
    `SELECT id, code_hash, attempts
     FROM email_verification_codes
     WHERE email = ?
       AND consumed_at IS NULL
       AND expires_at > datetime('now')
     ORDER BY created_at DESC
     LIMIT 1`,
  ).bind(email).first();

  if (!row || Number(row.attempts || 0) >= 5) {
    return json({ error: "invalid_code" }, { status: 401 });
  }

  const codeHash = await hashValue(`${email}:${code}`, salt);
  if (row.code_hash !== codeHash) {
    await env.DB.prepare(
      `UPDATE email_verification_codes
       SET attempts = attempts + 1
       WHERE id = ?`,
    ).bind(row.id).run();
    return json({ error: "invalid_code" }, { status: 401 });
  }

  await env.DB.prepare(
    `UPDATE email_verification_codes
     SET consumed_at = datetime('now'), attempts = attempts + 1
     WHERE id = ?`,
  ).bind(row.id).run();

  const token = await createSession(env, email);
  return json(
    { authenticated: true, email, admin: isAdminEmail(email, env) },
    { headers: { "set-cookie": sessionCookie(token) } },
  );
}

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
}
