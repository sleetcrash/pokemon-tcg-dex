#!/usr/bin/env python3
"""Build sprites/game and sprites/home from the official PokeAPI sprite sets.

Game set: each generation is drawn by the fullest game set of its own era
(Kanto and Johto by their pixel-era remakes). A form missing from its own set
walks forward through later official sets before falling back to HOME, so
nothing fan-made is ever picked. HOME set: Pokemon HOME renders for everything.

Usage: python3 scripts/build-sprites.py [--only game|home]
Needs Pillow with WebP. Downloads are cached in scripts/.sprite-cache/.
Set GITHUB_TOKEN to lift the unauthenticated GitHub API limit (16 calls needed).
"""
import csv, io, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".sprite-cache"
OUT = ROOT / "sprites"
RAW = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
API = "https://api.github.com/repos/PokeAPI/sprites/"
CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"

FOLDERS = {
    "frlg": "versions/generation-iii/firered-leafgreen",
    "hgss": "versions/generation-iv/heartgold-soulsilver",
    "emerald": "versions/generation-iii/emerald",
    "platinum": "versions/generation-iv/platinum",
    "bw": "versions/generation-v/black-white",
    "oras": "versions/generation-vi/omegaruby-alphasapphire",
    "usum": "versions/generation-vii/ultra-sun-ultra-moon",
    "home": "other/home",
}
PIXEL = {"frlg", "hgss", "emerald", "platinum", "bw"}
# Walk-forward chain per generation of introduction. Only sets from the same or a
# later generation are eligible, which is what keeps the BW folder's fan sprites
# (ids above 649) out of reach: no entry introduced after Gen 5 ever reaches it.
CHAIN = {
    1: ["frlg", "hgss", "emerald", "platinum", "bw", "oras", "usum", "home"],
    2: ["hgss", "platinum", "bw", "oras", "usum", "home"],
    3: ["emerald", "platinum", "hgss", "bw", "oras", "usum", "home"],
    4: ["platinum", "hgss", "bw", "oras", "usum", "home"],
    5: ["bw", "oras", "usum", "home"],
    6: ["oras", "usum", "home"],
    7: ["usum", "home"],
    8: ["home"],
    9: ["home"],
}
HOME_PX = 160


def fetch(url, binary=False):
    key = CACHE / re.sub(r"[^A-Za-z0-9._-]", "_", url.split("//", 1)[1])
    if key.exists():
        return key.read_bytes() if binary else key.read_text()
    req = urllib.request.Request(url, headers={"User-Agent": "card-dex-sprites"})
    if url.startswith(API) and os.environ.get("GITHUB_TOKEN"):
        req.add_header("Authorization", "Bearer " + os.environ["GITHUB_TOKEN"])
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    key.write_bytes(data)
    return data if binary else data.decode()


def inventory(folder):
    parent, leaf = folder.rsplit("/", 1)
    entries = json.loads(fetch(f"{API}contents/sprites/pokemon/{parent}"))
    sha = next(e["sha"] for e in entries if e["name"] == leaf and e["type"] == "dir")
    tree = json.loads(fetch(f"{API}git/trees/{sha}"))
    assert not tree.get("truncated"), folder
    return {t["path"][:-4] for t in tree["tree"] if t["type"] == "blob" and t["path"].endswith(".png")}


def load_dex():
    html = (ROOT / "index.html").read_text()
    return json.loads(re.search(r"const DEX=(\[\[.*?\]\]);", html, re.S).group(1))


def load_csv(name):
    return {int(r["id"]): r for r in csv.DictReader(io.StringIO(fetch(CSV + name)))}


def candidates(entry, forms, pokemon):
    """Sprite file stems to try for an entry, most specific first."""
    dex_no, app_id = entry[0], entry[1]
    if app_id < 10000:
        return [str(app_id)]
    if app_id < 100000:
        # a form pokemon: its own id, else the species-and-form name the sprite folders use
        p = pokemon[app_id]
        species = pokemon[int(p["species_id"])]["identifier"]
        suffix = p["identifier"][len(species) + 1:]
        return [str(app_id), f"{p['species_id']}-{suffix}", p["species_id"]] if suffix else [str(app_id)]
    if app_id < 200000:
        f = forms[app_id - 100000]
        pid, fid = f["pokemon_id"], f["form_identifier"]
        return [f"{pid}-{fid}", pid, str(dex_no)]
    raise ValueError(f"entry {app_id} should reuse a base sprite")


def convert(png, folder):
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    buf = io.BytesIO()
    if folder == "home":
        im.thumbnail((HOME_PX, HOME_PX), Image.LANCZOS)
        im.save(buf, "WEBP", quality=85, method=6)
    else:
        im.save(buf, "WEBP", lossless=True, method=6)
    return buf.getvalue()


def build(entry, forms, pokemon, inv, chain, dest):
    for stem in candidates(entry, forms, pokemon):
        for folder in chain:
            if stem in inv[folder]:
                png = fetch(f"{RAW}{FOLDERS[folder]}/{stem}.png", binary=True)
                (dest / f"{entry[1]}.webp").write_bytes(convert(png, folder))
                return folder, stem
    return None, None


def main():
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    CACHE.mkdir(exist_ok=True)
    dex = load_dex()
    forms = load_csv("pokemon_forms.csv")
    pokemon = load_csv("pokemon.csv")
    inv = {k: inventory(v) for k, v in FOLDERS.items()}
    own = [e for e in dex if len(e) < 7 or not e[6]]
    jobs = []
    for e in own:
        if only != "home":
            jobs.append((e, CHAIN[e[4]], OUT / "game"))
        if only != "game":
            jobs.append((e, ["home"], OUT / "home"))
    for _, _, d in jobs:
        d.mkdir(parents=True, exist_ok=True)
    stats, gaps, smooth = {}, [], []
    with ThreadPoolExecutor(6) as pool:
        for (e, _, dest), (folder, stem) in zip(jobs, pool.map(lambda j: build(j[0], forms, pokemon, inv, j[1], j[2]), jobs)):
            setname = dest.name
            if folder is None:
                gaps.append(f"{setname} {e[1]} {e[2]}")
                continue
            stats.setdefault(setname, {}).setdefault(folder, 0)
            stats[setname][folder] += 1
            if setname == "game" and e[4] <= 5 and folder not in PIXEL:
                smooth.append(e[1])
            if stem != candidates(e, forms, pokemon)[0]:
                gaps.append(f"{setname} {e[1]} {e[2]}: used {folder}/{stem} (fallback stem)")
    for setname, by in stats.items():
        print(setname, json.dumps(by), "total", sum(by.values()))
    print("reused base sprite (Dynamax, Tera, Surfing/Flying):", len(dex) - len(own))
    print("smooth-render ids among Gen 1-5 (3D fallback):", smooth)
    print("gaps / stem fallbacks:", len(gaps))
    for g in gaps:
        print("  ", g)
    html_path = ROOT / "index.html"
    html = html_path.read_text()
    line = f"const SPRSMOOTH=new Set({json.dumps(sorted(smooth))});"
    if "const SPRSMOOTH=" in html:
        html_path.write_text(re.sub(r"const SPRSMOOTH=new Set\(\[[^\]]*\]\);", line, html))
        print("patched", line)
    else:
        print("add to index.html:", line)


if __name__ == "__main__":
    main()
