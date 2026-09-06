#!/usr/bin/env python3
"""Write data/sets.json: every TCGdex set's release date per language, so the card lookup
can order printings by set release without a request per set, plus the ids of the
Pokemon TCG Pocket sets (serie tcgp) so the lookup can tell the two games apart.

Usage: python3 scripts/build-sets.py
Reads the TCGdex set lists (about 1,100 set detail requests across the languages the
lookup offers); rerun when a new set ships. Sets without a release date are skipped."""
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LANGS = ["en", "ja", "fr", "de", "es", "it", "pt-br", "zh-tw", "zh-cn", "th", "id"]
API = "https://api.tcgdex.net/v2/"
OUT = Path(__file__).resolve().parent.parent / "data" / "sets.json"


def get(path):
    req = urllib.request.Request(API + path, headers={"User-Agent": "national-card-dex/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def set_info(lang, set_id):
    try:
        s = get(f"{lang}/sets/{set_id}")
        return set_id, s.get("releaseDate"), (s.get("serie") or {}).get("id") == "tcgp"
    except Exception as e:
        print(f"  {lang}/{set_id}: {e}")
        return set_id, None, False


def main():
    out = {"dates": {}, "pocket": {}}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for lang in LANGS:
            ids = [s["id"] for s in get(f"{lang}/sets")]
            rows = sorted(pool.map(lambda i: set_info(lang, i), ids))
            out["dates"][lang] = {i: d for i, d, _ in rows if d}
            out["pocket"][lang] = [i for i, _, p in rows if p]
            print(f"{lang}: {len(out['dates'][lang])} of {len(ids)} sets dated, {len(out['pocket'][lang])} Pocket")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
