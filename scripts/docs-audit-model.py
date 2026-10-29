#!/usr/bin/env python3
"""Build a repeatable docs relationship model without modifying repository content."""
from __future__ import annotations

import json
import math
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / ".artifacts" / "docs-audit"
STOP = set("the and for with from this that are was into only use using have has not our their your all can any one two how what when where why a an of to in on or is as by be it its we you i at do no if then than also more less".split())

def words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}", text.lower()) if w not in STOP]

def links(path: Path, text: str) -> list[str]:
    result = []
    for raw in re.findall(r"\[[^]]*\]\(([^)]+)\)", text):
        target = raw.strip().split()[0].split("#", 1)[0]
        if target and not target.startswith(("http://", "https://", "mailto:")):
            result.append(str((path.parent / target).resolve().relative_to(ROOT)) if not target.startswith("<") else target)
    return result

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    files = sorted(DOCS.rglob("*.md"))
    docs = {}
    inverted = defaultdict(set)
    for p in files:
        text = p.read_text(encoding="utf-8", errors="replace")
        rel = str(p.relative_to(ROOT))
        terms = Counter(words(text))
        docs[rel] = {
            "path": rel,
            "bytes": p.stat().st_size,
            "lines": text.count("\n") + 1,
            "headings": re.findall(r"^#{1,6}\s+(.+)$", text, re.M),
            "terms": terms,
            "links": links(p, text),
        }
        for term in terms:
            inverted[term].add(rel)

    similarities = []
    for i, left in enumerate(files):
        a = docs[str(left.relative_to(ROOT))]["terms"]
        for right in files[i + 1:]:
            b = docs[str(right.relative_to(ROOT))]["terms"]
            common = set(a) & set(b)
            dot = sum(a[x] * b[x] for x in common)
            norm = math.sqrt(sum(v*v for v in a.values()) * sum(v*v for v in b.values()))
            score = dot / norm if norm else 0
            if score >= 0.28:
                similarities.append({"left": str(left.relative_to(ROOT)), "right": str(right.relative_to(ROOT)), "score": round(score, 4), "shared_terms": sorted(common, key=lambda x: -(a[x] + b[x]))[:20]})

    all_text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in ROOT.rglob("*.md") if ".git" not in p.parts and ".artifacts" not in p.parts)
    inbound = defaultdict(list)
    for rel, item in docs.items():
        for target in item["links"]:
            inbound[target].append(rel)
    model = {
        "version": 1,
        "docs_count": len(files),
        "docs": [{k: v for k, v in item.items() if k != "terms"} | {"top_terms": item["terms"].most_common(20)} for item in docs.values()],
        "similarity_candidates": sorted(similarities, key=lambda x: -x["score"]),
        "inbound_references": dict(sorted(inbound.items())),
        "unresolved_local_targets": sorted({target for targets in inbound for target in [targets] if not (ROOT / target).exists()}),
        "repomix": [".repomix/01-repository-overview.xml", ".repomix/02-docs-full.xml", ".repomix/03-source-context.xml"],
    }
    (OUT / "docs-relationship-model.json").write_text(json.dumps(model, ensure_ascii=False, indent=2) + "\n")
    summary = {
        "docs_count": len(files),
        "similarity_candidates": len(similarities),
        "top_similarity": similarities[:50],
        "referenced_targets": len(inbound),
        "unresolved_local_targets": model["unresolved_local_targets"],
    }
    (OUT / "docs-relationship-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
