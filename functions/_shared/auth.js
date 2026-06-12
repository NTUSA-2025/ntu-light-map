import { clientIp, hashSalt, hashValue, requireHashSalt } from "./incidents.js";

const SESSION_COOKIE = "ntu_light_map_session";
const SESSION_DAYS = 30;

export function isAllowedNtuEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@ntu.edu.tw");
}

export async function isAdminEmail(email, env) {
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const admin = await env.DB.prepare(
    `SELECT email
     FROM admin_users
     WHERE email = ?`,
  ).bind(normalized).first();

  return Boolean(admin);
}

export function randomDigits(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseCookies(request) {
  const cookie = request.headers.get("cookie") || "";
  return Object.fromEntries(cookie.split(";").map((part) => {
    const [name, ...value] = part.trim().split("=");
    return [name, value.join("=")];
  }).filter(([name]) => name));
}

export function sessionCookie(token, maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    "Secure",
  ].join("; ");
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Secure",
  ].join("; ");
}

export async function createSession(env, email) {
  const token = randomToken();
  const salt = requireHashSalt(env);
  const tokenHash = await hashValue(token, salt);
  const emailHash = await hashValue(email, salt);

  await env.DB.prepare(
    `INSERT INTO auth_sessions (token_hash, email, email_hash, expires_at)
     VALUES (?, ?, ?, datetime('now', '+30 days'))`,
  ).bind(tokenHash, email, emailHash).run();

  return token;
}

export async function getSessionEmail(request, env) {
  if (env.ALLOW_DEV_AUTH === "true" && env.DEV_USER_EMAIL) {
    return env.DEV_USER_EMAIL.toLowerCase();
  }

  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  const tokenHash = await hashValue(token, requireHashSalt(env));
  const session = await env.DB.prepare(
    `SELECT email
     FROM auth_sessions
     WHERE token_hash = ?
       AND expires_at > datetime('now')`,
  ).bind(tokenHash).first();

  return session?.email?.toLowerCase() || null;
}

export async function destroySession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  const salt = hashSalt(env);
  if (!token || !salt || !env.DB) return;

  const tokenHash = await hashValue(token, salt);
  await env.DB.prepare(
    `DELETE FROM auth_sessions
     WHERE token_hash = ?`,
  ).bind(tokenHash).run();
}

export async function authRateLimited(request, env, email) {
  const ipHash = await hashValue(clientIp(request), requireHashSalt(env));
  const emailRecent = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM email_verification_codes
     WHERE email = ?
       AND created_at >= datetime('now', '-10 minutes')`,
  ).bind(email).first();
  const ipRecent = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM email_verification_codes
     WHERE ip_hash = ?
       AND created_at >= datetime('now', '-10 minutes')`,
  ).bind(ipHash).first();

  return Number(emailRecent?.count || 0) >= 3 || Number(ipRecent?.count || 0) >= 8;
}
