# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools[woff]==4.61.1"]
# ///
"""Regenerate the committed heading font with `bun run fonts:build`.

Use all printable TSX characters as a conservative superset of heading text,
including conditional headings and dialog titles. Dynamic card names use the
body font. The source font and its SIL OFL license remain in Fontsource/licenses.
Normal application builds only consume the generated assets; Python is only
needed when UI copy introduces a new character. The coverage test detects this.
"""

import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "node_modules/@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-700-normal.woff2"
OUTPUT = ROOT / "src/assets"

characters = set(chr(codepoint) for codepoint in range(32, 127))
for path in sorted((ROOT / "src").rglob("*.tsx")):
    characters.update(char for char in path.read_text() if char.isprintable())

font = TTFont(SOURCE, recalcTimestamp=False)
missing = characters - set(map(chr, font.getBestCmap()))
if missing:
    raise ValueError(f"Heading font: source font lacks characters {sorted(missing)!r}")

options = subset.Options()
options.flavor = "woff2"
options.recalc_timestamp = False
# Preserve the original copyright and license metadata in the subset.
options.name_IDs = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(text="".join(sorted(characters)))
subsetter.subset(font)
font.flavor = "woff2"
OUTPUT.mkdir(exist_ok=True)
font.save(OUTPUT / "heading-font.woff2")
(OUTPUT / "heading-font-characters.json").write_text(
    json.dumps("".join(sorted(characters)), ensure_ascii=False) + "\n"
)
print(f"Heading font: {len(characters)} characters, {(OUTPUT / 'heading-font.woff2').stat().st_size:,} bytes")
