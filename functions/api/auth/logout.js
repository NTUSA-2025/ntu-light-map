import { clearSessionCookie, destroySession } from "../../_shared/auth.js";
import { json, methodNotAllowed } from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  try {
    await destroySession(request, env);
  } catch (error) {
    console.error("logout_destroy_session_failed", { message: error?.message });
  }

  return json(
    { ok: true, authenticated: false },
    { headers: { "set-cookie": clearSessionCookie() } },
  );
}

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
}
