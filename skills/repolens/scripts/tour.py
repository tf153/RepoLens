#!/usr/bin/env python3
"""RepoLens skill helper: Graphify graph -> Gemma 4 onboarding tour.

Usage (from the repo root, after `graphify extract . --code-only`):
    python3 scripts/tour.py            # writes ONBOARDING.md
    python3 scripts/tour.py --json     # prints the tour as JSON
    python3 scripts/tour.py --out DIR  # graphify-out location (default ./graphify-out)

Stdlib only, plus `google-genai` when GEMINI_API_KEY is set (pip install google-genai).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

MODEL = os.environ.get("GEMMA_MODEL", "gemma-4-26b-a4b-it")

PROMPT = """You are RepoLens, an expert engineer onboarding a new teammate to a codebase.
You are given a knowledge-graph summary built by Graphify (tree-sitter AST -> graph; Leiden communities = subsystems;
"god nodes" = most-connected abstractions). Use ONLY this evidence plus the README excerpt. Do not invent files or symbols.

Repository: {name}

=== README EXCERPT ===
{readme}

=== GRAPH EVIDENCE ===
{graph}

Respond with a single JSON object (no prose outside it) with exactly these keys:
{{
  "architecture_summary": "3-6 sentences on what the project is, its layers, and how control flows; name concrete symbols/files",
  "start_here": [ {{"node": "<symbol>", "file": "<path:line>", "why": "<one sentence>"}} ],
  "subsystems": [ {{"community": <id>, "label": "<2-4 word name>", "role": "<one sentence>"}} ],
  "reading_path": [ {{"step": 1, "file": "<path>", "what_to_look_for": "<one sentence>"}} ],
  "gotchas": ["<surprising coupling or risk, cite symbols>"],
  "onboarding_md": "<complete markdown doc (~300-500 words) with headings Overview, Architecture, Start Here, Key Subsystems, Reading Path, Gotchas; cite file:line>"
}}"""


def load(out: Path):
    g = json.loads((out / "graph.json").read_text())
    a = {}
    ap = out / ".graphify_analysis.json"
    if ap.exists():
        a = json.loads(ap.read_text())
    return g, a


def is_file_node(n: dict) -> bool:
    lab = n.get("label", "")
    return n.get("source_location") in (None, "L1") and ("." in lab or "/" in lab) and not n.get("_callable")


def evidence(g: dict, a: dict) -> tuple[str, list[dict], list[dict]]:
    nodes = {n["id"]: n for n in g["nodes"]}
    deg: Counter = Counter()
    for e in g.get("links", []):
        deg[e["source"]] += 1
        deg[e["target"]] += 1
    loc = lambda n: f"{n.get('source_file')}:{n.get('source_location')}" if n.get("source_file") else "?"  # noqa: E731

    gods = []
    for x in (a.get("gods") or [])[:12]:
        n = nodes.get(x.get("id"))
        if n:
            gods.append({"label": n.get("label"), "degree": x.get("degree", deg[x["id"]]), "loc": loc(n), "file": n.get("source_file"),
                         "community": n.get("community")})
    if not gods:
        for nid, d in deg.most_common(60):
            n = nodes[nid]
            if is_file_node(n) or n.get("external"):
                continue
            gods.append({"label": n.get("label"), "degree": d, "loc": loc(n), "file": n.get("source_file"), "community": n.get("community")})
            if len(gods) >= 12:
                break

    groups: dict[int, list[str]] = defaultdict(list)
    for nid, n in nodes.items():
        if n.get("community") is not None:
            groups[int(n["community"])].append(nid)
    comms = []
    for cid, members in sorted(groups.items(), key=lambda kv: len(kv[1]), reverse=True)[:14]:
        ranked = sorted(members, key=lambda m: deg[m], reverse=True)
        syms = [m for m in ranked if not is_file_node(nodes[m]) and not nodes[m].get("external")]
        files = Counter(nodes[m].get("source_file") for m in members if nodes[m].get("source_file"))
        comms.append({"id": cid, "size": len(members), "hub": nodes[(syms or ranked)[0]].get("label"),
                      "members": [nodes[m].get("label") for m in syms[:6]], "files": [f for f, _ in files.most_common(3)]})

    files = {n.get("source_file") for n in nodes.values() if n.get("source_file")}
    dirs = Counter("/".join(f.split("/")[:2]) if f.count("/") > 1 else f.split("/")[0] for f in files)
    lines = [f"GRAPH: {len(nodes)} nodes, {len(g.get('links', []))} edges, {len(groups)} communities, {len(files)} files",
             "TOP DIRECTORIES: " + ", ".join(k for k, _ in dirs.most_common(12)), "GOD NODES:"]
    lines += [f"  - {x['label']} (degree {x['degree']}) at {x['loc']} in community {x['community']}" for x in gods]
    lines.append("COMMUNITIES:")
    lines += [f"  - [{c['id']}] size={c['size']} hub={c['hub']} members={', '.join(c['members'])} files={', '.join(c['files'])}" for c in comms]
    sur = (a.get("surprises") or [])[:5]
    if sur:
        lines.append("SURPRISING CROSS-COMMUNITY EDGES:")
        lines += [f"  - {s.get('source')} --{s.get('relation')}--> {s.get('target')} ({s.get('confidence')})" for s in sur]
    return "\n".join(lines), gods, comms


def readme(root: Path) -> str:
    for n in ("README.md", "readme.md", "README.rst", "README"):
        p = root / n
        if p.exists():
            return p.read_text(errors="ignore")[:2500]
    return "(no README)"


def parse_json(t: str) -> dict | None:
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    t = m.group(1) if m else t[t.find("{"): t.rfind("}") + 1]
    try:
        return json.loads(t)
    except Exception:  # noqa: BLE001
        return None


def fallback(name: str, gods: list[dict], comms: list[dict], a: dict) -> dict:
    md = [f"# {name} - onboarding (graph-only)", "", "## Start Here"]
    md += [f"- **{x['label']}** (`{x['loc']}`), degree {x['degree']}" for x in gods[:6]]
    md += ["", "## Key Subsystems"] + [f"- Community {c['id']}: hub `{c['hub']}`, {c['size']} nodes; {', '.join(c['files'])}" for c in comms[:10]]
    return {"architecture_summary": f"{name}: most connected abstractions are {', '.join(x['label'] for x in gods[:4])}.",
            "start_here": [{"node": x["label"], "file": x["loc"], "why": f"god node, degree {x['degree']}"} for x in gods[:6]],
            "subsystems": [{"community": c["id"], "label": f"Community {c['id']}", "role": f"hub {c['hub']}"} for c in comms],
            "reading_path": [{"step": i + 1, "file": x["file"] or x["loc"], "what_to_look_for": f"definition of {x['label']}"} for i, x in enumerate(gods[:6])],
            "gotchas": [f"{s.get('source')} -> {s.get('target')}" for s in (a.get("surprises") or [])[:3]],
            "onboarding_md": "\n".join(md), "model": "graph-only fallback"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="graphify-out")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    out = Path(args.out).resolve()
    if not (out / "graph.json").exists():
        print(f"no {out}/graph.json - run: graphify extract . --code-only", file=sys.stderr)
        return 2
    root = out.parent
    g, a = load(out)
    ev, gods, comms = evidence(g, a)
    name = root.name

    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    tour: dict | None = None
    if key:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=key)
            resp = client.models.generate_content(model=MODEL, contents=[PROMPT.format(name=name, readme=readme(root), graph=ev)],
                                                  config=types.GenerateContentConfig(temperature=0.35, max_output_tokens=6000))
            tour = parse_json(resp.text or "")
            if tour:
                tour["model"] = MODEL
        except Exception as e:  # noqa: BLE001
            print(f"Gemma call failed ({e}); using graph-only fallback", file=sys.stderr)
    if not tour:
        tour = fallback(name, gods, comms, a)

    labels = {str(s["community"]): s["label"] for s in tour.get("subsystems", []) if isinstance(s, dict) and s.get("label")}
    if labels and tour.get("model") == MODEL:
        lp = out / ".graphify_labels.json"
        old = json.loads(lp.read_text()) if lp.exists() else {}
        lp.write_text(json.dumps(old | labels, indent=2))

    if args.json:
        print(json.dumps(tour, indent=2))
    else:
        (root / "ONBOARDING.md").write_text(tour.get("onboarding_md", ""))
        print(f"wrote {root / 'ONBOARDING.md'} (model: {tour.get('model')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
