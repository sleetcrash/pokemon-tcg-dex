// Same-origin proxy for TCGdex so the browser never makes a cross-origin request.
// GET /api/tcg?path=dex-ids/6   ->   https://api.tcgdex.net/v2/en/dex-ids/6
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const path = String(req.query.path || "");
  if (!/^[A-Za-z0-9/_?=&%.-]{1,200}$/.test(path) || path.includes("..")) {
    return res.status(400).json({ error: "bad path" });
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch("https://api.tcgdex.net/v2/en/" + path, {
      headers: { "User-Agent": "national-card-dex/1.0", Accept: "application/json" },
      signal: ac.signal,
    });
    const body = await r.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(r.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: e.name === "AbortError" ? "upstream timeout" : "upstream error" });
  } finally {
    clearTimeout(t);
  }
}
