const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DIRECTORY_URL = "https://admin.googleapis.com/admin/directory/v1";
const SCOPE = "https://www.googleapis.com/auth/admin.directory.group.readonly";
const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;

// Per-isolate caches: Workers reuse isolates between requests, so these cut most Google calls.
let cachedToken = null;
const membershipCache = new Map();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlJson(value) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function privateKeyBytes(pem) {
  // Secrets pasted from the service account JSON often keep literal "\n" sequences or wrapping quotes.
  const body = String(pem)
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

function googleGroupsConfigured(env) {
  return Boolean(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      && env.GOOGLE_PRIVATE_KEY
      && env.GOOGLE_WORKSPACE_ADMIN_EMAIL
      && adminGroupEmails(env).length,
  );
}

export function adminGroupEmails(env) {
  return String(env.ADMIN_GROUP_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  // Service-account JWT with domain-wide delegation: `sub` is the Workspace admin being impersonated.
  const unsigned = `${base64UrlJson({ alg: "RS256", typ: "JWT" })}.${base64UrlJson({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    sub: env.GOOGLE_WORKSPACE_ADMIN_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  let key;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      privateKeyBytes(env.GOOGLE_PRIVATE_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    // Usually a truncated or mangled paste of `private_key`; never log the key itself.
    throw new Error(`google_private_key_invalid: ${error?.name || "error"}`);
  }
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) {
    console.error("google_token_failed", response.status, await response.text());
    throw new Error(`google_token_failed_${response.status}`);
  }
  const data = await response.json();
  cachedToken = { value: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return cachedToken.value;
}

async function hasMember(token, groupEmail, email) {
  const url = `${DIRECTORY_URL}/groups/${encodeURIComponent(groupEmail)}/hasMember/${encodeURIComponent(email)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  // Google answers 400 for addresses it cannot resolve as members; treat that as "not a member".
  if (response.status === 400 || response.status === 404) return false;
  if (!response.ok) {
    console.error("google_has_member_failed", groupEmail, response.status, await response.text());
    throw new Error(`google_has_member_failed_${response.status}`);
  }
  const data = await response.json();
  return data.isMember === true;
}

// True when `email` belongs (directly or through nested groups) to any group in ADMIN_GROUP_EMAILS.
export async function isInAdminGroup(env, email) {
  if (!googleGroupsConfigured(env)) return false;

  const cached = membershipCache.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.isMember;

  const token = await accessToken(env);
  let isMember = false;
  for (const groupEmail of adminGroupEmails(env)) {
    if (await hasMember(token, groupEmail, email)) {
      isMember = true;
      break;
    }
  }
  membershipCache.set(email, { isMember, expiresAt: Date.now() + MEMBERSHIP_TTL_MS });
  return isMember;
}
