# Illustration Dex

Personal tracker for collecting the National Dex in Art Rare, Illustration Rare, and Special Illustration Rare cards. Single self-contained HTML file, no dependencies, works offline.

## Features

- 1,179 entries: all 1,025 species plus regional forms and mega evolutions, interleaved in National Dex order
- Sprites embedded as base64 (source: PokeAPI sprites)
- Tags per entry: generation and color-coded region
- Search jumps to the entry in place so neighbors stay visible
- Multi-select checkbox filters: generation (by dex placement), region, form
- Options: group forms separately, include base species alongside form filters
- Two views: list and binder (3x3 or 4x4 pages)
- Named lists: save and load snapshots of your checks
- Sync codes: your whole collection encodes to a short string; paste it on another device to transfer

## Usage

Open `index.html` in any browser. To host: any static file host, or enable GitHub Pages on this repo. Checks, saved lists, and preferences persist per browser via localStorage. To move between devices, use Options > Manage lists > Sync code.

## Data notes

- Mega gens follow reveal: XY-era megas are Gen 6, Legends Z-A megas are Gen 9. All megas tagged Kalos.
- Gen filter follows base species dex placement so forms travel with their line; the Gen chip shows reveal gen.
- Meltan and Melmetal tagged GO era; Hisui-debut species tagged PLA era.
- Mega Zygarde has no sprite upstream yet and shows a placeholder.

## Roadmap

- Long-press an entry to replace the sprite with an image of the actual card in binder view
