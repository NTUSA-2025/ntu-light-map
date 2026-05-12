import { getSessionEmail, isAllowedNtuEmail } from "../../_shared/auth.js";
import { json } from "../../_shared/http.js";

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
  const email = await getSessionEmail(request, env);
  if (!isAllowedNtuEmail(email)) {
    return json({ authenticated: false }, { status: 401 });
  }

  const redirectTo = safeReturnUrl(request);
  if (redirectTo) {
    return Response.redirect(redirectTo, 302);
  }

  return json({ authenticated: true, email });
}
