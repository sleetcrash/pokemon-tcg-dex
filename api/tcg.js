// Same-origin proxy for the card lookup so the browser never makes a cross-origin request.
// Primary: TCGdex. Fallback: pokemontcg.io, mapped to the TCGdex response shape.
// GET /api/tcg?path=dex-ids/6   ->   https://api.tcgdex.net/v2/en/dex-ids/6

const TCGDEX = "https://api.tcgdex.net/v2/en/";
const PTCG = "https://api.pokemontcg.io/v2/";
const UA = { "User-Agent": "national-card-dex/1.0", Accept: "application/json" };

// Circuit breaker: after TCGdex times out or 5xxes, warm invocations skip the
// dead probe and go straight to the fallback instead of paying it per request.
let tcgdexDownUntil = 0;
const cooldown = () => Number(process.env.TCGDEX_COOLDOWN_MS ?? 60000);

async function get(url, ms, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { headers, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function ptcgHeaders() {
  const h = { ...UA };
  if (process.env.POKEMONTCG_API_KEY) h["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  return h;
}

// pokemontcg.io images are {base}.png / {base}_hires.png; the client derives both from the base.
const imgBase = (c) => (c.images && c.images.small ? c.images.small.replace(/\.png$/, "") : null);
const isoDate = (s) => (s ? s.replace(/\//g, "-") : undefined);
const stageOf = (c) => {
  const st = (c.subtypes || []).find((s) => s === "Basic" || s.startsWith("Stage "));
  return st ? st.replace(" ", "") : undefined;
};

function brief(c) {
  return {
    id: c.id,
    localId: c.number,
    name: c.name,
    image: imgBase(c),
    rarity: c.rarity,
    stage: stageOf(c),
    subtypes: c.subtypes,
    set: c.set && { id: c.set.id, name: c.set.name, releaseDate: isoDate(c.set.releaseDate) },
  };
}

function detail(c) {
  const prices = (c.tcgplayer && c.tcgplayer.prices) || {};
  const tcgplayer = {};
  if (prices.holofoil) tcgplayer.holofoil = { marketPrice: prices.holofoil.market };
  if (prices.normal) tcgplayer.normal = { marketPrice: prices.normal.market };
  if (prices.reverseHolofoil) tcgplayer["reverse-holofoil"] = { marketPrice: prices.reverseHolofoil.market };
  return {
    ...brief(c),
    tcgUrl: (c.tcgplayer && c.tcgplayer.url) || undefined,
    illustrator: c.artist,
    attacks: (c.attacks || []).map((a) => ({ name: a.name, damage: a.damage, text: a.text })),
    pricing: Object.keys(tcgplayer).length ? { tcgplayer } : undefined,
  };
}

// pokemontcg.io 502s intermittently; one retry within the deadline rescues most lookups.
async function pget(url, deadline) {
  let r = null,
    err = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt && deadline - Date.now() < 1500) break;
    try {
      r = await get(url, Math.min(6000, Math.max(1000, deadline - Date.now())), ptcgHeaders());
      if (r.status < 500) return r;
    } catch (e) {
      err = e;
      r = null;
    }
  }
  if (r) return r;
  throw err || new Error("fallback unreachable");
}

async function ptcgList(query, deadline) {
  const cards = [];
  for (let page = 1; page <= 4; page++) {
    // No orderBy: their sort adds 1.5-3s per query; sort here from releaseDate instead.
    const r = await pget(
      `${PTCG}cards?q=${encodeURIComponent(query)}&pageSize=250&page=${page}&select=id,name,number,rarity,subtypes,set,images`,
      deadline
    );
    if (!r.ok) return { status: 502, body: { error: "fallback HTTP " + r.status } };
    const j = await r.json();
    cards.push(...(j.data || []).map(brief));
    if (cards.length >= (j.totalCount || 0) || Date.now() > deadline) break;
  }
  cards.sort(
    (a, b) =>
      ((a.set && a.set.releaseDate) || "").localeCompare((b.set && b.set.releaseDate) || "") ||
      String(a.localId).localeCompare(String(b.localId), undefined, { numeric: true })
  );
  return { status: 200, body: cards };
}

async function fallback(path, deadline) {
  let m;
  if ((m = /^dex-ids\/(\d{1,4})$/.exec(path))) return ptcgList("nationalPokedexNumbers:" + m[1], deadline);
  if ((m = /^cards\/([A-Za-z0-9.-]{1,40})$/.exec(path))) {
    const r = await pget(PTCG + "cards/" + m[1], deadline);
    if (!r.ok) return { status: r.status === 404 ? 404 : 502, body: { error: "fallback HTTP " + r.status } };
    return { status: 200, body: detail((await r.json()).data) };
  }
  if (path === "sets") {
    const sets = [];
    for (let page = 1; page <= 3; page++) {
      const r = await pget(`${PTCG}sets?pageSize=250&page=${page}`, deadline);
      if (!r.ok) return { status: 502, body: { error: "fallback HTTP " + r.status } };
      const j = await r.json();
      sets.push(...(j.data || []).map((s) => ({ id: s.id, name: s.name, releaseDate: isoDate(s.releaseDate) })));
      if (sets.length >= (j.totalCount || 0) || Date.now() > deadline) break;
    }
    return { status: 200, body: sets };
  }
  if ((m = /^cards\?(.+)$/.exec(path))) {
    const q = new URLSearchParams(m[1]);
    const name = q.get("name");
    const dex = q.get("dexId");
    if (name) return ptcgList(`name:"${name}"`, deadline);
    if (dex && /^\d{1,4}$/.test(dex)) return ptcgList("nationalPokedexNumbers:" + dex, deadline);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const path = String(req.query.path || "");
  if (!/^[A-Za-z0-9/_?=&%.-]{1,200}$/.test(path) || path.includes("..")) {
    return res.status(400).json({ error: "bad path" });
  }
  const deadline = Date.now() + 9000;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // A flapping provider can 200 a truncated list; small lists are cross-checked
  // against the other provider and never cached long.
  const listShaped = /^dex-ids\//.test(path) || /^cards\?/.test(path);
  const listLen = (b) => {
    try {
      const j = typeof b === "string" ? JSON.parse(b) : b;
      const a = Array.isArray(j) ? j : j.cards || [];
      return a.length;
    } catch (e) {
      return -1;
    }
  };
  // Hedge: if TCGdex hasn't answered in 800ms, start the fallback in parallel
  // so a dead probe costs max(probe, fallback) instead of their sum.
  let fbPromise = null;
  const startFb = () => (fbPromise ||= fallback(path, deadline).then((v) => ({ v }), (e) => ({ e })));
  let primary = null;
  // X-Card-Fb: the client saw a fresh fallback-served response in the last minute; skip the probe
  // (the instance-local breaker can't cover cold starts, the client hint can). A header keeps
  // the hint out of the CDN cache key.
  if (req.headers["x-card-fb"] !== "1" && Date.now() >= tcgdexDownUntil) {
    const hedge = setTimeout(startFb, 800);
    try {
      const r = await get(TCGDEX + path, 2500, UA);
      if (r.ok) {
        const body = await r.text();
        const n = listShaped ? listLen(body) : Number.MAX_SAFE_INTEGER;
        if (n >= 5) {
          res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
          res.setHeader("X-Card-Source", "tcgdex");
          return res.status(200).send(body);
        }
        primary = { status: 200, body, ok: true, n };
      } else {
        primary = { status: r.status, body: await r.text() };
        if (r.status >= 500) tcgdexDownUntil = Date.now() + cooldown();
      }
    } catch (e) {
      tcgdexDownUntil = Date.now() + cooldown();
    } finally {
      clearTimeout(hedge);
    }
  }
  let fb = null;
  try {
    const settled = await startFb();
    if (settled.e) throw settled.e;
    fb = settled.v;
  } catch (e) {}
  if (fb && fb.status === 200 && (!primary || !primary.ok || listLen(fb.body) > primary.n)) {
    const small = listShaped && listLen(fb.body) < 5;
    res.setHeader("Cache-Control", small ? "public, s-maxage=300" : "public, s-maxage=3600");
    res.setHeader("X-Card-Source", "pokemontcg.io");
    return res.status(200).json(fb.body);
  }
  if (primary) {
    if (primary.ok) res.setHeader("Cache-Control", "public, s-maxage=300");
    res.setHeader("X-Card-Source", "tcgdex");
    return res.status(primary.status).send(primary.body);
  }
  if (fb) {
    res.setHeader("X-Card-Source", "pokemontcg.io");
    return res.status(fb.status).json(fb.body);
  }
  return res.status(502).json({ error: "both providers unreachable" });
}
