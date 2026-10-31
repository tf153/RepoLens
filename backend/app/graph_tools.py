"""Graph-side reasoning over Graphify's graph.json.

Everything here is deterministic: we traverse the knowledge graph (networkx)
and hand compact, cited evidence to Gemma 4. The model never greps files.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

import networkx as nx

from .config import GRAPHIFY_BIN, QUERY_TIMEOUT

_WORD_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_STOP = {
    "how", "does", "the", "a", "an", "to", "from", "what", "where", "which", "is", "are", "in", "of", "and", "or",
    "reach", "reaches", "get", "gets", "call", "calls", "called", "use", "uses", "used", "do", "with", "by", "for",
    "flow", "flows", "path", "between", "into", "this", "that", "when", "why", "who", "it", "on", "at", "code",
    "function", "class", "module", "file", "repo", "repository", "explain", "show", "me", "handle", "handles",
    "happens", "work", "works", "data", "request", "response",  # too generic in web repos; still matched as fallback
    "through", "via", "over", "after", "before", "during", "then", "there", "their", "about", "each", "all", "any",
    "some", "also", "did", "can", "could", "would", "should", "will", "have", "has", "had", "its", "our", "your",
    "end", "start", "first", "last", "main", "new", "old", "way", "like", "look", "see", "find", "where", "run",
}
_GENERIC_FALLBACK = {"request", "response", "data"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


_TEST_DIR_RE = re.compile(r"(^|/)(tests?|testing|benchmarks?|examples?|docs?|fixtures|__mocks__|spec)(/|$)", re.I)


def _is_test_path(n: dict) -> bool:
    f = n.get("source_file") or ""
    return bool(_TEST_DIR_RE.search(f)) or bool(re.search(r"(^|/)(test_|.*_test\.|.*\.test\.|.*\.spec\.)", f))


def _is_file_node(n: dict) -> bool:
    lab = n.get("label", "")
    return n.get("source_location") in (None, "L1") and ("." in lab or "/" in lab) and not n.get("_callable")


class RepoGraph:
    """Loads graphify-out/ once and answers structural questions."""

    def __init__(self, out_dir: Path):
        self.out_dir = Path(out_dir)
        raw = json.loads((self.out_dir / "graph.json").read_text())
        self.raw = raw
        self.G = nx.DiGraph()
        for n in raw["nodes"]:
            self.G.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
        for e in raw.get("links", []):
            self.G.add_edge(e["source"], e["target"], **{k: v for k, v in e.items() if k not in ("source", "target")})
        self.U = self.G.to_undirected(as_view=True)
        self.degree = dict(self.U.degree())

        analysis_path = self.out_dir / ".graphify_analysis.json"
        self.analysis = json.loads(analysis_path.read_text()) if analysis_path.exists() else {}
        labels_path = self.out_dir / ".graphify_labels.json"
        self.labels: dict[int, str] = {}
        if labels_path.exists():
            try:
                self.labels = {int(k): v for k, v in json.loads(labels_path.read_text()).items()}
            except Exception:  # noqa: BLE001
                self.labels = {}

        # label index for symbol lookup
        self._by_norm: dict[str, list[str]] = defaultdict(list)
        for nid, d in self.G.nodes(data=True):
            if "_rationale_" in nid:  # `# NOTE:`/`# WHY:` sentence nodes: evidence, not lookup targets
                continue
            lab = d.get("label") or nid
            self._by_norm[_norm(lab)].append(nid)
            self._by_norm[_norm(lab.rstrip("()"))].append(nid)
            base = os.path.basename(d.get("source_file") or "")
            if base:
                self._by_norm[_norm(base)].append(nid)
                self._by_norm[_norm(os.path.splitext(base)[0])].append(nid)

    # ------------------------------------------------------------------ basics
    def node(self, nid: str) -> dict:
        d = dict(self.G.nodes[nid])
        d["id"] = nid
        d["degree"] = self.degree.get(nid, 0)
        return d

    def label(self, nid: str) -> str:
        return self.G.nodes[nid].get("label") or nid

    def loc(self, nid: str) -> str:
        d = self.G.nodes[nid]
        f, l = d.get("source_file"), d.get("source_location")
        return f"{f}:{l}" if f and l else (f or "?")

    def community_name(self, cid: int | None) -> str:
        if cid is None:
            return "unassigned"
        return self.labels.get(int(cid), f"Community {cid}")

    def stats(self) -> dict:
        rel = Counter(d.get("relation") for _, _, d in self.G.edges(data=True))
        conf = Counter(d.get("confidence") for _, _, d in self.G.edges(data=True))
        files = {d.get("source_file") for _, d in self.G.nodes(data=True) if d.get("source_file")}
        ext = Counter(os.path.splitext(f)[1].lstrip(".") for f in files if os.path.splitext(f)[1])
        comms = {d.get("community") for _, d in self.G.nodes(data=True) if d.get("community") is not None}
        return {
            "nodes": self.G.number_of_nodes(),
            "edges": self.G.number_of_edges(),
            "communities": len(comms),
            "files": len(files),
            "languages": [{"ext": k, "files": v} for k, v in ext.most_common(6)],
            "relations": [{"relation": k, "count": v} for k, v in rel.most_common(10)],
            "confidence": dict(conf),
            "built_at_commit": self.raw.get("built_at_commit"),
        }

    # --------------------------------------------------------------- god nodes
    def god_nodes(self, top: int = 15) -> list[dict]:
        gods = self.analysis.get("gods") or []
        out = []
        for g in gods[:top]:
            nid = g.get("id")
            if nid not in self.G:
                continue
            d = self.node(nid)
            out.append({
                "id": nid, "label": d.get("label", nid), "degree": g.get("degree", d["degree"]),
                "file": d.get("source_file"), "loc": self.loc(nid),
                "community": d.get("community"), "community_name": self.community_name(d.get("community")),
            })
        if not out:  # fallback: compute ourselves
            ranked = sorted(self.degree.items(), key=lambda kv: kv[1], reverse=True)
            for nid, deg in ranked:
                d = self.node(nid)
                if _is_file_node(d) or d.get("external"):
                    continue
                out.append({"id": nid, "label": d.get("label", nid), "degree": deg, "file": d.get("source_file"),
                            "loc": self.loc(nid), "community": d.get("community"),
                            "community_name": self.community_name(d.get("community"))})
                if len(out) >= top:
                    break
        return out

    # ------------------------------------------------------------- communities
    def communities(self, top: int = 14, sample: int = 6) -> list[dict]:
        groups: dict[int, list[str]] = defaultdict(list)
        for nid, d in self.G.nodes(data=True):
            if d.get("community") is not None:
                groups[int(d["community"])].append(nid)
        cohesion = {int(k): v for k, v in (self.analysis.get("cohesion") or {}).items()}
        out = []
        for cid, members in sorted(groups.items(), key=lambda kv: len(kv[1]), reverse=True)[:top]:
            ranked = sorted(members, key=lambda n: self.degree.get(n, 0), reverse=True)
            symbols = [n for n in ranked if not _is_file_node(self.G.nodes[n]) and not self.G.nodes[n].get("external")]
            files = Counter(self.G.nodes[n].get("source_file") for n in members if self.G.nodes[n].get("source_file"))
            out.append({
                "id": cid, "label": self.community_name(cid), "size": len(members),
                "cohesion": round(cohesion.get(cid, 0.0), 3),
                "hub": self.label(symbols[0]) if symbols else self.label(ranked[0]),
                "sample": [self.label(n) for n in symbols[:sample]],
                "files": [f for f, _ in files.most_common(4)],
            })
        return out

    def top_dirs(self, n: int = 12) -> list[str]:
        c = Counter()
        for _, d in self.G.nodes(data=True):
            f = d.get("source_file")
            if f:
                parts = f.split("/")
                c["/".join(parts[:2]) if len(parts) > 2 else parts[0]] += 1
        return [k for k, _ in c.most_common(n)]

    # ------------------------------------------------------------------ lookup
    def find(self, term: str, limit: int = 5) -> list[str]:
        """Resolve a free-text term to node ids: exact label > file basename > substring."""
        key = _norm(term)
        if not key:
            return []
        hits = list(dict.fromkeys(self._by_norm.get(key, [])))
        if not hits and len(key) >= 5:
            # prefix match only (e.g. "middlewar" -> Middleware, "basehttp" -> BaseHTTPMiddleware)
            for k, ids in self._by_norm.items():
                if k.startswith(key):
                    hits.extend(ids)
            hits = list(dict.fromkeys(hits))
        hits.sort(key=lambda n: (self.G.nodes[n].get("external", False), _is_test_path(self.G.nodes[n]),
                                 _is_file_node(self.G.nodes[n]), -self.degree.get(n, 0)))
        return hits[:limit]

    def seeds_from_question(self, question: str, max_seeds: int = 8) -> list[str]:
        words = _WORD_RE.findall(question)
        # also split camelCase / snake_case into joined variants
        cands: list[str] = []
        for w in words:
            cands.append(w)
        for i in range(len(words) - 1):  # two-word joins e.g. "rate limiter" -> RateLimiter
            cands.append(words[i] + words[i + 1])
        seeds: list[str] = []
        fallback: list[str] = []
        for c in cands:
            lw = c.lower()
            target = fallback if lw in _GENERIC_FALLBACK else seeds
            if lw in _STOP and lw not in _GENERIC_FALLBACK:
                continue
            if len(c) < 3:
                continue
            for nid in self.find(c, limit=1):
                if nid not in target:
                    target.append(nid)
        if len(seeds) < 2:
            seeds.extend(x for x in fallback if x not in seeds)
        return seeds[:max_seeds]

    # ------------------------------------------------------------------- paths
    def _edge(self, a: str, b: str) -> tuple[str, str, dict] | None:
        if self.G.has_edge(a, b):
            return a, b, self.G.edges[a, b]
        if self.G.has_edge(b, a):
            return b, a, self.G.edges[b, a]
        return None

    def edge_row(self, a: str, b: str) -> dict | None:
        e = self._edge(a, b)
        if not e:
            return None
        src, dst, d = e
        return {
            "source": self.label(src), "target": self.label(dst), "source_id": src, "target_id": dst,
            "source_loc": self.loc(src), "target_loc": self.loc(dst),
            "relation": d.get("relation"), "confidence": d.get("confidence"),
            "score": d.get("confidence_score"),
            "file": d.get("source_file"), "loc": d.get("source_location"),
        }

    def shortest_path(self, a: str, b: str) -> dict:
        sa, sb = self.find(a, 1), self.find(b, 1)
        if not sa or not sb:
            return {"found": False, "error": f"Could not resolve '{a if not sa else b}' to a graph node"}
        try:
            nodes = nx.shortest_path(self.U, sa[0], sb[0])
        except nx.NetworkXNoPath:
            return {"found": False, "error": "No path between these nodes", "a": self.label(sa[0]), "b": self.label(sb[0])}
        hops = [self.edge_row(nodes[i], nodes[i + 1]) for i in range(len(nodes) - 1)]
        return {"found": True, "hops": len(hops), "nodes": [self._brief(n) for n in nodes], "edges": hops}

    def _brief(self, nid: str) -> dict:
        d = self.G.nodes[nid]
        return {"id": nid, "label": d.get("label", nid), "loc": self.loc(nid), "degree": self.degree.get(nid, 0),
                "community": self.community_name(d.get("community"))}

    def neighborhood(self, seeds: list[str], hops: int = 2, max_nodes: int = 45, max_edges: int = 70) -> dict:
        """BFS from seeds; return a compact subgraph with the most connected nodes kept."""
        seen: dict[str, int] = {}
        frontier = [s for s in seeds if s in self.G]
        for s in frontier:
            seen[s] = 0
        for depth in range(1, hops + 1):
            nxt = []
            for n in frontier:
                for m in self.U.neighbors(n):
                    if m not in seen:
                        seen[m] = depth
                        nxt.append(m)
            frontier = nxt
            if len(seen) > 4000:
                break
        # keep seeds + highest-degree nodes, prefer code symbols over files/externals
        def rank(n: str):
            d = self.G.nodes[n]
            return (seen[n] > 0, d.get("external", False), _is_file_node(d), -self.degree.get(n, 0))
        # drop zero-degree seeds (e.g. a package name matched from pyproject.toml)
        for s in list(seen):
            if seen[s] == 0 and self.degree.get(s, 0) == 0 and len(seen) > 1:
                del seen[s]
        keep = sorted(seen, key=rank)[:max_nodes]
        keep_set = set(keep)
        edges = []
        for a in keep:
            for b in self.U.neighbors(a):
                if b in keep_set and a < b:
                    row = self.edge_row(a, b)
                    if row:
                        edges.append(row)
        # prioritise explicit, non-"contains" edges
        edges.sort(key=lambda e: (e["relation"] in ("contains", "imports", "imports_from"), e["confidence"] != "EXTRACTED"))
        # always include shortest paths between seed pairs
        paths = []
        for i in range(len(seeds)):
            for j in range(i + 1, len(seeds)):
                if seeds[i] in self.G and seeds[j] in self.G:
                    try:
                        p = nx.shortest_path(self.U, seeds[i], seeds[j])
                        paths.append([self.edge_row(p[k], p[k + 1]) for k in range(len(p) - 1)])
                    except nx.NetworkXNoPath:
                        pass
        return {"seeds": [self._brief(s) for s in seeds if s in self.G], "nodes": [self._brief(n) for n in keep],
                "edges": edges[:max_edges], "paths": paths[:4], "explored": len(seen)}

    # ---------------------------------------------------------------- evidence
    @staticmethod
    def evidence_text(sub: dict) -> str:
        lines = []
        if sub.get("seeds"):
            lines.append("SEED NODES (matched from the question):")
            for s in sub["seeds"]:
                lines.append(f"  - {s['label']}  [{s['loc']}]  degree={s['degree']}  community={s['community']}")
        if sub.get("paths"):
            lines.append("\nSHORTEST PATHS BETWEEN SEEDS:")
            for p in sub["paths"]:
                if p:
                    chain = f"{p[0]['source']} ({p[0]['source_loc']})" + "".join(
                        f" --{e['relation']} [{e['confidence']}]--> {e['target']} ({e['target_loc']})" for e in p)
                    lines.append("  " + chain)
        lines.append("\nNODES:")
        for n in sub.get("nodes", []):
            lines.append(f"  - {n['label']}  [{n['loc']}]  community={n['community']}")
        lines.append("\nEDGES (source --relation [confidence]--> target @ file:line):")
        for e in sub.get("edges", []):
            lines.append(f"  - {e['source']} --{e['relation']} [{e['confidence']}]--> {e['target']} @ {e.get('file')}:{e.get('loc')}")
        return "\n".join(lines)

    def summary_for_llm(self, max_gods: int = 12, max_comms: int = 12) -> str:
        st = self.stats()
        parts = [f"GRAPH: {st['nodes']} nodes, {st['edges']} edges, {st['communities']} communities, {st['files']} files; "
                 f"languages: {', '.join(l['ext'] for l in st['languages'])}",
                 "TOP DIRECTORIES: " + ", ".join(self.top_dirs()),
                 "GOD NODES (most connected abstractions):"]
        for g in self.god_nodes(max_gods):
            parts.append(f"  - {g['label']} (degree {g['degree']}) at {g['loc']}  in {g['community_name']}")
        parts.append("COMMUNITIES (Leiden subsystems):")
        for c in self.communities(max_comms):
            parts.append(f"  - [{c['id']}] {c['label']}: size={c['size']} hub={c['hub']} members={', '.join(c['sample'])} files={', '.join(c['files'][:3])}")
        sur = (self.analysis.get("surprises") or [])[:5]
        if sur:
            parts.append("SURPRISING CROSS-COMMUNITY CONNECTIONS:")
            for s in sur:
                parts.append(f"  - {s.get('source')} --{s.get('relation')}--> {s.get('target')} ({s.get('confidence')})")
        return "\n".join(parts)

    # --------------------------------------------------------------- CLI shims
    def cli(self, *args: str, timeout: int = QUERY_TIMEOUT) -> str:
        cmd = [GRAPHIFY_BIN, *args, "--graph", str(self.out_dir / "graph.json")]
        env = {**os.environ, "GRAPHIFY_BACKEND": "none", "GRAPHIFY_QUERY_LOG_DISABLE": "1",
               "PATH": os.environ.get("PATH", "") + ":" + str(Path.home() / ".local/bin")}
        try:
            r = subprocess.run(cmd, cwd=str(self.out_dir.parent), env=env, capture_output=True, text=True, timeout=timeout)
            return (r.stdout or "") + (("\n" + r.stderr) if r.returncode not in (0, 3, 4) and r.stderr else "")
        except subprocess.TimeoutExpired:
            return "(graphify query timed out)"

    def cli_query(self, question: str, budget: int = 1200) -> str:
        return self.cli("query", question, "--budget", str(budget))

    def cli_explain(self, symbol: str) -> str:
        return self.cli("explain", symbol)

    # ------------------------------------------------------------ README text
    def readme_excerpt(self, max_chars: int = 2500) -> str:
        repo = self.out_dir.parent
        for name in ("README.md", "readme.md", "README.rst", "README.txt", "README"):
            p = repo / name
            if p.exists():
                try:
                    return p.read_text(errors="ignore")[:max_chars]
                except Exception:  # noqa: BLE001
                    return ""
        return ""


@lru_cache(maxsize=16)
def _cached(out_dir: str, mtime: float) -> RepoGraph:  # mtime busts the cache after re-analysis
    return RepoGraph(Path(out_dir))


def load_graph(out_dir: Path) -> RepoGraph:
    gp = Path(out_dir) / "graph.json"
    lp = Path(out_dir) / ".graphify_labels.json"
    mtime = gp.stat().st_mtime + (lp.stat().st_mtime if lp.exists() else 0)
    return _cached(str(out_dir), mtime)
