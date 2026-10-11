// Přihlášení do administrace: heslo z proměnné ADMIN_PASSWORD, podepsaná cookie (HMAC SHA-256).
import crypto from "node:crypto";

const SECRET = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const HOURS = 12;

function sign(payload) {
  const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const h = crypto.createHmac("sha256", SECRET()).update(b).digest("base64url");
  return `${b}.${h}`;
}
function verify(token) {
  if (!token || !SECRET()) return null;
  const [b, h] = token.split(".");
  if (!b || !h) return null;
  const exp = crypto.createHmac("sha256", SECRET()).update(b).digest("base64url");
  const a1 = Buffer.from(h), a2 = Buffer.from(exp);
  if (a1.length !== a2.length || !crypto.timingSafeEqual(a1, a2)) return null;
  try { const p = JSON.parse(Buffer.from(b, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export function passwordConfigured() { return !!process.env.ADMIN_PASSWORD; }
export function passwordOk(pw) {
  const want = Buffer.from(process.env.ADMIN_PASSWORD || "");
  const got = Buffer.from(String(pw || ""));
  return want.length > 0 && got.length === want.length && crypto.timingSafeEqual(got, want);
}
export function sessionCookie() {
  const token = sign({ role: "admin", exp: Date.now() + HOURS * 3600e3 });
  return `zk_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${HOURS * 3600}${process.env.VERCEL ? "; Secure" : ""}`;
}
export const clearCookie = () => `zk_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.VERCEL ? "; Secure" : ""}`;
export const isAdmin = (req) => !!verify(cookies(req).zk_admin);
export function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Nepřihlášeno" }));
  return false;
}
