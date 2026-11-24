"""Write the element checklist of a part into its inventory.md.

usage: inventory.py [--check] <part-directory>...

Reads every record file of the part and replaces the text between the
`<!-- checklist:start -->` and `<!-- checklist:end -->` markers of
`<part-directory>/inventory.md` with one line per measured element. A file
with no `base` is a whole record: its elements are listed as a tree of ids,
each with the states that change it. A file with a `base` is a difference
from the state it names: the elements that exist only in it are listed. The
whole record of the state `base` comes first, then every other file in the
order of its name. The count of distinct measured elements is written on the
line that starts with `Elements measured:`.

With `--check` nothing is written: the command fails, naming the part, when
its inventory.md is not what the tool writes.
"""

import glob
import json
import os
import re
import sys

START, END = "<!-- checklist:start -->", "<!-- checklist:end -->"
CHANGES = ("modified", "added", "removed")


def describe(element: dict) -> str:
    words = (element.get("text") or element.get("name") or "").replace("`", "'")
    label = f", `{words[:40]}`" if words else ""
    icon = ", icon" if "icon" in element else ""
    return f"`{element['id']}` ({element['tag']}{label}{icon})"


def tree(elements: list[dict], note) -> list[str]:
    # An element is nested under the nearest listed element whose id is a
    # prefix of its own, one level at a time so that the list stays a list.
    listed = {element["id"] for element in elements}
    lines = []
    previous = -1
    for element in elements:
        parts = element["id"].split("/")
        ancestors = sum("/".join(parts[:n]) in listed for n in range(1, len(parts)))
        previous = min(ancestors, previous + 1)
        lines.append(f"{'  ' * previous}- [x] {describe(element)}{note(element)}")
    return lines


def not_measured(record: dict) -> list[str]:
    return [f"- [ ] `{item['id']}`: not measured, {item['reason']}" for item in record.get("notMeasured", [])]


def read(part: str) -> tuple[dict[str, dict], dict[str, str]]:
    """The records of a part by state, and the file each was read from."""
    files: dict[str, dict] = {}
    paths: dict[str, str] = {}
    for path in sorted(glob.glob(os.path.join(part, "*.json"))):
        with open(path, encoding="utf-8") as file:
            record = json.load(file)
        if "elements" not in record or "state" not in record:
            continue
        state = record["state"]
        if state in files:
            sys.exit(f"{path}: the state `{state}` is also that of {paths[state]}")
        files[state], paths[state] = record, path
    for state, record in files.items():
        if "base" not in record:
            continue
        if record["base"] not in files:
            sys.exit(f"{paths[state]}: its base `{record['base']}` is the state of no file of {part}")
        for element in record["elements"]:
            if element.get("change") not in CHANGES:
                sys.exit(
                    f"{paths[state]}: the element `{element.get('id')}` has no `change` "
                    f"({', '.join(CHANGES)}), which every element of a file with a `base` has"
                )
    return files, paths


def whole_record_of(state: str, files: dict[str, dict], paths: dict[str, str]) -> str:
    """The whole record a state is a difference from, through the states between."""
    seen = [state]
    while "base" in files[state]:
        state = files[state]["base"]
        if state in seen:
            sys.exit(f"{paths[state]}: its base leads back to it ({' from '.join(seen)})")
        seen.append(state)
    return state


def checklist(part: str) -> tuple[str, str]:
    """The checklist of a part and its line of the count."""
    files, paths = read(part)
    whole = [state for state, record in files.items() if "base" not in record]
    if not whole:
        sys.exit(f"{part}: no file is a whole record (one with no `base`)")
    # The states that change an element of a whole record, by that record.
    touched: dict[str, dict[str, list[str]]] = {state: {} for state in whole}
    for state, record in files.items():
        if "base" not in record:
            continue
        changes = touched[whole_record_of(state, files, paths)]
        for element in record["elements"]:
            if element["change"] in ("modified", "removed"):
                changes.setdefault(element["id"], []).append(state)

    def changed_in(state: str):
        changes = touched[state]
        return lambda e: f"; changes in: {', '.join(changes[e['id']])}" if e["id"] in changes else ""

    measured: set[str] = set()
    out: list[str] = []
    for state in sorted(files, key=lambda each: each != "base"):
        record = files[state]
        name = os.path.basename(paths[state])
        if out:
            out.append("")
        if "base" not in record:
            measured.update(element["id"] for element in record["elements"])
            lines = tree(record["elements"], changed_in(state))
            if state == "base":
                out += [f"### Base state (`{name}`)", ""] + lines
                continue
            out += [
                f"### State `{state}` (`{name}`, a whole record)",
                "",
                f"{len(record['elements'])} elements in this state.",
            ]
        else:
            counts = {kind: 0 for kind in CHANGES}
            for element in record["elements"]:
                counts[element["change"]] += 1
            added = [element for element in record["elements"] if element["change"] == "added"]
            measured.update(element["id"] for element in added)
            lines = tree(added, lambda e: "")
            out += [
                f"### State `{state}` (`{name}`, differences from `{record['base']}`)",
                "",
                f"{counts['modified']} changed, {counts['added']} only in this state, {counts['removed']} absent in this state.",
            ]
        lines += not_measured(record)
        if lines:
            out += [""] + lines
    if "base" in files and "base" not in files["base"]:
        resting = len(files["base"]["elements"])
        split = f"{resting} in the base state, {len(measured) - resting} that exist only in a state"
    else:
        resting = len({element["id"] for state in whole for element in files[state]["elements"]})
        split = f"{resting} in the {len(whole)} whole records, {len(measured) - resting} that exist only in a difference from one"
    count = f"Elements measured: {len(measured)} distinct elements ({split}), in {len(files)} files."
    return "\n".join(out), count


def written(part: str) -> tuple[str, str, str]:
    """The inventory of a part: its file, its text, and the text the tool writes."""
    target = os.path.join(part, "inventory.md")
    with open(target, encoding="utf-8") as file:
        text = file.read()
    if text.count(START) != 1 or text.count(END) != 1 or not re.search(r"^Elements measured:", text, flags=re.M):
        sys.exit(f"{target}: it needs `{START}` and `{END}` once each, and a line that starts with `Elements measured:`")
    lines, count = checklist(part)
    head, rest = text.split(START)
    tail = rest.split(END)[1]
    result = head + START + "\n\n" + lines + "\n\n" + END + tail
    return target, text, re.sub(r"^Elements measured:.*$", lambda _: count, result, flags=re.M)


def main() -> None:
    arguments = sys.argv[1:]
    check = "--check" in arguments
    parts = [argument.rstrip("/") for argument in arguments if argument != "--check"]
    if not parts:
        sys.exit(__doc__)
    stale = []
    for part in parts:
        target, text, result = written(part)
        count = re.search(r"^Elements measured: (.*)$", result, flags=re.M).group(1)
        if check:
            if text != result:
                stale.append(target)
            continue
        with open(target, "w", encoding="utf-8") as file:
            file.write(result)
        print(f"{target}: {count}")
    if stale:
        sys.exit("\n".join(f"{target}: not what `inventory.py {os.path.dirname(target)}` writes" for target in stale))


if __name__ == "__main__":
    main()
