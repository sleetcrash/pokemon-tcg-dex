#!/usr/bin/env python3
"""Write the ENERGY table in index.html: each entry's first type as a TCG energy.

Game types map to the modern energy set (no Fairy): bug joins Grass, ice joins
Water, ghost and fairy join Psychic, rock and ground join Fighting, poison joins
Darkness, flying and normal join Colorless. A form id unknown to PokeAPI falls
back to the entry's base sprite id, then to its species.

Usage: python3 scripts/build-types.py
Downloads are cached in scripts/.sprite-cache/.
"""
import csv, io, json, re, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".sprite-cache"
CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
ENERGY = {
    "grass": "G", "bug": "G", "fire": "R", "water": "W", "ice": "W", "electric": "L",
    "psychic": "P", "ghost": "P", "fairy": "P", "fighting": "F", "rock": "F", "ground": "F",
    "dark": "D", "poison": "D", "steel": "M", "dragon": "N", "normal": "C", "flying": "C",
}


def fetch(name):
    path = CACHE / name
    if not path.exists():
        CACHE.mkdir(exist_ok=True)
        with urllib.request.urlopen(CSV + name, timeout=60) as r:
            path.write_bytes(r.read())
    return path.read_text()


def main():
    html_path = ROOT / "index.html"
    html = html_path.read_text()
    dex = json.loads(re.search(r"const DEX=(\[\[.*?\]\]);", html, re.S).group(1))
    types = {int(r["id"]): r["identifier"] for r in csv.DictReader(io.StringIO(fetch("types.csv")))}
    first = {}
    for r in csv.DictReader(io.StringIO(fetch("pokemon_types.csv"))):
        if r["slot"] == "1":
            first[int(r["pokemon_id"])] = types[int(r["type_id"])]
    groups, fallbacks = {}, []
    for entry in dex:
        dex_no, app_id = entry[0], entry[1]
        sref = entry[6] if len(entry) > 6 else None
        for key in (app_id, sref, dex_no):
            if key in first:
                break
        else:
            raise SystemExit(f"no type for {entry}")
        if key != app_id:
            fallbacks.append((entry[2], key))
        groups.setdefault(ENERGY[first[key]], []).append(app_id)
    line = "const ENERGY=" + json.dumps({k: sorted(v) for k, v in sorted(groups.items())}, separators=(",", ":")) + ";"
    if "const ENERGY=" not in html:
        raise SystemExit("index.html has no ENERGY line to replace")
    html_path.write_text(re.sub(r"const ENERGY=\{.*?\};", line, html))
    print({k: len(v) for k, v in sorted(groups.items())})
    print(f"{len(fallbacks)} entries typed through their base sprite or species (expected for app-only form ids)")


if __name__ == "__main__":
    main()
