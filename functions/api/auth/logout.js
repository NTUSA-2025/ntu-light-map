import { clearSessionCookie, destroySession } from "../../_shared/auth.js";
import { json, methodNotAllowed } from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  await destroySession(request, env);
  return json(
    { ok: true, authenticated: false },
    { headers: { "set-cookie": clearSessionCookie() } },
  );
}

export function onRequestGet() {
  return methodNotAllowed(["POST"]);
}
