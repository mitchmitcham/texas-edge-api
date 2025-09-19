// File: api/bookla-my-bookings.js
// Node runtime (Vercel default). Paste-in replacement.
// Adds coach/resource & service names using admin key, but fails safely.

export default async function handler(req, res) {
  // ---- CORS (preflight + simple) ----
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, x-api-key"
  )
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  // ---- Only POST (same as before) ----
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed. Use POST." })
    return
  }

  // ---- Read switch (?upcomingOnly=true) ----
  const upcomingOnly =
    String(req.query.upcomingOnly || "").toLowerCase() === "true"

  // ---- Env / constants ----
  const BASE = process.env.BOOKLA_BASE_URL || "https://us.bookla.com/api/v1"
  const COMPANY_ID = process.env.BOOKLA_COMPANY_ID
  const API_KEY_CLIENT = process.env.BOOKLA_API_KEY // used for client auth/login
  const API_KEY_ADMIN = process.env.BOOKLA_API_KEY_ADMIN // used for label enrichment (optional)

  // -----------------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------------
  const decodeOutseta = (authHeader) => {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null
    const token = authHeader.slice(7)
    try {
      const [, payloadB64] = token.split(".")
      const json = JSON.parse(Buffer.from(payloadB64, "base64url").toString())
      return {
        ok: true,
        sub: json.sub || null,
        email: json.email || null,
        raw: json,
        token,
      }
    } catch (e) {
      return { ok: false, error: "Failed to decode Outseta token" }
    }
  }

  const fetchJson = async (url, init = {}) => {
    const r = await fetch(url, init)
    const text = await r.text()
    let body = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = { raw: text }
    }
    return { ok: r.ok, status: r.status, body }
  }

  const booklaLogin = async (email, externalUserID) => {
    if (!COMPANY_ID || !API_KEY_CLIENT) {
      return { ok: false, error: "Missing Bookla env vars" }
    }
    const loginBody = { companyID: COMPANY_ID, email, externalUserID }
    const { ok, status, body } = await fetchJson(`${BASE}/client/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY_CLIENT },
      body: JSON.stringify(loginBody),
    })
    if (!ok) {
      return { ok: false, error: "Bookla login failed", status, data: body }
    }
    return { ok: true, tokens: body }
  }

  // Pull a big page of resources/services; if endpoint/perm absent, fail silently.
  const loadLabelMaps = async () => {
    const maps = { resources: {}, services: {} }
    if (!API_KEY_ADMIN || !COMPANY_ID) return maps // silently skip

    // Try resources
    try {
      const u = `${BASE}/companies/${COMPANY_ID}/resources?limit=200&offset=0`
      const { ok, body } = await fetchJson(u, {
        headers: { "X-Api-Key": API_KEY_ADMIN },
      })
      // Accept either { resources: [...] } or plain array fallback
      const rows = (body && (body.resources || body)) || []
      for (const r of rows) {
        if (r && r.id && r.name) maps.resources[r.id] = String(r.name)
      }
    } catch {}

    // Try services
    try {
      const u = `${BASE}/companies/${COMPANY_ID}/services?limit=200&offset=0`
      const { ok, body } = await fetchJson(u, {
        headers: { "X-Api-Key": API_KEY_ADMIN },
      })
      const rows = (body && (body.services || body)) || []
      for (const s of rows) {
        if (s && s.id && s.name) maps.services[s.id] = String(s.name)
      }
    } catch {}

    return maps
  }

  // -----------------------------------------------------------------------
  // 1) Outseta token
  // -----------------------------------------------------------------------
  const auth = req.headers.authorization || ""
  const decoded = decodeOutseta(auth)
  if (!decoded?.ok || !decoded.email || !decoded.sub) {
    res
      .status(401)
      .json({ ok: false, error: "Unauthorized (missing/invalid Outseta token)" })
    return
  }

  // -----------------------------------------------------------------------
  // 2) Bookla client login for this user
  // -----------------------------------------------------------------------
  const login = await booklaLogin(decoded.email, decoded.sub)
  if (!login.ok) {
    res
      .status(login.status || 500)
      .json({ ok: false, error: login.error, detail: login.data })
    return
  }

  // -----------------------------------------------------------------------
  // 3) Fetch bookings for the client
  // -----------------------------------------------------------------------
  const bookingsUrl = `${BASE}/client/bookings?status=scheduled`
  const r = await fetch(bookingsUrl, {
    headers: { Authorization: `Bearer ${login.tokens.accessToken}` },
  })
  const payload = await r.json().catch(() => ({}))
  if (!r.ok) {
    res
      .status(r.status)
      .json({ ok: false, error: "Bookla bookings failed", detail: payload })
    return
  }
  let bookings = Array.isArray(payload.bookings) ? payload.bookings : []

  // -----------------------------------------------------------------------
  // 4) Optional filter: upcoming & confirmed only
  // -----------------------------------------------------------------------
  if (upcomingOnly) {
    const now = new Date()
    bookings = bookings.filter((b) => {
      const starts = new Date(b.startTime)
      return b.status === "confirmed" && starts > now
    })
  }

  // -----------------------------------------------------------------------
  // 5) Enrich with service/resource names (safe to fail)
  // -----------------------------------------------------------------------
  let serviceMap = {}
  let resourceMap = {}
  try {
    const maps = await loadLabelMaps()
    serviceMap = maps.services || {}
    resourceMap = maps.resources || {}
  } catch {
    /* ignore, keep empty maps */
  }

  const enriched = bookings.map((b) => ({
    ...b,
    serviceName:
      b.serviceName ||
      (b.serviceID && serviceMap[b.serviceID]) ||
      null,
    resourceName:
      b.resourceName ||
      (b.resourceID && resourceMap[b.resourceID]) ||
      null,
  }))

  // -----------------------------------------------------------------------
  // 6) Sort ascending by start time and return
  // -----------------------------------------------------------------------
  enriched.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )

  res.status(200).json({
    ok: true,
    data: {
      total: enriched.length,
      bookings: enriched,
    },
  })
}

