# HANDOFF

Working notes for continuing development. Public repo: keep this file free of personal details.

## What this is

Single-file web app (`index.html`) tracking a Pokemon TCG National Card Dex: 1,602 entries covering all 1,025 species plus regional forms, other form variations, megas, Gigantamax, and TCG-only states (Dynamax, Tera). Static hosting on Vercel (linked to this repo) with one serverless function (`api/tcg.js`) that proxies the TCGdex card API. GitHub Pages also serves `main` but Vercel is the intended production host.

## Repo state at handoff

- `main`: last known-good build before Dynamax/Tera and the card lookup.
- `MAX-forms` branch (open pull request): adds Gigantamax, Dynamax, Tera, Surfing/Flying Pikachu, the card lookup sheet, the same-origin proxy (`api/tcg.js`), and a pokemontcg.io fallback provider (see below). Everything is committed; nothing lives only in a local build.

## Architecture (as built)

- One HTML file: CSS, markup, and JS inline. Data embedded as JS constants:
  - `DEX`: array of entries `[dexNo, id, name, region, gen, formType, spriteRefId?]`. Ids are stable and are the localStorage keys; never renumber.
  - `SPR`: sprite PNGs as base64, keyed by id. Dynamax/Tera/Surfing/Flying reuse another entry's sprite via the 7th field.
  - `RK`: regional dex numbers per region (from PokeAPI pokedexes) for Regional Dex order.
- Form types: `""` base, `Other`, `Regional`, `Mega`, `Gmax`, `Dynamax`, `Tera`. Sort rank within a dex number: base, Other, Regional, Mega, Gmax, Dynamax, Tera.
- Rules: Dynamax and Tera attach only to base species or regional forms, never to Other variations. All megas are tagged Kalos; Gmax/Dynamax tagged Galar; Tera tagged Paldea; Meltan/Melmetal region `POGO`.
- Collection state in localStorage `dex-il`: `true` registered, `"p"` pending. UI prefs in `dex-il-ui`. Saved lists `dex-il-lists`. Chosen card art `dex-il-cards`. TCGdex responses cached under `tcg:*` for 7 days.
- Sync codes: `ILDEX{v}.{count}.{base64}`, 2 bits per entry. Version 6 is current; versions 1 to 4 decode against filtered legacy sequences; version 5 is intentionally rejected.

## Interaction model

- Tap row or tile: register / unregister. Long press: toggle Pending (right click is a reserved no-op). Card icon (far left of row, footer of binder tile): open card sheet. Tiles with chosen art keep the same footer, so tap-to-register, the card icon, and Remove from binder (in the card detail) all stay reachable with art in the slot.
- Forms menu: type checkboxes only, Base checked by default. Entry mode (Separate / Collapsible) and placement (National / Regional / Grouped) live under the gear menu with Manage lists.
- Collapsible mode: `+n` chip on bases with forms; chip color reflects form completion only; drawers are the same row elements, so no state sync is needed.
- Right-edge checkpoint strip: tap to jump, hold and slide to scrub (coarse across regions, fine within one); highlight follows scroll position.

## Data sources

