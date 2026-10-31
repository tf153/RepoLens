"""The reasoning + vision layer. Gemma 4 (open weights) is the default model.

All prompts receive *graph evidence* produced by graph_tools.py and are told to
answer only from it. If no API key is configured we fall back to deterministic
graph-only output so the app still demos.

Providers (REPOLENS_PROVIDER):
  gemini      Gemma 4 via the Gemini API (default; what the hackathon entry runs on)
  openrouter  Gemma 4 weights on OpenAI-compatible hosts with reasoning off (fast, still Gemma)
  openai      OpenAI models, or any OpenAI-compatible server through OPENAI_BASE_URL
"""
from __future__ import annotations

import base64
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

from . import config
from .config import GEMINI_API_KEY, GEMMA_MODEL, PROVIDER
from .graph_tools import RepoGraph

try:
    from google import genai
    from google.genai import types
except Exception:  # noqa: BLE001 - SDK missing in some dev setups
    genai = None  # type: ignore
    types = None  # type: ignore

try:
    from openai import OpenAI
except Exception:  # noqa: BLE001
    OpenAI = None  # type: ignore


@dataclass
class Image:
    """Provider-neutral image part; converted per provider in _generate."""
    data: bytes
    mime: str


MODEL = config.active_model()
_gemini_client = None
_oai_client = None
_client_lock = threading.Lock()  # clients are created once; a racing double-init would GC (and close) the first


def available() -> bool:
    if PROVIDER == "openai":
        return bool(config.OPENAI_API_KEY and OpenAI is not None)
    if PROVIDER == "openrouter":
        return bool(config.OPENROUTER_API_KEY and OpenAI is not None)
    return bool(GEMINI_API_KEY and genai is not None)


def describe() -> dict:
    return {"provider": PROVIDER, "model": MODEL, "available": available()}


_SYSTEM = ("You are RepoLens, a precise senior engineer. Answer directly and concisely without extended deliberation; "
           "the evidence you are given is complete, so do not re-derive it. Never invent symbols or files.")


def _generate(parts: list[Any], temperature: float = 0.3, max_tokens: int = 4096) -> str:
    if PROVIDER in ("openai", "openrouter"):
        return _generate_openai_compat(parts, temperature, max_tokens)
    return _generate_gemini(parts, temperature, max_tokens)


# ----------------------------------------------------------------------------- Gemini API (Gemma 4)
def _generate_gemini(parts: list[Any], temperature: float, max_tokens: int) -> str:
    """Gemma 4 on the Gemini API counts its hidden thinking against max_output_tokens and exposes no knob to
    disable it, so caps are generous and the system prompt discourages long deliberation."""
    global _gemini_client
    with _client_lock:
        if _gemini_client is None:
            _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    contents = [types.Part.from_bytes(data=p.data, mime_type=p.mime) if isinstance(p, Image) else p for p in parts]

    def run(cap: int):
        cfg = types.GenerateContentConfig(temperature=temperature, max_output_tokens=cap, system_instruction=_SYSTEM)
        return _gemini_client.models.generate_content(model=GEMMA_MODEL, contents=contents, config=cfg)

    resp = run(max_tokens)
    text = resp.text or ""
    fin = resp.candidates[0].finish_reason if resp.candidates and resp.candidates[0].finish_reason else None
    if not text and fin is not None and fin.name == "MAX_TOKENS":
        text = run(max_tokens * 3).text or ""  # thinking ate the whole budget: retry with a much larger cap
    return text


