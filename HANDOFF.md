# HANDOFF

Working notes for continuing development. Public repo: keep this file free of personal details.

## What this is

Single-file web app (`index.html`) tracking a Pokemon TCG National Card Dex: 1,602 entries covering all 1,025 species plus regional forms, other form variations, megas, Gigantamax, and TCG-only states (Dynamax, Tera). Static hosting on Vercel (linked to this repo) with one serverless function (`api/tcg.js`) that proxies the TCGdex card API. GitHub Pages also serves `main` but Vercel is the intended production host.

## Repo state at handoff

- `main`: last known-good build before Dynamax/Tera and the card lookup.
- `MAX-forms` branch (open pull request): adds Gigantamax, Dynamax, Tera, Surfing/Flying Pikachu, and the card lookup sheet. Card lookup on this branch fails in iPhone Safari ("Load failed").
- Latest local build (not committed): everything on `MAX-forms` plus the proxy function, proxy-first fetch with direct-API fallback, the `dex-ids/{n}` endpoint, 12s request timeouts, card icon moved to the far left of each row, and list performance fixes (no per-sprite grayscale filter, one shared CSS icon instead of inline SVGs). Bring this in first.

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

- Tap row: register / unregister. Long press (or right click): toggle Pending. Card icon (far left of row, top-left of binder card): open card sheet.
- Form menu: entry mode (Separate / Collapsible), placement (National / Regional / Grouped), type checkboxes (Base, Megas, Gigantamax, Dynamax, Tera, Regionals on; Other forms off).
- Collapsible mode: `+n` chip on bases with forms; chip color reflects form completion only; drawers are the same row elements, so no state sync is needed.
- Right-edge checkpoint strip: tap to jump, hold and slide to scrub (coarse across regions, fine within one); highlight follows scroll position.

## Data sources

- PokeAPI CSVs (species, pokemon, pokemon_forms, version_groups, pokedexes, pokemon_dex_numbers) and PokeAPI sprites repo (form sprites at `{dexNo}-{form}.png`).
- Card lists for Dynamax (VMAX cards without Gigantamax) and Tera (52 Tera Pokemon ex) were taken from Bulbapedia card categories; these need refreshing as new sets release. Tera cards are matched by set name + card number.
- TCGdex API (`api.tcgdex.net/v2/en/`), `dex-ids/{n}` for all cards of a Pokemon, `cards/{id}` for details (G-Max attack detection), `sets` for names.

## Known issues / open threads

- Card lookup failing on iPhone Safari on `MAX-forms`: cross-origin fetch to TCGdex returns "Load failed". The proxy in the latest build should resolve it; verify with Safari Web Inspector attached to a device.
- Build process is string-patching a 2 MB file. Convert to a build script: data JSON (entries, card lists, regional keys) + sprite pipeline + template, emitting `index.html`. Keep entry ids stable.
- Vercel preview URLs require Vercel login (deployment protection on).
- The chat-preview 2 MB limit is no longer a constraint; do not degrade sprites for it.

## Roadmap (from README)

Male/female variants; per-game regional dex with native numbering; card-as-binder-image polish; account-free encrypted sync (pairing key + Vercel KV); PWA (manifest + service worker) for installable offline use; GitHub Releases for a downloadable copy; camera/photo card lookup.

## Testing

A jsdom harness was used for logic (tap state machine, filters, ordering, sync codes, search). Anything touching layout, gestures, or the network needs a real browser; prefer Safari on device or the iOS Simulator.