- PokeAPI CSVs (species, pokemon, pokemon_forms, version_groups, pokedexes, pokemon_dex_numbers) and PokeAPI sprites repo (form sprites at `{dexNo}-{form}.png`).
- Card lists for Dynamax (VMAX cards without Gigantamax) and Tera (52 Tera Pokemon ex) were taken from Bulbapedia card categories; these need refreshing as new sets release. Tera cards are matched by set name + card number.
- TCGdex API (`api.tcgdex.net/v2/en/`), `dex-ids/{n}` for all cards of a Pokemon, `cards/{id}` for details (G-Max attack detection), `sets` for names.
- Fallback: when TCGdex times out or errors, `api/tcg.js` queries pokemontcg.io (`/v2/cards?q=nationalPokedexNumbers:{n}`, `/v2/cards/{id}`, `/v2/sets`) and maps responses to the TCGdex shape (id, localId, name, image base, rarity, stage/subtypes, set name and release date; attacks and TCGplayer pricing on details). Responses carry `X-Card-Source`. Outage latency controls, in order: a circuit breaker skips the TCGdex probe for 60s after it times out or 5xxes; the fallback query starts in parallel 800ms into a silent probe (hedging); after any fallback-served response the client sends `fb=1` for 60s so every function instance skips the dead probe (the breaker alone cannot cover cold starts); the client never retries TCGdex directly once the proxy has answered; lists are sorted in the function because upstream `orderBy` adds 1.5-3s; set names are fetched in parallel with the card list (memoized `ensureSets`); the detail view renders instantly from grid data (small image upgraded to hi-res on load) and fills rarity/illustrator/price when the fetch lands. Measured with TCGdex healthy: lists 0.2-0.9s cold, detail tap ~20ms visible / ~155ms enriched. During the TCGdex outage via fallback: lists ~3s cold, cached reopens ~0.1s. Card images then come from `images.pokemontcg.io` (`{base}.png` / `{base}_hires.png`); the client's `cimg()` helper handles both hosts. `POKEMONTCG_API_KEY` (optional, raises rate limits) comes from an env var; see `.env.example` and set it in Vercel project env vars.
- `node scripts/check-providers.mjs [proxy-base-url]` reports reachability of both providers in one command, to tell an outage from a bug.

## Known issues / open threads

- 2026-09-01: full provider outage cycle observed. TCGdex was down all session (ports 80/443 timing out) while pokemontcg.io was up but degraded; the card sheet was verified end to end through the fallback. TCGdex then recovered the same day and the primary path was verified live on the preview too: base/Mega/Gmax/Tera filtering all correct (Gmax = all 4 Charizard VMAX), lists 200-900ms, detail tap visible ~20ms and enriched ~155ms, hi-res image swap working. By then pokemontcg.io had flipped to 500s, so both failover directions are proven. Neither provider is fully healthy; run `scripts/check-providers.mjs` before debugging any lookup issue.
- A failed detail fetch during Gmax/Dynamax classification silently drops the card into the wrong bucket for that load (client treats missing detail as non-Gmax). Successes cache client-side for 7 days, so this self-heals; only matters while a provider is flaky.
- Card lookup failing on iPhone Safari on `MAX-forms`: cross-origin fetch to TCGdex returns "Load failed". The proxy should resolve it; verify with Safari Web Inspector attached to a device once TCGdex is back.
- Build process is string-patching a 2 MB file. Convert to a build script: data JSON (entries, card lists, regional keys) + sprite pipeline + template, emitting `index.html`. Keep entry ids stable.
- Vercel preview URLs require Vercel login (deployment protection on).
- The chat-preview 2 MB limit is no longer a constraint; do not degrade sprites for it.

## Next: build-time card data (decided 2026-09-01)

Replace runtime card-list fetching with build-time static data, modeled on pkmnbindr.com (which bundles its whole card DB as static JSON from its own domain and is outage-proof as a result). Chosen granularity: one JSON per Pokemon (`/data/cards/{dexNo}.json`, ~1025 small files) plus a shared `sets.json`, because the app's only question is "all cards for dex N" at sheet-open. Bake form classification (Gmax/Dynamax/Tera/Mega/regional buckets) into each file at build time, which removes the runtime detail fan-out. Prices stay live through the proxy. Artist browsing (pokemontcg.io `artist` field) is DEFERRED until everything else is done; it becomes trivial once the static data exists. This supersedes most of the proxy fallback machinery for lists.

## 2026-09-01 UI wave (shipped on MAX-forms)

