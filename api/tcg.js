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
    const r = await pget(
      `${PTCG}cards?q=${encodeURIComponent(query)}&orderBy=set.releaseDate,number&pageSize=250&page=${page}&select=id,name,number,rarity,subtypes,set,images`,
      deadline
    );
    if (!r.ok) return { status: 502, body: { error: "fallback HTTP " + r.status } };
    const j = await r.json();
    cards.push(...(j.data || []).map(brief));
    if (cards.length >= (j.totalCount || 0) || Date.now() > deadline) break;
  }
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
  let primary = null;
  if (Date.now() >= tcgdexDownUntil) {
    try {
      const r = await get(TCGDEX + path, 3000, UA);
      if (r.ok) {
        res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
        res.setHeader("X-Card-Source", "tcgdex");
        return res.status(r.status).send(await r.text());
      }
      primary = { status: r.status, body: await r.text() };
      if (r.status >= 500) tcgdexDownUntil = Date.now() + cooldown();
    } catch (e) {
      tcgdexDownUntil = Date.now() + cooldown();
    }
  }
  try {
    const fb = await fallback(path, deadline);
    if (fb) {
      if (fb.status === 200) res.setHeader("Cache-Control", "public, s-maxage=3600");
      res.setHeader("X-Card-Source", "pokemontcg.io");
      return res.status(fb.status).json(fb.body);
    }
  } catch (e) {}
  if (primary) {
    res.setHeader("X-Card-Source", "tcgdex");
    return res.status(primary.status).send(primary.body);
  }
  return res.status(502).json({ error: "both providers unreachable" });
}
