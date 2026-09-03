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

- Tap row or tile: register / unregister. Long press: toggle Pending (right click is a reserved no-op). Card icon (far left of row, bezel of binder tile): open card sheet. Tiles with chosen art keep the same bezel, so tap-to-register and the card icon stay reachable with art in the slot; the scan carries a remove X (hover, or after the first tap on touch), and the card sheet header has Remove card too.
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
- SUPERSEDED 2026-09-03 (E3 section below). Sprite tiles read as a card face: name + dex number header, framed 10/7 art window, caption strip (form/gen/region, transparent chips, attached under the art frame), Pokeball status centered in the body, hairline footer with the card-search icon. Small tiles shed chrome instead of overflowing: content-box under 80px drops the caption strip, under 62px also drops footer + name (number, art, ball remain).
- SUPERSEDED 2026-09-03 (E3 section below). Chosen-art tiles no longer paint the scan over the whole face: the scan sits contained above the same footer (search icon left, status ball center, TCGplayer price right), so nothing is covered and the slot stays fully interactive. The old cnum/cname/pbadge overlays are gone.
- Pokeball/circle parity fixed at the root: the ball sprite only draws the middle 60% of its PNG (62.5% for the Hisui ball), so it renders via `::after` at 166.8%/160% of the box and the visible ball now equals the empty circle everywhere (tiles and list rows). Pending pulse moved onto the slot element itself.
- Header perforation strip removed (clean 3px ink rule). View/gear icons redrawn (the old pocket icon drew outside its viewBox); columns icon now three tall bars.
- Menus: dropdown panels and popovers get a soft light-theme shadow (the old popover shadows were dark-theme leftovers), and the card-detail primary button was ink-on-ink (unreadable), now ink on paper.
- New: Options (gear) > Clear binder cards, two-tap confirm (arms to "Tap again to clear all", disarms on any click elsewhere); wipes `dex-il-cards` only, registration state untouched.
- The 4+ column region-chip truncation flag is resolved by the compact tiers (the caption strip hides before it can truncate).
- Verified via Playwright at 390/768/1440, binder 2/3/6 columns, pocket 4 columns, list view, last-page blank slots, card sheet open from an art tile, register toggle through art, and the clear-cards flow end to end.

Second owner round, same day:

