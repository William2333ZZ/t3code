#!/usr/bin/env python3
"""Regenerate every app icon from assets/supersteward/mark.svg (macOS: needs Google Chrome and sips).

    python3 scripts/supersteward-icons.py

The upstream Icon Composer projects under assets/*/app-icon.icon are not used by this fork; the
three channels share one mark. Rerun after changing mark.svg.
"""
import pathlib, re, struct, subprocess, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARK = ROOT / "assets/supersteward/mark.svg"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHANNELS = {"prod": ("black", "t3-black"), "dev": ("blueprint", "blueprint"), "nightly": ("nightly", "nightly")}


def render(html: str, out: pathlib.Path, work: pathlib.Path) -> None:
    page = work / "page.html"
    page.write_text(html, encoding="utf-8")
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--allow-file-access-from-files", "--hide-scrollbars",
         "--default-background-color=00000000", "--window-size=1024,1024", f"--screenshot={out}", page.as_uri()],
        check=True, capture_output=True)


def resize(src: pathlib.Path, size: int, out: pathlib.Path) -> None:
    subprocess.run(["sips", "-z", str(size), str(size), str(src), "--out", str(out)], check=True, capture_output=True)


def ico(pngs: list[pathlib.Path], out: pathlib.Path) -> None:
    """An .ico whose entries are PNG files, which every current reader accepts."""
    blobs = [p.read_bytes() for p in pngs]
    sizes = [int(re.search(r"-(\d+)\.png$", p.name).group(1)) for p in pngs]
    head = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    entries = b""
    for size, blob in zip(sizes, blobs):
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    out.write_bytes(head + entries + b"".join(blobs))


def main() -> None:
    svg = MARK.read_text(encoding="utf-8")
    inner = re.sub(r"<rect[^>]*/>", '<rect width="128" height="128" fill="#18233A"/>', svg, count=1)
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        (work / "mark.svg").write_text(svg, encoding="utf-8")
        full, mac, rounded = work / "full.png", work / "mac.png", work / "round.png"
        render(f'<body style="margin:0">{inner.replace("<svg ", "<svg width=1024 height=1024 style=display:block ", 1)}</body>', full, work)
        render('<body style="margin:0"><div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">'
               '<img src="mark.svg" width="824" height="824" style="filter:drop-shadow(0 10px 18px rgba(0,0,0,.28))"></div></body>', mac, work)
        render('<body style="margin:0"><img src="mark.svg" width="1024" height="1024" style="display:block"></body>', rounded, work)
        small = {}
        for size in (16, 32, 48, 180, 192, 256, 512):
            small[size] = work / f"round-{size}.png"
            resize(rounded, size, small[size])
        favicon = work / "favicon.ico"
        ico([small[16], small[32], small[48], small[256]], favicon)
        for channel, (app, web) in CHANNELS.items():
            d = ROOT / "assets" / channel
            for name, src in {
                f"{app}-ios-1024.png": full, f"{app}-universal-1024.png": full, f"{app}-macos-1024.png": mac,
                f"{web}-web-apple-touch-180.png": small[180], f"{web}-web-favicon-16x16.png": small[16],
                f"{web}-web-favicon-32x32.png": small[32], f"{web}-web-icon-192x192.png": small[192],
                f"{web}-web-icon-512x512.png": small[512], f"{web}-web-favicon.ico": favicon, f"{web}-windows.ico": favicon,
            }.items():
                if (d / name).exists():
                    (d / name).write_bytes(src.read_bytes())
                else:
                    print("skipped (no such upstream file):", d / name)
        public = ROOT / "apps/web/public"
        for name, src in {"favicon-16x16.png": small[16], "favicon-32x32.png": small[32], "apple-touch-icon.png": small[180],
                          "icon-192x192.png": small[192], "icon-512x512.png": small[512], "favicon.ico": favicon}.items():
            (public / name).write_bytes(src.read_bytes())
    (ROOT / "assets/prod/logo.svg").write_text(svg, encoding="utf-8")
    print("icons regenerated from", MARK.relative_to(ROOT))


if __name__ == "__main__":
    main()
