"""Gemma 4 (open-weight, served via the Gemini API) does the reasoning and vision.

All prompts receive *graph evidence* produced by graph_tools.py and are told to
answer only from it. If no API key is configured we fall back to deterministic
graph-only output so the app still demos.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .config import GEMINI_API_KEY, GEMMA_MODEL
from .graph_tools import RepoGraph

try:
    from google import genai
    from google.genai import types
except Exception:  # noqa: BLE001 - SDK missing in some dev setups
    genai = None  # type: ignore
    types = None  # type: ignore

_client = None


def available() -> bool:
    return bool(GEMINI_API_KEY and genai is not None)


def _get_client():
    global _client
    if _client is None and available():
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


_SYSTEM = ("You are RepoLens, a precise senior engineer. Answer directly and concisely without extended deliberation; "
           "the evidence you are given is complete, so do not re-derive it. Never invent symbols or files.")


def _generate(parts: list[Any], temperature: float = 0.3, max_tokens: int = 4096) -> str:
    """Gemma 4 on the Gemini API counts its hidden thinking against max_output_tokens and exposes no knob to
    disable it, so caps are generous and the system prompt discourages long deliberation."""
    client = _get_client()
    cfg = types.GenerateContentConfig(temperature=temperature, max_output_tokens=max_tokens, system_instruction=_SYSTEM)
    resp = client.models.generate_content(model=GEMMA_MODEL, contents=parts, config=cfg)
    text = resp.text or ""
    if not text and resp.candidates and resp.candidates[0].finish_reason and resp.candidates[0].finish_reason.name == "MAX_TOKENS":
        # thinking consumed the whole budget: retry once with a much larger cap
        cfg = types.GenerateContentConfig(temperature=temperature, max_output_tokens=max_tokens * 3, system_instruction=_SYSTEM)
        resp = client.models.generate_content(model=GEMMA_MODEL, contents=parts, config=cfg)
        text = resp.text or ""
    return text


def _parse_json(text: str) -> dict | None:
    """Gemma usually wraps JSON in ```json fences; be forgiving."""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m:
        t = m.group(1)
    else:
        i, j = t.find("{"), t.rfind("}")
        if i != -1 and j > i:
            t = t[i:j + 1]
    try:
        return json.loads(t)
    except Exception:  # noqa: BLE001
        try:
            return json.loads(re.sub(r",\s*([}\]])", r"\1", t))  # trailing commas
        except Exception:  # noqa: BLE001
            return None


# ------------------------------------------------------------------------ TOUR
_TOUR_PROMPT = """You are RepoLens, an expert engineer onboarding a new teammate to a codebase.
You are given a *knowledge graph summary* built by Graphify (tree-sitter AST -> graph; Leiden communities = subsystems;
"god nodes" = the most-connected abstractions). Use ONLY this evidence plus the README excerpt. Do not invent files or symbols.

Repository: {name}

=== README EXCERPT ===
{readme}

=== GRAPH EVIDENCE ===
{graph}

=== SUGGESTED QUESTIONS FROM THE GRAPH ===
{questions}

Respond with a single JSON object (no prose outside it) with exactly these keys:
{{
  "architecture_summary": "3-5 sentences: what the project is, how it is layered, how data/control flows. Mention concrete symbols/files.",
  "start_here": [ {{"node": "<symbol>", "file": "<path:line>", "why": "<one sentence>"}} ],   // 4-6 items, ordered for a first read
  "subsystems": [ {{"community": <id>, "label": "<2-4 word human name>", "role": "<one sentence>"}} ],  // one per community listed in the evidence
  "reading_path": [ {{"step": 1, "file": "<path>", "what_to_look_for": "<one sentence>"}} ],  // 5-7 steps
  "gotchas": ["<surprising coupling or risk, cite symbols>"]   // 2-4 items
}}
Keep every sentence short. No markdown outside the JSON."""

_DOC_PROMPT = """You are RepoLens, writing ONBOARDING.md for a new engineer joining the repository "{name}".
Use ONLY the knowledge-graph evidence below (built by Graphify from the AST) and the README excerpt. Do not invent files or symbols.

=== README EXCERPT ===
{readme}

=== GRAPH EVIDENCE ===
{graph}

Write a complete markdown document of about 300 words with exactly these headings:
# {name} — onboarding
## Overview
## Architecture
## Start Here
## Key Subsystems
## Reading Path
## Gotchas
Cite symbols as `Symbol (path:line)` using locations from the evidence. Output only the markdown."""


def tour(name: str, rg: RepoGraph) -> dict:
    questions = "\n".join(f"- {q.get('question')}" for q in (rg.analysis.get("questions") or [])[:6])
    graph = rg.summary_for_llm(max_gods=12, max_comms=14)
    readme = rg.readme_excerpt() or "(no README found)"
    if not available():
        return _fallback_tour(name, rg) | {"model": "graph-only fallback (no GEMINI_API_KEY)"}
    tour_prompt = _TOUR_PROMPT.format(name=name, readme=readme, graph=graph, questions=questions or "(none)")
    doc_prompt = _DOC_PROMPT.format(name=name, readme=readme, graph=graph)
    # Two independent calls run concurrently: structured tour + onboarding doc. Halves wall time.
    with ThreadPoolExecutor(max_workers=2) as pool:
        f_tour = pool.submit(_generate, [tour_prompt], 0.3, 6000)
        f_doc = pool.submit(_generate, [doc_prompt], 0.35, 4500)
        text = f_tour.result()
        try:
            doc = f_doc.result()
        except Exception as e:  # noqa: BLE001 - doc is secondary; keep the tour
            doc = f"_onboarding doc generation failed: {e}_"
    data = _parse_json(text)
    if not data:
        fb = _fallback_tour(name, rg)
        fb["onboarding_md"] = doc or text
        return fb | {"model": GEMMA_MODEL, "parse_warning": "model output was not valid JSON; showing graph-only structure"}
    data["onboarding_md"] = _strip_fence(doc)
    data["model"] = GEMMA_MODEL
    return data


def _strip_fence(t: str) -> str:
    t = t.strip()
    m = re.match(r"^```(?:markdown|md)?\s*(.*?)\s*```$", t, re.S)
    return m.group(1).strip() if m else t


def _fallback_tour(name: str, rg: RepoGraph) -> dict:
    gods = rg.god_nodes(6)
    comms = rg.communities(10)
    md = [f"# {name} — onboarding (graph-only)", "", "## Start here"]
    md += [f"- **{g['label']}** (`{g['loc']}`), degree {g['degree']}" for g in gods]
    md += ["", "## Subsystems"] + [f"- {c['label']}: hub `{c['hub']}`, {c['size']} nodes; files: {', '.join(c['files'][:3])}" for c in comms]
    return {
        "architecture_summary": f"{name} has {rg.stats()['nodes']} graph nodes across {rg.stats()['communities']} Leiden communities. "
                                f"The most connected abstractions are {', '.join(g['label'] for g in gods[:4])}.",
        "start_here": [{"node": g["label"], "file": g["loc"], "why": f"God node with degree {g['degree']}"} for g in gods],
        "subsystems": [{"community": c["id"], "label": c["label"], "role": f"hub {c['hub']}; {c['size']} nodes"} for c in comms],
        "reading_path": [{"step": i + 1, "file": g["file"] or g["loc"], "what_to_look_for": f"definition of {g['label']}"} for i, g in enumerate(gods)],
        "gotchas": [f"{s.get('source')} -> {s.get('target')} ({s.get('why', '')[:120]})" for s in (rg.analysis.get("surprises") or [])[:3]],
        "onboarding_md": "\n".join(md),
    }


# ------------------------------------------------------------------------ CHAT
_CHAT_PROMPT = """You are RepoLens, answering a question about a codebase using ONLY the knowledge-graph evidence below
(produced by Graphify from the AST; edges are tagged EXTRACTED = explicit in source, INFERRED = resolved by analysis).
Rules:
- Answer by tracing the graph: name the chain of symbols and the relation on each hop.
- Cite file:line from the evidence for every symbol you mention, like `Router (starlette/routing.py:L586)`.
- If the evidence does not contain the answer, say exactly what is missing and suggest which two symbols to trace with "path".
- Never invent symbols, files or behaviour that are not in the evidence. Be concise (under 220 words), use markdown.

Repository: {name}
Question: {question}

=== GRAPH EVIDENCE (subgraph around the matched symbols) ===
{evidence}

=== GRAPHIFY QUERY OUTPUT (BFS, token-budgeted) ===
{cli}
"""


def chat(name: str, rg: RepoGraph, question: str) -> dict:
    seeds = rg.seeds_from_question(question)
    sub = rg.neighborhood(seeds, hops=2) if seeds else {"seeds": [], "nodes": [], "edges": [], "paths": [], "explored": 0}
    evidence = rg.evidence_text(sub)
    cli_out = rg.cli_query(question, budget=900)
    result = {"seeds": sub["seeds"], "paths": sub["paths"], "evidence": sub["edges"][:30], "explored": sub["explored"],
              "model": GEMMA_MODEL if available() else "graph-only fallback"}
    if not available():
        result["answer"] = "_GEMINI_API_KEY not configured; showing raw graph evidence._\n\n```\n" + evidence[:3000] + "\n```"
        return result
    prompt = _CHAT_PROMPT.format(name=name, question=question, evidence=evidence[:14000], cli=cli_out[:5000])
    result["answer"] = _generate([prompt], temperature=0.2, max_tokens=3500)
    return result


# --------------------------------------------------------------------- DIAGRAM
_DIAGRAM_PROMPT = """You are RepoLens. The user uploaded an architecture diagram or whiteboard photo of a codebase.
Compare what the DIAGRAM claims against the REAL knowledge graph built from the code (Graphify).

=== REAL GRAPH (ground truth) ===
{graph}

Tasks:
1. Read every box/component and every arrow/relationship in the image.
2. For each component decide whether it exists in the real graph (match to a god node, community, or directory; be tolerant of naming).
3. List real god nodes / communities that the diagram does not show at all.
4. Summarise the drift: what the diagram gets right, what is stale or missing, what is wrong.

Respond with a single JSON object only:
{{
  "components": [ {{"name": "<as written in diagram>", "found_in_graph": true|false, "matched_node": "<graph symbol/community or null>", "note": "<one sentence>"}} ],
  "relationships": [ {{"from": "<component>", "to": "<component>", "label": "<arrow text or inferred>", "supported_by_graph": true|false|"unknown"}} ],
  "missing_in_diagram": [ "<god node or community present in code but absent from diagram>" ],
  "drift_summary": "<3-5 sentences>",
  "drift_score": <0-100 integer, 0 = diagram matches the code perfectly>
}}"""


def diagram_check(name: str, rg: RepoGraph, image: bytes, mime: str) -> dict:
    graph = rg.summary_for_llm(max_gods=15, max_comms=14)
    if not available():
        return {"error": "GEMINI_API_KEY not configured; diagram check needs Gemma 4 vision.", "components": [],
                "missing_in_diagram": [g["label"] for g in rg.god_nodes(5)], "drift_summary": "", "model": "unavailable"}
    parts = [types.Part.from_bytes(data=image, mime_type=mime), _DIAGRAM_PROMPT.format(graph=graph)]
    text = _generate(parts, temperature=0.2, max_tokens=6000)
    data = _parse_json(text) or {"components": [], "relationships": [], "missing_in_diagram": [], "drift_summary": text, "drift_score": None}
    # Deterministic verification pass: let the graph confirm/deny each component match.
    for comp in data.get("components", []):
        hits = rg.find(str(comp.get("matched_node") or comp.get("name") or ""), limit=1)
        if hits:
            comp["graph_node"] = rg.label(hits[0])
            comp["graph_loc"] = rg.loc(hits[0])
            comp["verified"] = True
        else:
            comp["verified"] = False
            if comp.get("found_in_graph") and not _matches_community(rg, comp):
                comp["note"] = (comp.get("note") or "") + " (not verifiable against graph nodes)"
    data["model"] = GEMMA_MODEL
    return data


def _matches_community(rg: RepoGraph, comp: dict) -> bool:
    target = re.sub(r"[^a-z0-9]", "", str(comp.get("matched_node") or "").lower())
    return any(re.sub(r"[^a-z0-9]", "", c["label"].lower()) == target for c in rg.communities(40)) if target else False
