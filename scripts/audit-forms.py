#!/usr/bin/env python3
"""Forms audit: which non-base dex entries match no card under the card sheet's own rules.

Usage: python3 scripts/audit-forms.py
Prints a Markdown table (dex | id | name | form | cards), fewest cards first, for every
entry with a form type, applying the same English card-matching rules as the sheet
(Regional by region token, Mega by prefix plus X/Y, Gigantamax and Dynamax by VMAX plus
the G-Max attack check, Tera by the keyed set and number list, Other by the parenthesised
form word). Other entries are counted on that strict word rule; the sheet itself falls
back to the base cards when the word matches nothing, so a zero here is a form with no
printing of its own. Read-only: TCGdex responses cache under scripts/.sprite-cache/tcg/."""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".sprite-cache" / "tcg"
API = "https://api.tcgdex.net/v2/en/"


def get(path):
    key = CACHE / (re.sub(r"[^A-Za-z0-9._-]+", "_", path) + ".json")
    if key.exists():
        return json.loads(key.read_text())
    req = urllib.request.Request(API + path, headers={"User-Agent": "national-card-dex/1.0"})
    data = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                data = []
                break
            if attempt == 2:
                raise
            time.sleep(2)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)
    CACHE.mkdir(parents=True, exist_ok=True)
    key.write_text(json.dumps(data))
    return data


SRC = (ROOT / "index.html").read_text()
DEX = json.loads(re.search(r"const DEX=(\[\[.*?\]\]);", SRC).group(1))
TERA_KEYS = set(json.loads(re.search(r"const TERA_KEYS=new Set\((\[.*?\])\);", SRC).group(1)))
SETS = {s["id"]: s["name"] for s in get("sets")}

REGX = re.compile(r"^(Alolan|Galarian|Hisuian|Paldean|Alola-|Galar-|Hisui-|Paldea-)|\s(d'Alola|de Alola|di Alola|de Galar|di Galar|d'Hisui|de Hisui|di Hisui|de Paldea|di Paldea)\b")
REGTOK = {"Alolan": "Alola", "Galarian": "Galar", "Hisuian": "Hisui", "Paldean": "Paldea"}


def nm(c):
    return c.get("name") or ""


def is_vmax(c):
    return "VMAX" in nm(c)


def is_mega(c):
    return re.match(r"^(M |Mega[ -])", nm(c)) is not None


def is_reg(c):
    return REGX.search(nm(c)) is not None


def is_ex(c):
    return re.search(r"(^|[\s-])ex$", nm(c)) is not None and not is_reg(c) and not is_mega(c)


def set_id(card_id):
    return card_id[: card_id.rfind("-")]


def is_tera(c):
    return (SETS.get(set_id(c["id"]), "") + "|" + str(c.get("localId", ""))) in TERA_KEYS


def tera_ids(cards):
    keyed = {set_id(c["id"]) + "|" + nm(c) for c in cards if is_tera(c)}
    return {c["id"] for c in cards if is_tera(c) or (set_id(c["id"]) + "|" + nm(c)) in keyed}


def all_cards(n, species):
    d = get(f"dex-ids/{n}")
    cards = d if isinstance(d, list) else (d or {}).get("cards", [])
    if not cards:
        cards = get("cards?name=" + urllib.parse.quote(species) + "&category=Pokemon")
    return [c for c in cards if c.get("id")]


def gmax_split(cards):
    vm = [c for c in cards if is_vmax(c)]
    with ThreadPoolExecutor(4) as pool:
        details = list(pool.map(lambda c: get("cards/" + c["id"]), vm))
    gig = {c["id"] for c, d in zip(vm, details) if d and any(re.match(r"^(G-Max|Giga)", a.get("name") or "", re.I) for a in d.get("attacks", []))}
    return [c for c in vm if c["id"] in gig], [c for c in vm if c["id"] not in gig]


def matches(entry, cards):
    n, _, name, _, _, form, _ = (entry + [None])[:7]
    if form == "Regional":
        tok = REGTOK.get(name.split(" ")[0])
        return [c for c in cards if is_reg(c) and (not tok or tok in nm(c))]
    if form == "Mega":
        xy = re.search(r" (X|Y)$", name)
        has = re.compile(r"(^|[^A-Za-z])" + xy.group(1) + r"(?![A-Z])") if xy else None
        return [c for c in cards if is_mega(c) and (not has or has.search(nm(c)) or nm(c).startswith("M "))]
    if form in ("Gmax", "Dynamax"):
        g, d = gmax_split(cards)
        return g if form == "Gmax" else d
    if form == "Tera":
        t = tera_ids(cards)
        hit = [c for c in cards if c["id"] in t]
        return hit or [c for c in cards if is_ex(c)]
    m = re.search(r"\((.+)\)$", name)
    if m:
        w = m.group(1).split(" ")[0].lower()
        return [c for c in cards if w in nm(c).lower()]
    return [c for c in cards if not is_vmax(c) and not is_mega(c) and not is_reg(c)]


def main():
    forms = [e for e in DEX if e[5]]
    species = {}
    for e in DEX:
        if not e[5]:
            species[e[0]] = e[2]
    numbers = sorted({e[0] for e in forms})
    with ThreadPoolExecutor(6) as pool:
        pools = dict(zip(numbers, pool.map(lambda n: all_cards(n, species[n]), numbers)))
    rows = []
    for e in forms:
        rows.append((len(matches(e, pools[e[0]])), e))
    rows.sort(key=lambda r: (r[0], r[1][0], r[1][1]))
    zero = sum(1 for r in rows if r[0] == 0)
    print(f"Forms audit: {len(forms)} form entries over {len(numbers)} species, {zero} with no matching English card.\n")
    print("| dex | id | name | form | cards |")
    print("|---|---|---|---|---|")
    for count, e in rows:
        print(f"| {e[0]:04d} | {e[1]} | {e[2]} | {e[5]} | {count} |")


if __name__ == "__main__":
    main()
