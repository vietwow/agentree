"""Split the exported icon JSON into one .svg file per icon, plus a preview page.

Usage: python3 -I tools/split_icons.py raw/port-icons.json icons preview.html
"""
import html
import json
import re
import sys
from pathlib import Path


def to_filename(name: str) -> str:
    """Decide the file name for an icon.

    TODO(you): this is the naming convention for the whole set, so pick what
    matches how your UI code will reference icons.
      - Keep the source names ("AmazonEKS.svg")  -> matches Port's identifiers
      - kebab-case ("amazon-eks.svg")            -> conventional for web assets
    The default below keeps the source name and only strips unsafe characters.
    """
    return re.sub(r"[^A-Za-z0-9_-]", "", name)


def clean(svg: str) -> str:
    """Drop attributes that only make sense inside the original app."""
    head, sep, rest = svg.partition(">")
    head = re.sub(r'\sclass="[^"]*"', "", head)  # utility classes from the host app
    return head + sep + rest


def main(src: str, out_dir: str, preview: str) -> None:
    icons = json.loads(Path(src).read_text(encoding="utf-8"))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    written, skipped = [], []
    seen: dict[str, str] = {}  # lowercased file name -> cleaned content
    for name, svg in sorted(icons.items(), key=lambda kv: (kv[0].lower(), kv[0])):
        fname = to_filename(name)
        if not fname or not svg.lstrip().startswith("<svg") or "<script" in svg.lower():
            skipped.append(name)
            continue
        body = clean(svg)
        # macOS and Windows file systems ignore case, so "Pagerduty" and
        # "pagerduty" would overwrite each other. Drop exact duplicates and
        # give a real variant its own name.
        key = fname.lower()
        if key in seen:
            if seen[key] == body:
                skipped.append(f"{name} (same as existing)")
                continue
            fname = f"{fname}_2"
            key = fname.lower()
        seen[key] = body
        (out / f"{fname}.svg").write_text(body + "\n", encoding="utf-8")
        written.append(fname)

    cells = "\n".join(
        f'<figure><img src="{html.escape(out.name)}/{html.escape(n)}.svg" alt="" loading="lazy">'
        f"<figcaption>{html.escape(n)}</figcaption></figure>"
        for n in written
    )
    Path(preview).write_text(
        "<!doctype html><meta charset=utf-8><title>Icon preview</title>"
        "<style>body{font:13px system-ui;margin:24px;background:#fafafa;color:#222}"
        "input{font:inherit;padding:8px 12px;width:280px;margin-bottom:16px}"
        ".g{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}"
        "figure{margin:0;padding:14px 6px;background:#fff;border:1px solid #e5e5e5;border-radius:8px;text-align:center}"
        "img{width:32px;height:32px}figcaption{margin-top:8px;word-break:break-all;color:#555}</style>"
        f"<h1>{len(written)} icons</h1><input placeholder='Filter…' oninput=\""
        "for(const f of document.querySelectorAll('figure'))"
        "f.hidden=!f.textContent.toLowerCase().includes(this.value.toLowerCase())\">"
        f"<div class=g>\n{cells}\n</div>\n",
        encoding="utf-8",
    )
    print(f"written={len(written)} skipped={skipped}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
