"""Clone a repository and run Graphify over it.

Pipeline (all deterministic, no LLM involved):
  git clone --depth 1  ->  graphify extract --code-only  ->  graphify cluster-only --no-label
Produces graphify-out/{graph.json, GRAPH_REPORT.md, graph.html, .graphify_analysis.json}.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from .config import ALLOWED_GIT_HOSTS, CLONE_TIMEOUT, EXTRACT_TIMEOUT, GRAPHIFY_BIN, MAX_FILES
from .jobs import Job, store

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def normalize_repo_url(raw: str) -> tuple[str, str, str]:
    """Return (clone_url, repo_id, display_name) or raise ValueError."""
    raw = raw.strip()
    if raw.startswith("git@"):
        # git@github.com:owner/repo.git -> https://github.com/owner/repo
        m = re.match(r"git@([^:]+):(.+?)(?:\.git)?/?$", raw)
        if not m:
            raise ValueError("Unrecognised git URL")
        raw = f"https://{m.group(1)}/{m.group(2)}"
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    u = urlparse(raw)
    host = (u.hostname or "").lower()
    if host not in ALLOWED_GIT_HOSTS:
        raise ValueError(f"Host '{host}' is not allowed. Use a public GitHub/GitLab/Codeberg/Bitbucket URL.")
    parts = [p for p in u.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError("URL must look like https://github.com/<owner>/<repo>")
    owner, repo = parts[0], re.sub(r"\.git$", "", parts[1])
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repo):
        raise ValueError("Owner/repo contains unsupported characters")
    clone_url = f"https://{host.removeprefix('www.')}/{owner}/{repo}.git"
    repo_id = f"{_SLUG_RE.sub('-', owner.lower())}__{_SLUG_RE.sub('-', repo.lower())}".strip("-")
    return clone_url, repo_id, f"{owner}/{repo}"


def _count_files(root: Path) -> int:
    n = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "graphify-out")]
        n += len(filenames)
    return n


def _run(cmd: list[str], cwd: Path, timeout: int, env: dict | None = None) -> subprocess.CompletedProcess:
    full_env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GRAPHIFY_BACKEND": "none", "GRAPHIFY_NO_BACKUP": "1",
                "PATH": os.environ.get("PATH", "") + ":" + str(Path.home() / ".local/bin")}
    if env:
        full_env.update(env)
    return subprocess.run(cmd, cwd=str(cwd), env=full_env, capture_output=True, text=True, timeout=timeout)


def run_pipeline(job: Job) -> None:
    try:
        job.dir.mkdir(parents=True, exist_ok=True)
        if job.repo_dir.exists():
            shutil.rmtree(job.repo_dir)

        store.update(job, status="cloning", message="Cloning repository (depth 1)...")
        r = _run(["git", "clone", "--depth", "1", "--single-branch", job.repo_url, "repo"], job.dir, CLONE_TIMEOUT)
        if r.returncode != 0:
            raise RuntimeError(f"git clone failed: {(r.stderr or r.stdout).strip()[-400:]}")

        n_files = _count_files(job.repo_dir)
        if n_files > MAX_FILES:
            raise RuntimeError(f"Repository has {n_files} files; limit is {MAX_FILES} for the hosted demo.")
        store.update(job, status="extracting", message=f"Parsing {n_files} files with Graphify (tree-sitter AST)...", files=n_files)

        r = _run([GRAPHIFY_BIN, "extract", "repo", "--code-only"], job.dir, EXTRACT_TIMEOUT)
        if r.returncode != 0 or not (job.out_dir / "graph.json").exists():
            raise RuntimeError(f"graphify extract failed: {(r.stderr or r.stdout).strip()[-600:]}")
        m = re.search(r"wrote .*graph\.json: (\d+) nodes, (\d+) edges, (\d+) communities", r.stdout + r.stderr)
        if m:
            store.update(job, nodes=int(m.group(1)), edges=int(m.group(2)), communities=int(m.group(3)))

        store.update(job, status="reporting", message="Leiden clustering, god nodes, GRAPH_REPORT.md and graph.html...")
        r = _run([GRAPHIFY_BIN, "cluster-only", "repo", "--no-label"], job.dir, EXTRACT_TIMEOUT)
        if r.returncode != 0:
            raise RuntimeError(f"graphify cluster-only failed: {(r.stderr or r.stdout).strip()[-600:]}")

        store.update(job, status="ready", message="Graph ready")
    except subprocess.TimeoutExpired as e:  # noqa: PERF203
        store.update(job, status="error", message=f"Timed out while running: {' '.join(map(str, e.cmd[:2]))}")
    except Exception as e:  # noqa: BLE001
        store.update(job, status="error", message=str(e))


def regenerate_html(job: Job) -> bool:
    """Re-render graph.html so community names (from .graphify_labels.json) show up."""
    try:
        r = _run([GRAPHIFY_BIN, "export", "html", "--graph", str(job.out_dir / "graph.json"),
                  "--labels", str(job.out_dir / ".graphify_labels.json")], job.repo_dir, EXTRACT_TIMEOUT)
        return r.returncode == 0
    except Exception:  # noqa: BLE001
        return False