# ------------------------------------------------------------- OpenAI-compatible (OpenAI, OpenRouter, custom)
def _generate_openai_compat(parts: list[Any], temperature: float, max_tokens: int) -> str:
    global _oai_client
    is_openrouter = PROVIDER == "openrouter"
    base_url = config.OPENROUTER_BASE_URL if is_openrouter else config.OPENAI_BASE_URL
    api_key = config.OPENROUTER_API_KEY if is_openrouter else config.OPENAI_API_KEY
    is_openai_com = "api.openai.com" in base_url
    with _client_lock:
        if _oai_client is None:
            headers = {"HTTP-Referer": "https://github.com/tf153/RepoLens", "X-Title": "RepoLens"} if is_openrouter else None
            _oai_client = OpenAI(api_key=api_key, base_url=base_url, default_headers=headers, timeout=240)

    content: list[dict] = []
    for p in parts:
        if isinstance(p, Image):
            b64 = base64.b64encode(p.data).decode()
            content.append({"type": "image_url", "image_url": {"url": f"data:{p.mime};base64,{b64}"}})
        else:
            content.append({"type": "text", "text": str(p)})
    messages = [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": content}]

    kwargs: dict[str, Any] = {"model": MODEL, "messages": messages}
    extra: dict[str, Any] = {}
    if is_openai_com:
        # Newer OpenAI models accept max_completion_tokens and reject non-default temperature.
        kwargs["max_completion_tokens"] = max_tokens
        if config.LLM_DISABLE_REASONING:
            kwargs["reasoning_effort"] = "low"
    else:
        kwargs["max_tokens"] = max_tokens
        kwargs["temperature"] = temperature
        if config.LLM_DISABLE_REASONING:
            extra["reasoning"] = {"enabled": False}  # OpenRouter-style; ignored by hosts that don't know it
    if extra:
        kwargs["extra_body"] = extra

    try:
        resp = _oai_client.chat.completions.create(**kwargs)
    except Exception as e:  # noqa: BLE001 - retry once without optional knobs (unsupported params -> 400)
        if "reasoning" in str(e) or "temperature" in str(e) or "max_tokens" in str(e) or "max_completion_tokens" in str(e):
            for k in ("reasoning_effort", "extra_body", "temperature"):
                kwargs.pop(k, None)
            if "max_completion_tokens" in str(e):
                kwargs["max_tokens"] = kwargs.pop("max_completion_tokens", max_tokens)
            elif "max_tokens" in str(e) and not is_openai_com:
                kwargs["max_completion_tokens"] = kwargs.pop("max_tokens", max_tokens)
            resp = _oai_client.chat.completions.create(**kwargs)
        else:
            raise
    msg = resp.choices[0].message if resp.choices else None
    return (msg.content or "") if msg else ""


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
        return _fallback_tour(name, rg) | {"model": "graph-only fallback (no API key)"}
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
        return fb | {"model": MODEL, "parse_warning": "model output was not valid JSON; showing graph-only structure"}
    data["onboarding_md"] = _strip_fence(doc)
    data["model"] = MODEL
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
- Answer by tracing the graph: name the chain of symbols and the relation on each hop. Relation meanings:
  `calls`/`indirect_call` = invokes, `uses` = references the type/value, `method` = class defines that method,
  `contains` = file defines the symbol, `imports` = module import, `inherits` = subclass.
- Give the best-supported explanation the evidence allows. Direct edges between the asked symbols ARE the mechanism:
  explain them. Only after that, note any gap in one sentence (name the two symbols to trace with "path"). Do not refuse.
- Cite file:line from the evidence for every symbol you mention, like `Router (starlette/routing.py:L586)`.
- Never invent symbols, files or behaviour that are not in the evidence. Be concise (under 220 words), use markdown.

Repository: {name}
Question: {question}

=== GRAPH EVIDENCE (subgraph around the matched symbols) ===
{evidence}

=== GRAPHIFY EXPLAIN (most connected edges of the key symbols) ===
{explain}

=== GRAPHIFY QUERY OUTPUT (BFS, token-budgeted) ===
{cli}
"""


def chat(name: str, rg: RepoGraph, question: str) -> dict:
    seeds = rg.seeds_from_question(question)
    sub = rg.neighborhood(seeds, hops=2) if seeds else {"seeds": [], "nodes": [], "edges": [], "paths": [], "explored": 0}
    evidence = rg.evidence_text(sub)
    result = {"seeds": sub["seeds"], "paths": sub["paths"], "evidence": sub["edges"][:30], "explored": sub["explored"],
              "model": MODEL if available() else "graph-only fallback"}
    if not available():
        result["answer"] = "_No model API key configured; showing raw graph evidence._\n\n```\n" + evidence[:3000] + "\n```"
        return result
    # Graphify CLI context, gathered concurrently: BFS query + `explain` for the two most connected seeds.
    top_seeds = sorted(sub["seeds"], key=lambda s: s["degree"], reverse=True)[:2]
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_query = pool.submit(rg.cli_query, question, 900)
        f_explain = [pool.submit(rg.cli_explain, s["label"]) for s in top_seeds]
        cli_out = f_query.result()
        explain_out = "\n\n".join(f.result()[:2200] for f in f_explain) or "(none)"
    prompt = _CHAT_PROMPT.format(name=name, question=question, evidence=evidence[:14000], explain=explain_out, cli=cli_out[:4000])
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
        return {"error": "No model API key configured; the diagram check needs a vision model (Gemma 4 by default).", "components": [],
                "missing_in_diagram": [g["label"] for g in rg.god_nodes(5)], "drift_summary": "", "model": "unavailable"}
    parts = [Image(image, mime), _DIAGRAM_PROMPT.format(graph=graph)]
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
    data["model"] = MODEL
    return data


def _matches_community(rg: RepoGraph, comp: dict) -> bool:
    target = re.sub(r"[^a-z0-9]", "", str(comp.get("matched_node") or "").lower())
    return any(re.sub(r"[^a-z0-9]", "", c["label"].lower()) == target for c in rg.communities(40)) if target else False