Game Boy Pokedex LIGHT scheme (warm paper ground, black ink, perforated header divider, red accent only on interactive/active; sprites, card art, and region chips keep their colors as content). Compact content-width header; the filter row is filters only (Gen / Region / Forms / Status). Forms = checkboxes ordered Base, Base Variations, Regionals, Megas, Dynamax, Gigantamax, Tera; DEFAULT SHOWS BASE ONLY; entry-mode and placement radios live under the gear with Manage lists. Binder sprite slots mimic a card face: name and dex number header, framed sprite art box, tags directly beneath, a non-interactive Pokeball status in the middle (outline missing, ball collected, tilted pulse pending), card-search icon in the lower-left corner; slots with chosen art show a TCGplayer market-price badge, and list rows show the same price in their empty middle. Final binder page pads with blank slots; binder size = hover grid behind a four-square icon. Pocket view = third view, all tiles in one vertical scroll, columns 2-6 via a one-row picker, touch pinch, or ctrl+wheel trackpad pinch. Tera matching expanded (subtype + set/name alt-art expansion; Tera Charizard = 4 printings). Long-press = Pending on every input; right-click is a reserved no-op.

END-OF-SESSION STATE: a final round (dark mode toggle, redrawn pocket icon, ball resize, pocket/binder style parity) was REVERTED at the owner's call (commits 2816605, b644abb undo 14b6d5f). Also open: merge to main (proposal stands, owner gates), POKEMONTCG_API_KEY not yet set in Vercel env, pocket view lacks the checkpoint strip, iPhone Safari on-device lookup check still owed.

## 2026-09-01 tile polish pass (owner walk feedback, shipped on MAX-forms)

Owner walked the preview and directed a polish pass; this supersedes the tile details in the UI wave block above.

- Binder/pocket tiles are container queries now (`container-type:inline-size` on `.card`): all internal sizing in cqw against the tile, so faces keep real-card proportions at every column count. Tile aspect is 63/88 (true card ratio) with a 5px corner radius. GOTCHA baked into the CSS: cq units on the container's OWN padding resolve against the viewport, not itself, so `.card` padding uses percentages (which resolve against the grid track) while descendants use cqw.
- Sprite tiles read as a card face: name + dex number header, framed 10/7 art window, caption strip (form/gen/region, transparent chips, attached under the art frame), Pokeball status centered in the body, hairline footer with the card-search icon. Small tiles shed chrome instead of overflowing: content-box under 80px drops the caption strip, under 62px also drops footer + name (number, art, ball remain).
- Chosen-art tiles no longer paint the scan over the whole face: the scan sits contained above the same footer (search icon left, status ball center, TCGplayer price right), so nothing is covered and the slot stays fully interactive. The old cnum/cname/pbadge overlays are gone.
- Pokeball/circle parity fixed at the root: the ball sprite only draws the middle 60% of its PNG (62.5% for the Hisui ball), so it renders via `::after` at 166.8%/160% of the box and the visible ball now equals the empty circle everywhere (tiles and list rows). Pending pulse moved onto the slot element itself.
- Header perforation strip removed (clean 3px ink rule). View/gear icons redrawn (the old pocket icon drew outside its viewBox); columns icon now three tall bars.
- Menus: dropdown panels and popovers get a soft light-theme shadow (the old popover shadows were dark-theme leftovers), and the card-detail primary button was ink-on-ink (unreadable), now ink on paper.
- New: Options (gear) > Clear binder cards, two-tap confirm (arms to "Tap again to clear all", disarms on any click elsewhere); wipes `dex-il-cards` only, registration state untouched.
- The 4+ column region-chip truncation flag is resolved by the compact tiers (the caption strip hides before it can truncate).
- Verified via Playwright at 390/768/1440, binder 2/3/6 columns, pocket 4 columns, list view, last-page blank slots, card sheet open from an art tile, register toggle through art, and the clear-cards flow end to end.

DEFERRED: global rarity filter (mark rarities you collect; card sheets show only those). Blocked on rarity data: TCGdex list responses carry no rarity and per-card detail fetches would be 90 requests a sheet. It is the first feature of the build-time card-data pipeline below, where rarity is baked into each file.

## Roadmap (from README)

Male/female variants; per-game regional dex with native numbering; card-as-binder-image polish; account-free encrypted sync (pairing key + Vercel KV); PWA (manifest + service worker) for installable offline use; GitHub Releases for a downloadable copy; camera/photo card lookup.

## Testing

A jsdom harness was used for logic (tap state machine, filters, ordering, sync codes, search). Anything touching layout, gestures, or the network needs a real browser; prefer Safari on device or the iOS Simulator.
