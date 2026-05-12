export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function methodNotAllowed(allowed) {
  return json(
    { error: "method_not_allowed", allowed },
    {
      status: 405,
      headers: { allow: allowed.join(", ") },
    },
  );
}

export function badRequest(message, details = undefined) {
  return json({ error: "bad_request", message, details }, { status: 400 });
}
