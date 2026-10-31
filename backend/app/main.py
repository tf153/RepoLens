"""RepoLens API — Graphify builds the graph, Gemma 4 explains it."""
from __future__ import annotations

import json
import threading
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from . import gemma
from .config import GEMMA_MODEL
from .graph_tools import load_graph
from .graphify_runner import normalize_repo_url, regenerate_html, run_pipeline
from .jobs import Job, store

app = FastAPI(title="RepoLens API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_running: set[str] = set()
_running_lock = threading.Lock()


class AnalyzeIn(BaseModel):
    repo_url: str


class ChatIn(BaseModel):
    question: str


def _job_or_404(job_id: str, ready: bool = True) -> Job:
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown repo id")
    if ready and job.status != "ready":
        raise HTTPException(409, f"Repo is not ready (status={job.status})")
    return job


def _display_name(job: Job) -> str:
    try:
        return normalize_repo_url(job.repo_url)[2]
    except ValueError:
        return job.id


def _run_job(job: Job) -> None:
    try:
        run_pipeline(job)
    finally:
        with _running_lock:
            _running.discard(job.id)


@app.get("/health")
def health():
    return {"ok": True, "gemma": gemma.available(), "model": GEMMA_MODEL}


@app.post("/analyze")
def analyze(body: AnalyzeIn, bg: BackgroundTasks, force: bool = False):
    try:
        clone_url, repo_id, name = normalize_repo_url(body.repo_url)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    job = store.get(repo_id)
    if job and job.status == "ready" and not force:
        return {"job_id": repo_id, "status": "ready", "name": name, "cached": True}
    with _running_lock:
        if repo_id in _running:
            return {"job_id": repo_id, "status": job.status if job else "queued", "name": name}
        _running.add(repo_id)
    job = store.create(repo_id, clone_url)
    bg.add_task(_run_job, job)
    return {"job_id": repo_id, "status": "queued", "name": name}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = _job_or_404(job_id, ready=False)
    return job.to_dict() | {"name": _display_name(job)}


@app.get("/repos")
def list_repos():
    return [{"id": j.id, "name": _display_name(j), "repo_url": j.repo_url, "stats": j.stats,
             "has_tour": (j.dir / "tour.json").exists()} for j in store.ready()]


@app.get("/repos/{job_id}/summary")
def summary(job_id: str):
    job = _job_or_404(job_id)
    rg = load_graph(job.out_dir)
    return {
        "id": job.id, "name": _display_name(job), "repo_url": job.repo_url,
        "stats": rg.stats(), "god_nodes": rg.god_nodes(15), "communities": rg.communities(14),
        "top_dirs": rg.top_dirs(), "surprises": (rg.analysis.get("surprises") or [])[:6],
        "questions": [str(q.get("question"))[:220] for q in (rg.analysis.get("questions") or [])[:6]],
        "has_tour": (job.dir / "tour.json").exists(), "gemma": gemma.available(), "model": GEMMA_MODEL,
    }


@app.get("/repos/{job_id}/graph.html")
def graph_html(job_id: str):
    job = _job_or_404(job_id)
    p = job.out_dir / "graph.html"
    if not p.exists():
        raise HTTPException(404, "graph.html not generated")
    return FileResponse(p, media_type="text/html")


@app.get("/repos/{job_id}/report", response_class=PlainTextResponse)
def report(job_id: str):
    job = _job_or_404(job_id)
    p = job.out_dir / "GRAPH_REPORT.md"
    return p.read_text() if p.exists() else "(no report)"


@app.post("/repos/{job_id}/tour")
def tour(job_id: str, refresh: bool = False):
    job = _job_or_404(job_id)
    cache = job.dir / "tour.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())
    rg = load_graph(job.out_dir)
    data = gemma.tour(_display_name(job), rg)
    # Persist Gemma's subsystem names as Graphify community labels and re-render graph.html with them.
    labels = {str(s["community"]): s["label"] for s in data.get("subsystems", [])
              if isinstance(s, dict) and s.get("community") is not None and s.get("label")}
    if labels and gemma.available():
        existing = {}
        lp = job.out_dir / ".graphify_labels.json"
        if lp.exists():
            try:
                existing = json.loads(lp.read_text())
            except Exception:  # noqa: BLE001
                existing = {}
        lp.write_text(json.dumps(existing | labels, indent=2))
        data["graph_html_relabelled"] = regenerate_html(job)
    if gemma.available():  # never cache the graph-only fallback; it should upgrade once a key is configured
        cache.write_text(json.dumps(data, indent=2))
    return data


@app.post("/repos/{job_id}/chat")
def chat(job_id: str, body: ChatIn):
    job = _job_or_404(job_id)
    q = body.question.strip()
    if not q:
        raise HTTPException(400, "Empty question")
    rg = load_graph(job.out_dir)
    return gemma.chat(_display_name(job), rg, q[:600])


@app.get("/repos/{job_id}/path")
def path(job_id: str, a: str = Query(...), b: str = Query(...)):
    job = _job_or_404(job_id)
    rg = load_graph(job.out_dir)
    return rg.shortest_path(a, b)


@app.get("/repos/{job_id}/explain")
def explain(job_id: str, symbol: str = Query(...)):
    job = _job_or_404(job_id)
    rg = load_graph(job.out_dir)
    return {"symbol": symbol, "text": rg.cli_explain(symbol)}


@app.post("/repos/{job_id}/diagram")
async def diagram(job_id: str, image: UploadFile = File(...)):
    job = _job_or_404(job_id)
    if image.content_type not in ("image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"):
        raise HTTPException(400, "Upload a PNG, JPEG or WebP image")
    data = await image.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "Image larger than 8 MB")
    rg = load_graph(job.out_dir)
    return gemma.diagram_check(_display_name(job), rg, data, image.content_type)