- SUPERSEDED 2026-09-03 (E3 section below). ONE tile format for every slot, art or not (owner rule: whatever works for the physical-card tile structures all tiles in binder and pocket). Both types end in the same footer: search icon left, status ball center, price right. The ball left the sprite tile's body; the art window now flex-grows (much larger art), with the caption strip reading as the frame's bottom band. Chosen-art tiles are slim-bezel (2% padding, rounded scan corners) per the owner's mock. Tiny tiles (content under 62px) hide search + price but keep the ball, so status survives at 6 columns.
- Options menu no longer renders under the checkpoint strip: header z-index was 10 (a stacking context capping every child below the strip's 25), now 40. Panels got min-width 184px + nowrap labels so entries stop wrapping.
- Binder view icon is a ring binder (rounded cover, spine line, three spine rings); pocket view icon matches the owner's mock (three columns of filled tiles cropped top and bottom, tall middle row, reads as a scrolling card grid).

## 2026-09-02 UI/UX review wave (shipped on MAX-forms)

A five-lane review (visual lens, architecture lens, web-platform research, feasibility and performance verifiers) drove eight commits. Everything below is verified with Playwright at 360/390/768/1440 and a mocked card API; the owner has not walked it yet.

- Layout: one shared column (`--col` 640px, `--gutter` 10px) for header, list, binder and pocket, so every surface shares the same edges. The 40px strip gutter applies to the list only under 720px. Binder and pocket grow with the column count on wide viewports (`min(100%, max(--col, cols * 132px))`, `--cols` set per render). Filter buttons 40px, panel rows, pager, page input, dialog buttons and back-to-top (now clear of the strip) sized for thumbs; the views row and progress bar gave the height back, header stays about 150px at 390.
- Tokens: `--pend`, `--pend-deep`, `--pend-lite`, `--ok`, `--glow`, `--shadow`, `--pogo`, `--icon-search`. Region hues darkened in OKLCH so region chips clear 4.5:1 on the chip ground; form chip is ink; chips 10px; dim sprites 0.6 grayscale. Radios draw as radios. Tile type floors 9px, caption strip sheds at 88px, tiny tiles keep the (shrunk) card-search icon so the sheet stays reachable at 5 and 6 columns; scan tiles carried their dex number in the footer (dropped 2026-09-03 with E3). Pending pulse animates opacity on a painted glow (`::before` on the ball) instead of box-shadow; the found-it flash is the accent.
- Correctness: the sheet has a request token (`cSeq`; close bumps it) so a slow lookup never paints under a newer title; set names never gate the card list; checkpoint runs and scrub targets come from `dispArr` (rendered rows only); long-press click guard is a timestamp scoped to the held id; a pinch or column pick relays out the pocket grid (`layoutPocket`) without rebuilding; Use in binder updates label, tile and row price in place (`refreshTile`); price links are built from the DOM and accept https only; the legacy `tcg:` purge runs once behind `prefs.purged`; on quota `cachePut` evicts the oldest half of `tcg2:` and retries. The fallback hint is the request header `X-Card-Fb: 1` (out of the CDN cache key) and re-arms only when `x-vercel-cache` is not HIT.
- Efficiency: header height cached (`headH`, refreshed by `placeJumps` and resize, also exported as `--hdr` for scroll-margin); the display pass walks `ORDERED` and an `expMap` (dex number to chip) and writes `display` only on change; startup no longer re-appends rows for the default order; the price observer watches only rows with chosen art; tiles register in `bTiles`/`pTiles` maps (no grid scans per tap); under a Status filter an entry that stops matching removes its own row and tile instead of rebuilding; search reuses distance buffers and caches the last hits; lookups share in-flight promises; G-Max classification runs four at a time and reports cards it could not check; one `wireDropdown` sets `aria-expanded`; one document click handler closes everything.
- Intuitive: `#csheet` and `#modal` are `<dialog>` elements (showModal, Escape, focus containment, `html.lock` scroll lock, `overscroll-behavior: contain`, `svh` sizes); loading shows a skeleton grid, errors are centered with the transport detail demoted and a Try again button; Escape also closes dropdowns, pickers, suggestions and the clear confirm. Keyboard: rows and tiles use a roving tabindex (first visible is the tab stop), arrows move, Enter/Space registers, Shift+Enter marks pending, `c` opens the cards; per-row card buttons left the tab order. A press shows a ring growing on the ball for the 450ms hold and clears on drift. Each view remembers its scroll position. Choosing Collapsible entries while only Base is shown enables every form type (the Forms button reflects it). A search jump relaxes only the filters that exclude the target. Suggestions take arrow keys.
- Count line shows the completion percentage.

Not built (verified ideas for later, in order): run marking (long-press then drag to mark a stretch; needs an owner call on what a run paints), checkpoint strip as a progress spine with a scrub bubble, a capture wobble on the status ball (collides with the star burst; pick one), a root cross-fade on view switch only (View Transitions, Safari 18+), a page-turn animation on the existing pager. Rejected on verification: native popover (Safari 17 floor), content-visibility on the list (breaks offsetTop reads the scrub needs), scroll-snap paging, anchor positioning, scroll-driven header bar, pocket-lip pending treatment, ghost-sprite proposal.

DEFERRED: global rarity filter (mark rarities you collect; card sheets show only those). Blocked on rarity data: TCGdex list responses carry no rarity and per-card detail fetches would be 90 requests a sheet. It is the first feature of the build-time card-data pipeline below, where rarity is baked into each file.

## 2026-09-03 E3 slot format (owner pick, shipped on MAX-forms)

The owner reviewed six slot formats and chose E3: no top bezel, a full-width card face, one bezel strip under it. Every binder and pocket slot now has this shape.

- Geometry: the slot has no aspect ratio of its own. The face is `width:100%; aspect-ratio:63/88` (`.face`), so a physical card scan fills it exactly (`object-fit:cover`, which trims under 1% off a provider image whose ratio differs from 63/88). The bezel (`.pfoot`) is a strip of `clamp(16px,8cqw,24px)` added below the face, so the slot is taller than a bare card by exactly the bezel. Sprite slots and scan slots share the outer size; blank slots (`.blankc`) reproduce it with a 63/88 block plus a bezel-height block.
- Bezel: three-column grid, card-search button left, tags centred (form, gen, region chips; on scan tiles the TCGplayer price follows the chips), status ball right. Ball is `clamp(12px,6.5cqw,18px)` so it sits inside the strip.
- Sprite face: name and dex-number header on paper with a hairline under it, art window below on the well ground, all inside the 63/88 face. Scan face: the image, plus a remove X button (`.rmx`) top-right that is invisible and inert at rest and appears on hover or `:focus-within` (a first tap on touch focuses the tile and cycles status; the second tap on the X removes the art). `removeArt(id)` is shared by the X and the Remove card button in the sheet header.
- Narrow slots shed bezel content by container width: price hidden under 130px, the Gen chip hidden under 120px when a form chip is present and under 100px always, all tags hidden under 80px, name hidden and search icon shrunk under 62px. Verified fit (no clipped bezel text) at 390/2, 390/3, 390/6, 768/4, 1440/3, 1440/6 columns and pocket 2 columns at 390.
- Verified with Playwright against the served file with the scan image routed locally: face equals slot width at every width, ratio 0.716, bezel 16px flush at the bottom, sprite and scan slots equal height, blank slots equal tile height, no horizontal overflow, no page errors; hover shows the X, a body tap still cycles status, the X removes the art and leaves status untouched, the search icon opens the sheet.
- Not carried over from the older format: the dex number on scan tiles (E3 as drawn has no room; C1 and C2 were the identity variants the owner did not pick).

## Roadmap (from README)

Male/female variants; per-game regional dex with native numbering; card-as-binder-image polish; account-free encrypted sync (pairing key + Vercel KV); PWA (manifest + service worker) for installable offline use; GitHub Releases for a downloadable copy; camera/photo card lookup.

## Testing

A jsdom harness was used for logic (tap state machine, filters, ordering, sync codes, search). Anything touching layout, gestures, or the network needs a real browser; prefer Safari on device or the iOS Simulator.
