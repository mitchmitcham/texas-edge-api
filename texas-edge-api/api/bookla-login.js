import { applyCors } from "./_cors.js";

const BASE = process.env.BOOKLA_BASE_URL;  // e.g. https://us.bookla.com/api/v1
const COMPANY_ID = process.env.BOOKLA_COMPANY_ID;
const API_KEY = process.env.BOOKLA_API_KEY;

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString()); }
  catch { return {}; }
}

async function booklaLogin({ email, externalUserID }) {
  const r = await fetch(`${BASE}/client/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify({
      companyID: COMPANY_ID,
      email,
      externalUserID
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.message || r.statusText || "Bookla login failed";
    throw new Error(`Bookla login: ${r.status} ${msg}`);
  }
  return data; // { accessToken, refreshToken, ... }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No Outseta token" });

  const payload = decodeJwtPayload(token);
  const email = payload.email;
  const externalUserID = payload.sub;
  if (!email || !externalUserID) {
    return res.status(400).json({ error: "Token missing email/sub" });
  }

  try {
    const data = await booklaLogin({ email, externalUserID });
    res.status(200).json({ ok: true, data });
  } catch (e) {
    res.status(401).json({ ok: false, error: String(e.message || e) });
  }
}