#!/usr/bin/env bash
# Build script for Underdogs Guidebook site.
# - Syncs Korean (docs/guidebook/) and English (docs/guidebook-en/) sources.
# - Renames all README.md to index.md so directories resolve as pages.
# - Auto-generates index.md landing pages for sections that lack one.
# - Runs mkdocs build with Material + static-i18n.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

SRC_KO="$ROOT/docs/guidebook"
SRC_EN="$ROOT/docs/guidebook-en"
DST_KO="$HERE/docs/ko"
DST_EN="$HERE/docs/en"

echo "==> Cleaning previous output"
rm -rf "$DST_KO" "$DST_EN" "$HERE/dist"
mkdir -p "$DST_KO" "$DST_EN"

echo "==> Copying Korean source → docs/ko/"
cp -R "$SRC_KO"/. "$DST_KO"/

echo "==> Copying English source → docs/en/"
cp -R "$SRC_EN"/. "$DST_EN"/

echo "==> Renaming README.md → index.md (all directories)"
find "$DST_KO" "$DST_EN" -type f -name "README.md" | while read -r f; do
  mv "$f" "$(dirname "$f")/index.md"
done

# ──────────────────────────────────────────────────────────────────────────
# Auto-generate index.md landing pages for sections that lack one.
# Uses Python to scan each directory, extract h1/title of each child page,
# and generate a brand-styled card-grid landing page.
# ──────────────────────────────────────────────────────────────────────────
echo "==> Auto-generating section landing pages"
python3 - "$DST_KO" "$DST_EN" <<'PYEOF'
import sys
import re
from pathlib import Path

# Language-specific labels
LABELS = {
    "ko": {
        "section_intro": "이 섹션에서 다루는 내용입니다.",
        "chapter_prefix": "",
        "read_more": "자세히 보기 →",
        "sections": {
            "01-start": ("시작하기", "가이드북을 처음 펼쳤을 때 먼저 읽어야 할 두 챕터."),
            "02-field": ("현장 실전", "RFP 를 받고 제안서를 완성하기까지 필요한 사고법과 체크리스트."),
            "03-casebook": ("케이스북", "언더독스가 수행한 실제 사업 사례 8건. 신입 PM 이 감을 빠르게 잡는 자산."),
            "04-channel-types": ("발주처 타입 전략", "B2G · B2B · 재계약 — 타입별 톤·구조·주의사항."),
            "appendix": ("부록", "제출 직전 체크리스트와 언더독스 공식 자산 참고표."),
            "03-casebook/06-startup-education": ("Ch.6 창업교육", "NH 애그테크 · GS 리테일 · 코오롱 프로보노"),
            "03-casebook/07-local-commerce": ("Ch.7 로컬·상권", "종로구 서촌 로컬브랜드 상권강화"),
            "03-casebook/08-culture-tourism": ("Ch.8 문화·관광", "관광기념품 박람회 · 한지 디자인 공모전 · 안성 글로컬"),
            "03-casebook/09-global": ("Ch.9 글로벌 진출", "예비창업 글로벌 트랙"),
        },
    },
    "en": {
        "section_intro": "Topics covered in this section.",
        "chapter_prefix": "",
        "read_more": "Read →",
        "sections": {
            "01-start": ("Getting Started", "The two chapters to read first when opening the guidebook."),
            "02-field": ("Field Practice", "Thinking frames and checklists from receiving an RFP to finishing the proposal."),
            "03-casebook": ("Casebook", "Eight real Underdogs case studies. The fastest way for a new PM to build intuition."),
            "04-channel-types": ("Channel Type Strategy", "B2G · B2B · Renewal — tone, structure, and cautions per type."),
            "appendix": ("Appendix", "Pre-submission checklist and Underdogs official asset reference."),
            "03-casebook/06-startup-education": ("Ch.6 Startup Education", "NH Agritech · GS Retail · Kolon Pro Bono"),
            "03-casebook/07-local-commerce": ("Ch.7 Local Commerce", "Seochon (Jongno-gu) Local-Brand Revitalization"),
            "03-casebook/08-culture-tourism": ("Ch.8 Culture & Tourism", "Tourism Souvenir Expo · Hanji Design Competition · Anseong Glocal"),
            "03-casebook/09-global": ("Ch.9 Global Expansion", "Aspiring Entrepreneur Package Global Track"),
        },
    },
}

def extract_title(md_path: Path) -> str:
    try:
        with md_path.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("# "):
                    return line[2:].strip()
    except Exception:
        pass
    return md_path.stem

def build_landing(dir_path: Path, lang: str, rel: str) -> str:
    labels = LABELS[lang]
    title, intro = labels["sections"].get(rel, (rel.split("/")[-1], labels["section_intro"]))

    # Gather child pages (exclude index.md itself) and child directories.
    pages = []
    for md in sorted(dir_path.glob("*.md")):
        if md.name == "index.md":
            continue
        pages.append({
            "href": md.stem + "/",
            "title": extract_title(md),
        })

    subdirs = []
    for sub in sorted(p for p in dir_path.iterdir() if p.is_dir()):
        sub_title, sub_intro = labels["sections"].get(
            f"{rel}/{sub.name}" if rel else sub.name,
            (sub.name, "")
        )
        subdirs.append({
            "href": sub.name + "/",
            "title": sub_title,
            "intro": sub_intro,
        })

    # Assemble — frontmatter hides toc, raw HTML cards so markdown parser doesn't wrap in <p>
    lines = [
        "---",
        "hide:",
        "  - toc",
        "---",
        "",
        f"# {title}",
        "",
        intro,
        "",
    ]

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    if subdirs:
        lines.append('<div class="ud-cards" markdown="0">')
        for d in subdirs:
            intro_html = f'<p class="ud-card__desc">{esc(d["intro"])}</p>' if d.get("intro") else ""
            lines.append(
                f'<a class="ud-card" href="{d["href"]}">'
                f'<h3 class="ud-card__title">{esc(d["title"])}</h3>'
                f'{intro_html}'
                f'<span class="ud-card__meta">{labels["read_more"]}</span>'
                f'</a>'
            )
        lines.append('</div>')
        lines.append("")

    if pages:
        lines.append('<div class="ud-cards" markdown="0">')
        for p in pages:
            lines.append(
                f'<a class="ud-card" href="{p["href"]}">'
                f'<h3 class="ud-card__title">{esc(p["title"])}</h3>'
                f'<span class="ud-card__meta">{labels["read_more"]}</span>'
                f'</a>'
            )
        lines.append('</div>')
        lines.append("")

    return "\n".join(lines) + "\n"

def process(root: Path, lang: str) -> None:
    # Walk all directories under the root and create an index.md where missing.
    for d in root.rglob("*"):
        if not d.is_dir():
            continue
        # Skip assets
        if d.name.startswith(".") or d.name == "assets":
            continue
        idx = d / "index.md"
        if idx.exists():
            continue
        rel = d.relative_to(root).as_posix()
        if not rel or rel == ".":
            continue
        landing = build_landing(d, lang, rel)
        idx.write_text(landing, encoding="utf-8")
        print(f"  + generated {lang}/{rel}/index.md")

ko_root = Path(sys.argv[1])
en_root = Path(sys.argv[2])

print("  -- Korean --")
process(ko_root, "ko")
print("  -- English --")
process(en_root, "en")
PYEOF

echo "==> Running mkdocs build"
cd "$HERE"
python -m mkdocs build --quiet

echo "==> Build complete. Output in $HERE/dist/"
