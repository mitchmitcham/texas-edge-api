export function applyCors(req, res) {
  // Allowed origins – add/remove as needed
  const allowed = [
    "https://www.texasedgesports.com",
    "https://texasedgesports.com",
    "https://framerusercontent.com",
    "https://*.framer.website",
    "https://*.framer.app"
  ];

  const origin = req.headers.origin || "*";
  const allowOrigin =
    origin && allowed.some(a => {
      if (a === origin) return true;
      if (a.startsWith("https://*.")) {
        const base = a.replace("https://*.", "");
        return origin.endsWith("." + base);
      }
      return false;
    })
      ? origin
      : "*"; // <- during debugging; tighten later

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Requested-With"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
