#!/usr/bin/env python3
"""Apply the SuperSteward name and app identity over an upstream tree.

    python3 scripts/supersteward-rebrand.py          # rewrite files in place
    python3 scripts/supersteward-rebrand.py --check  # exit 1 if anything is still upstream-branded

Rerun after every merge from upstream: new upstream strings come in under the old name.
What it changes is what a person sees or what would collide with an official T3 Code on the same
machine: the display name, the desktop app's bundle id, link scheme and profile directory, and the
default data directory. Internal identifiers (package scope, env vars, the `t3` command, wire
values such as the "t3code" attribution) stay as upstream has them; renaming them buys nothing a
user can see and makes every merge harder.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCOPE = ["apps/server", "apps/web", "apps/desktop", "packages", "docs/user",
         "scripts/build-desktop-artifact.ts", "scripts/build-desktop-artifact.test.ts"]
SKIP_DIRS = {"node_modules", "dist", "dist-electron", "dist-exe", ".electron-runtime", "translations", ".turbo"}
# Test files whose data uses the upstream name as sample text; renaming it changes what they test.
KEEP = {"packages/shared/src/paletteSearch.test.ts", "packages/shared/src/speech.test.ts",
        "packages/shared/src/t3McpToolPresentation.test.ts",
        # the dev checkout's own `.t3`, which is not the installed app's data directory
        "packages/shared/src/devHome.ts", "packages/shared/src/devHome.test.ts",
        # upstream's issue-triage prompt must stay byte-identical to .github/triage/PLAYBOOK.md
        "apps/server/src/triage/triagePrompt.ts", "apps/server/src/triage/triagePrompt.test.ts"}
TEXT = {".ts", ".tsx", ".mjs", ".cjs", ".js", ".json", ".html", ".md", ".xml", ".plist", ".desktop", ".svg", ".css"}

# (pattern, replacement), applied in order to every file in scope
RULES = [
    (r"T3 Code", "SuperSteward"),
    (r"T3(\+|%20)Code", "SuperSteward"),
    (r"t3code-dev", "supersteward-dev"),
    (r"t3code://", "supersteward://"),
    (r'"t3code", "supersteward-dev"', '"supersteward", "supersteward-dev"'),
    (r'"t3code"\}://', '"supersteward"}://'),
    (r"T3CODE://", "SUPERSTEWARD://"),
    (r'dataHome, "t3code"', 'dataHome, "supersteward"'),
    (r"x-scheme-handler/t3code", "x-scheme-handler/supersteward"),
    (r'"t3code-v2"', '"supersteward"'),
    (r"Application Support/t3code-v2", "Application Support/supersteward"),
    (r"SuperSteward/t3code\b", "SuperSteward/supersteward"),
    (r'scheme: "t3code"', 'scheme: "supersteward"'),
    (r"app-data/t3code-v2", "app-data/supersteward"),
    (r'"t3code/extension-backups"', '"supersteward/extension-backups"'),
    (r"com\.t3tools\.t3code", "com.supersteward.app"),
    (r"com\.t3tools\.T3Code", "com.supersteward.App"),
]
# (path prefix, pattern, replacement): only under that directory
# The default data directory, wherever it is spelled out. Not the per-worktree `.t3` of a dev
# checkout (packages/shared/src/devHome.ts) and not names that merely start with `.t3-`.
HOME_DIR = r"(?<![\w.-])\.t3(?!\\\.)(?=[/\"'`)\\\s,;:]|$)"
DIR_RULES = [
    ("apps/server/src", HOME_DIR, ".supersteward"),
    ("apps/desktop/src", HOME_DIR, ".supersteward"),
    ("apps/web/src", HOME_DIR, ".supersteward"),
    ("packages/ssh/src", HOME_DIR, ".supersteward"),
    ("packages/shared/src", HOME_DIR, ".supersteward"),
    ("packages/client-runtime/src", HOME_DIR, ".supersteward"),
    ("docs/user", HOME_DIR, ".supersteward"),
    # ...except where a test builds the dev checkout's own `.t3`
    ("apps/server/src/storageCleanup.test.ts", r"\$\{checkout\}/\.supersteward", "${checkout}/.t3"),
    ("apps/desktop/src", r"/\.t3/", "/.supersteward/"),
    ("apps/desktop/src", r'"\.t3"', '".supersteward"'),
    ("apps/desktop/src", r"/\.t3`", "/.supersteward`"),
    # these two tests are about quoting a launcher path that has a space in it
    ("apps/desktop/src/app/DesktopLinuxUrlHandler.test.ts", r"/opt/SuperSteward/supersteward", "/opt/Super Steward/supersteward"),
    ("apps/desktop/src/app/DesktopPreReadyPlatform.test.ts", r"/opt/SuperSteward/supersteward", "/opt/Super Steward/supersteward"),
]
# (file, pattern, replacement): identity that is only safe to change in a named place
FILE_RULES = [
    ("apps/desktop/src/electron/ElectronProtocol.ts", r'DESKTOP_PRODUCTION_SCHEME = "t3code"', 'DESKTOP_PRODUCTION_SCHEME = "supersteward"'),
    ("apps/desktop/scripts/electron-launcher.mjs", r'\["t3code"\]', '["supersteward"]'),
    ("apps/desktop/src/app/DesktopUserData.ts", r'"t3code-v2"', '"supersteward"'),
    ("scripts/build-desktop-artifact.ts", r'schemes: \["t3code", ', 'schemes: ["supersteward", '),
    ("scripts/build-desktop-artifact.ts", r'executableName: "t3code"', 'executableName: "supersteward"'),
    ("packages/shared/src/remote.ts", r"\^t3code\(\?:-\[a-z\]\+\)\?:\$", "^supersteward(?:-[a-z]+)?:$"),
    ("packages/shared/src/promptLinks.ts", r'scheme = "t3code"', 'scheme = "supersteward"'),
    ("packages/shared/src/promptLinks.ts", r"\^t3code\(\?:-\[a-z\]\+\)\?:\$", "^supersteward(?:-[a-z]+)?:$"),
    ("packages/shared/src/providerAuthReturnUrl.ts", r'"t3code:"', '"supersteward:"'),
    ("packages/shared/src/codexAuthHandoff.ts", r'"t3code:"', '"supersteward:"'),
    ("apps/server/src/os-jank.ts", r'HomeDirectory, "\.t3"\)', 'HomeDirectory, ".supersteward")'),
    ("apps/server/src/cli/browser.ts", r'path\.join\(home, "\.t3"\)', 'path.join(home, ".supersteward")'),
    ("apps/desktop/src/app/DesktopStatePaths.ts", r'homeDirectory, "\.t3"\)', 'homeDirectory, ".supersteward")'),
]
LEFTOVER = re.compile(r"T3 Code|[tT]3[cC][oO][dD][eE]://|t3code-dev|com\.t3tools\.t3code")


def files():
    for entry in SCOPE:
        base = ROOT / entry
        paths = [base] if base.is_file() else base.rglob("*")
        for p in paths:
            if p.is_file() and p.suffix in TEXT and not (SKIP_DIRS & set(p.relative_to(ROOT).parts)) and str(p.relative_to(ROOT)) not in KEEP:
                yield p


def main() -> int:
    check = "--check" in sys.argv
    changed, left = 0, []
    per_file = {}
    for f, pat, rep in FILE_RULES:
        per_file.setdefault(ROOT / f, []).append((pat, rep))
    for p in files():
        try:
            old = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        new = old
        rel = str(p.relative_to(ROOT))
        for pat, rep in RULES + [(pat, rep) for d, pat, rep in DIR_RULES if rel.startswith(d)] + per_file.get(p, []):
            new = re.sub(pat, rep, new)
        if LEFTOVER.search(new):
            left.append(p.relative_to(ROOT))
        if new != old:
            changed += 1
            if not check:
                p.write_text(new, encoding="utf-8")
    print(f"{'would change' if check else 'changed'} {changed} files; {len(left)} still carry the upstream name")
    for p in left[:20]:
        print("  leftover:", p)
    return 1 if check and (changed or left) else 0


if __name__ == "__main__":
    sys.exit(main())
