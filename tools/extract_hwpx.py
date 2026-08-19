"""Extract numbered 스레드 서당 entries from an HWPX document into JSON."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


HEADING_RE = re.compile(r"(?:💬\s*)?스+레드\s*서당\s*#?\s*(\d+)", re.IGNORECASE)


def paragraphs_from_hwpx(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("Contents/section0.xml"))

    paragraphs: list[str] = []
    for node in root.iter():
        if not node.tag.endswith("}p"):
            continue
        text = "".join(
            (child.text or "") for child in node.iter() if child.tag.endswith("}t")
        ).strip()
        if text:
            paragraphs.append(text)
    return paragraphs


def clean_line(line: str) -> str:
    line = line.replace("**", "").strip()
    if set(line) <= {"━", "—", "-", "─"}:
        return ""
    return line


def extract_entries(paragraphs: list[str]) -> list[dict[str, object]]:
    starts: list[tuple[int, int]] = []
    for index, line in enumerate(paragraphs):
        match = HEADING_RE.search(line)
        if match:
            starts.append((index, int(match.group(1))))

    entries: list[dict[str, object]] = []
    seen: set[int] = set()
    for position, (start, number) in enumerate(starts):
        if number in seen:
            continue
        end = starts[position + 1][0] if position + 1 < len(starts) else len(paragraphs)
        lines = [clean_line(line) for line in paragraphs[start + 1 : end]]
        lines = [line for line in lines if line]
        if not lines:
            continue
        title = lines[0]
        body = "\n".join(lines)
        entries.append(
            {
                "source_no": number,
                "title": title,
                "body": body,
            }
        )
        seen.add(number)

    # A few source headings omit the numbered "스레드 서당" line. Split the
    # embedded next entry at its distinctive title so it remains selectable.
    inferred_splits = (
        (20, 21, "天乙貴人 (천을귀인)"),
        (49, 50, "寸陰可惜 (촌음가석)"),
    )
    for previous_no, inferred_no, marker in inferred_splits:
        previous = next(
            (entry for entry in entries if entry["source_no"] == previous_no), None
        )
        if previous is None or inferred_no in seen:
            continue
        body_lines = str(previous["body"]).splitlines()
        if marker not in body_lines:
            continue
        split_at = body_lines.index(marker)
        previous["body"] = "\n".join(body_lines[:split_at]).strip()
        inferred_body = "\n".join(body_lines[split_at:]).strip()
        entries.append(
            {
                "source_no": inferred_no,
                "title": marker,
                "body": inferred_body,
            }
        )
        seen.add(inferred_no)

    entries.sort(key=lambda item: int(item["source_no"]))
    return entries


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract_hwpx.py INPUT.hwpx OUTPUT.json")

    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    entries = extract_entries(paragraphs_from_hwpx(source))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"extracted {len(entries)} entries to {destination}")


if __name__ == "__main__":
    main()
