#!/usr/bin/env python3
"""Write data/sets.json: every TCGdex set's release date per language, so the card lookup
can order printings by set release without a request per set.

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


def set_date(lang, set_id):
    try:
        return set_id, get(f"{lang}/sets/{set_id}").get("releaseDate")
    except Exception as e:
        print(f"  {lang}/{set_id}: {e}")
        return set_id, None


def main():
    out = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for lang in LANGS:
            ids = [s["id"] for s in get(f"{lang}/sets")]
            dates = dict(pool.map(lambda i: set_date(lang, i), ids))
            out[lang] = {k: v for k, v in sorted(dates.items()) if v}
            print(f"{lang}: {len(out[lang])} of {len(ids)} sets dated")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
