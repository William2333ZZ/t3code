#!/usr/bin/env python3
"""Keep the translations after scripts/supersteward-rebrand.py renamed the source strings.

    python3 scripts/supersteward-i18n.py <git ref with the old strings, default HEAD>

Translations are keyed by a hash of the English source, so a renamed string loses its translations.
This regenerates the English tables, then for every string that differs from the old one only by
the product name, copies each locale's old translation across with the name replaced.
Run it before committing the rename; the old tables are read from git. Format the sources first
(`vp fmt`): a reflowed JSX line changes how a string with a variable in it is split, and such a
string is reported as untranslated and has to be carried over by hand.
"""
import collections, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
# The mobile app is not rebranded, but it shows strings from packages/shared, which is.
APPS = {"apps/web": ["node_modules/.bin/gt", "generate"], "apps/desktop": ["node", "scripts/i18n-generate.mjs"],
        "apps/mobile": ["node_modules/.bin/gt", "generate"]}
OLD, NEW = "T3 Code", "SuperSteward"


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


for app, generate in APPS.items():
    tables = ROOT / app / "src/i18n/translations"

    def before(locale: str) -> dict:
        out = subprocess.run(["git", "show", f"{REF}:{app}/src/i18n/translations/{locale}.json"], cwd=ROOT, capture_output=True, text=True, check=True)
        return json.loads(out.stdout)

    subprocess.run(generate, cwd=ROOT / app, check=True, capture_output=True)
    old_en, new_en = before("en"), json.loads((tables / "en.json").read_text(encoding="utf-8"))
    by_text = collections.defaultdict(list)
    for key, text in old_en.items():
        if key not in new_en:
            by_text[dumps(text)].append(key)
    moved = {key: by_text[dumps(text).replace(NEW, OLD)] for key, text in new_en.items() if key not in old_en}
    lost = [new_en[key] for key, olds in moved.items() if not olds]
    for path in sorted(tables.glob("*.json")):
        if path.stem == "en":
            continue
        old, table, carried = before(path.stem), json.loads(path.read_text(encoding="utf-8")), 0
        for key, olds in moved.items():
            for candidate in olds:
                if candidate in old:
                    table[key] = json.loads(dumps(old[candidate]).replace(OLD, NEW))
                    carried += 1
                    break
        path.write_text(json.dumps(table, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{app}: {len(moved)} renamed strings, {len(lost)} with no earlier translation")
    for text in lost[:10]:
        print("   untranslated:", str(text)[:100])
