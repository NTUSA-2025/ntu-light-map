import { getSessionEmail, isAdminEmail, isAllowedNtuEmail } from "./auth.js";
import { json, serverMisconfigured } from "./http.js";
import { hashSalt } from "./incidents.js";

export async function requireAdmin(request, env) {
  if (!hashSalt(env)) {
    return { ok: false, response: serverMisconfigured("missing_hash_salt") };
  }

  const email = await getSessionEmail(request, env);
  if (!isAllowedNtuEmail(email)) {
    return { ok: false, response: json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!(await isAdminEmail(email, env))) {
    return { ok: false, response: json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, email };
}

export function adminUser(row) {
  return {
    email: row.email,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}
