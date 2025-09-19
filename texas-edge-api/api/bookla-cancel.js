import { applyCors } from "./_cors.js";

const BASE = process.env.BOOKLA_BASE_URL;
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
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ companyID: COMPANY_ID, email, externalUserID })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || "Bookla login failed");
  return data;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { bookingID } = req.body || {};
  if (!bookingID) return res.status(400).json({ error: "bookingID required" });

  // Outseta auth
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No Outseta token" });

  const payload = decodeJwtPayload(token);
  const email = payload.email;
  const externalUserID = payload.sub;

  // Bookla login
  let accessToken;
  try {
    const { accessToken: at } = await booklaLogin({ email, externalUserID });
    accessToken = at;
  } catch (e) {
    return res.status(401).json({ error: String(e.message || e) });
  }

  // Cancel
  const r = await fetch(`${BASE}/client/bookings/${bookingID}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-api-key": API_KEY
    }
  });

  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const msg = data?.message || r.statusText || "Cancel failed";
    return res.status(r.status).json({ ok: false, error: msg });
  }

  res.status(200).json({ ok: true, data });
}