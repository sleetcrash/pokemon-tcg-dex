#!/usr/bin/env node
// Tells an upstream outage apart from a bug in our code, in one command.
// Usage: node scripts/check-providers.mjs [proxy-base-url]
// Optional: POKEMONTCG_API_KEY env var raises the pokemontcg.io rate limit.

const key = process.env.POKEMONTCG_API_KEY;
const targets = [
  ["TCGdex", "https://api.tcgdex.net/v2/en/cards/swsh3-136"],
  [
    "pokemontcg.io" + (key ? " (keyed)" : " (no key)"),
    "https://api.pokemontcg.io/v2/cards?q=" + encodeURIComponent("nationalPokedexNumbers:151") + "&pageSize=1",
    key ? { "X-Api-Key": key } : undefined,
  ],
];
const proxy = process.argv[2];
if (proxy) targets.push(["proxy " + proxy, proxy.replace(/\/$/, "") + "/api/tcg?path=dex-ids/151"]);

const results = [];
for (const [name, url, headers] of targets) {
  const t0 = Date.now();
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const ms = Date.now() - t0;
    const json = await r.json().then(() => true).catch(() => false);
    const up = r.ok && json;
    results.push(up);
    console.log(`${up ? "✓" : "⚠"} ${name}: HTTP ${r.status} in ${ms}ms${json ? "" : ", body is not JSON"}`);
  } catch (e) {
    results.push(false);
    const why = e.name === "AbortError" ? "timed out after 10s" : e.cause?.code || e.message;
    console.log(`✗ ${name}: ${why} (${Date.now() - t0}ms)`);
  } finally {
    clearTimeout(tm);
  }
}

const [tcgdex, ptcg] = results;
if (tcgdex && ptcg) console.log("Both providers up. A lookup failure now is a bug on our side.");
else if (!tcgdex && !ptcg) console.log("Both providers down: upstream outage, nothing to fix here.");
else console.log(`${tcgdex ? "pokemontcg.io" : "TCGdex"} is down; the ${tcgdex ? "primary" : "fallback"} should carry lookups.`);
process.exit(tcgdex || ptcg ? 0 : 1);
