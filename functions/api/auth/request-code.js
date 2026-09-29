import { authRateLimited, isAllowedNtuEmail, randomDigits } from "../../_shared/auth.js";
import { badRequest, json, methodNotAllowed, serverMisconfigured } from "../../_shared/http.js";
import { clientIp, hashSalt, hashValue } from "../../_shared/incidents.js";
import { sendVerificationEmail } from "../../_shared/smtp.js";

export async function onRequestPost({ request, env }) {
  let input;
  try {
    input = await request.json();
  } catch {
    return badRequest("invalid_json");
  }

  const email = String(input?.email || "").trim().toLowerCase();
  if (!isAllowedNtuEmail(email)) {
    return badRequest("invalid_email");
  }
  const salt = hashSalt(env);
  if (!salt) {
    return serverMisconfigured("missing_hash_salt");
  }
  if (await authRateLimited(request, env, email)) {
    return json({ error: "rate_limited" }, { status: 429 });
  }

  const code = env.DEV_EMAIL_CODE && env.ALLOW_DEV_AUTH === "true"
    ? env.DEV_EMAIL_CODE
    : randomDigits(6);
  const codeHash = await hashValue(`${email}:${code}`, salt);
  const ipHash = await hashValue(clientIp(request), salt);

  const insertResult = await env.DB.prepare(
    `INSERT INTO email_verification_codes (email, code_hash, ip_hash, expires_at)
     VALUES (?, ?, ?, datetime('now', '+10 minutes'))`,
  ).bind(email, codeHash, ipHash).run();

  try {
    await sendVerificationEmail(env, { to: email, code });
  } catch (error) {
    const insertedId = insertResult?.meta?.last_row_id;
    if (insertedId) {
      await env.DB.prepare("DELETE FROM email_verification_codes WHERE id = ?")
        .bind(insertedId)
        .run()
        .catch(() => {});
    }
    console.error("verification_email_failed", {
      message: error?.message,
      smtp_host: env.SMTP_HOST || "smtp.gmail.com",
      smtp_user: env.SMTP_USER || null,
      has_smtp_pass: Boolean(env.SMTP_PASS),
    });
    return json(
      {
        error: "email_send_failed",
        message: error?.message || "email_send_failed",
      },
      { status: 502 },
    );
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
}
