---
name: repolens
description: Onboard to an unfamiliar codebase using its Graphify knowledge graph. Builds graphify-out/ if missing, then writes ONBOARDING.md (architecture summary, start-here symbols, subsystems, reading path, gotchas) with Gemma 4 and answers structural questions ("how does X reach Y?") by traversing the graph instead of grepping. Use when a user asks to understand, explore, onboard to, or get a tour of a repository, or asks how two parts of the code connect.
license: Apache-2.0
compatibility: Requires the graphify CLI (uv tool install "graphifyy[leiden]") and python3. GEMINI_API_KEY enables Gemma 4 narration; without it the skill emits a graph-only ONBOARDING.md.
metadata:
  author: tf153
  version: "0.1"
  model: gemma-4-26b-a4b-it
---

# RepoLens skill

Turn a repository's Graphify knowledge graph into an onboarding tour, then answer
structural questions by walking the graph. Never grep when the graph can answer.

## Step 1 - make sure the graph exists

```bash
ls graphify-out/graph.json 2>/dev/null || graphify extract . --code-only
ls graphify-out/GRAPH_REPORT.md 2>/dev/null || graphify cluster-only . --no-label
```

`--code-only` is deterministic (tree-sitter AST, no LLM, nothing leaves the machine).

## Step 2 - write the onboarding doc

```bash
python3 scripts/tour.py            # writes ONBOARDING.md next to graphify-out/
python3 scripts/tour.py --json     # machine-readable tour (architecture_summary, start_here, subsystems, reading_path, gotchas)
```

`scripts/tour.py` (bundled with this skill) reads `graph.json` and `.graphify_analysis.json`,
builds a compact evidence pack (god nodes, Leiden communities, surprising cross-community edges,
README excerpt) and asks **Gemma 4** (`gemma-4-26b-a4b-it` via the Gemini API, `GEMINI_API_KEY`)
to narrate it. Gemma's subsystem names are saved to `graphify-out/.graphify_labels.json`, so
`graphify export html` shows human names instead of "Community N".

Present `ONBOARDING.md` to the user: Overview, Architecture, Start Here, Key Subsystems, Reading Path, Gotchas.

## Step 3 - answer structural questions from the graph

| User asks | Run |
| --- | --- |
| "How does A reach / call / depend on B?" | `graphify path "A" "B"` |
| "What is X / what touches X?" | `graphify explain "X"` |
| "Where is <concept> handled?" / broad question | `graphify query "<question>" --budget 1500` |
| "What breaks if I change X?" | `graphify affected "X"` |

Cite every symbol with the `file:line` from the output. Edges tagged `EXTRACTED` are explicit in
source; `INFERRED` were resolved by Graphify - say which when it matters. Exit code 3 means the
name is ambiguous (candidates are listed - pick one and re-run); 4 means no such node.

Only open a file when the user asks for implementation detail the graph cannot give.

## Examples

- "Give me a tour of this repo" -> Steps 1-2, then summarise ONBOARDING.md.
- "How does auth reach the database?" -> `graphify path "auth" "database"`, then explain the chain hop by hop.
- "Where should I start reading?" -> the `start_here` list from `scripts/tour.py --json`.

## Edge cases

- Empty graph / "graph is empty": the repo has no supported source files; say so.
- Very large repo (>5000 nodes): pass `--budget 3000` to `graphify query`, and prefer `path`/`explain`.
- No `GEMINI_API_KEY`: `scripts/tour.py` still writes a deterministic graph-only ONBOARDING.md.
