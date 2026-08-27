# Illustration Dex

Personal tracker for collecting the National Dex in Art Rare, Illustration Rare, and Special Illustration Rare cards. Single self-contained HTML file, no dependencies, works fully offline.

## Features

- 1,179 entries: all 1,025 species plus regional forms and mega evolutions, National Dex order
- Sprites embedded as base64 (source: PokeAPI), including real Poke Ball item sprites for collection markers; Hisui entries use the Legends Arceus ball
- Three collection states: tap to register (with a catch-sparkle animation), swipe right or double tap for Pending (bought, awaiting shipment; tilted ball with glowing center), tap a pending entry once when it arrives
- Multi-select filters: generation (by dex placement), region, form type (Base / Megas / Regionals), and status (Registered / Pending / Missing)
- Form placement: interleaved in dex order or grouped at the end; unchecking form types hides them
- Search jumps to the entry in place; conflicting filters clear automatically
- iTunes-style scrub rail: fast scrubbing shows the region, slowing down shows the sprite, with a live scrollbar thumb
- Two views: list and binder (3x3 or 4x4 pages with full pager and page entry)
- Named list snapshots and cross-device sync codes (ILDEX2 format, three states; ILDEX1 codes still accepted)

## Usage

Open `index.html` in any browser, or host it (GitHub Pages works). Checks, saved lists, and preferences persist per browser via localStorage. To move progress between devices: gear > Manage lists > Sync code.

## Data notes

- Mega gens follow reveal (XY era = Gen 6, Legends Z-A = Gen 9); all megas tagged Kalos
- Gen filter follows base species dex placement so forms travel with their line
- Meltan and Melmetal tagged GO era; Hisui-debut species tagged PLA with Hisui region
- Mega Zygarde has no sprite upstream yet and shows a placeholder

## Roadmap

- Living form dex (every cosmetic and battle form, off by default)
- Male / female variant toggle
- Per-game regional dex switcher with native numbering
- Long-press to replace sprites with actual card images in binder view
