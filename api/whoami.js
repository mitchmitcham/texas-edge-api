import { applyCors } from "./_cors.js";

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  const json = Buffer.from(parts[1], "base64url").toString();
  try { return JSON.parse(json); } catch { return {}; }
}

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  const payload = decodeJwtPayload(token);
  res.status(200).json({
    ok: true,
    sub: payload.sub || null,
    email: payload.email || null,
    rawPayload: payload
  });
}
