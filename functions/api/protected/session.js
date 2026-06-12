import { getSessionEmail, isAdminEmail, isAllowedNtuEmail } from "../../_shared/auth.js";
import { json, serverMisconfigured } from "../../_shared/http.js";
import { hashSalt } from "../../_shared/incidents.js";

function safeReturnUrl(request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("return");
  if (!raw) return null;

  try {
    const target = new URL(raw, url.origin);
    return target.origin === url.origin ? target.toString() : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  if (!hashSalt(env)) {
    return serverMisconfigured("missing_hash_salt");
  }

  const email = await getSessionEmail(request, env);
  if (!isAllowedNtuEmail(email)) {
    return json({ authenticated: false }, { status: 401 });
  }

  const redirectTo = safeReturnUrl(request);
  if (redirectTo) {
    return Response.redirect(redirectTo, 302);
  }

  return json({ authenticated: true, email, admin: await isAdminEmail(email, env) });
}
