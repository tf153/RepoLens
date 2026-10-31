"""Tiny job store: in-memory dict mirrored to data/<id>/job.json so pre-warmed
repos survive a backend restart."""
from __future__ import annotations

import json
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .config import DATA_DIR

STATUSES = ("queued", "cloning", "extracting", "reporting", "ready", "error")


@dataclass
class Job:
    id: str
    repo_url: str
    status: str = "queued"
    message: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    stats: dict = field(default_factory=dict)

    @property
    def dir(self) -> Path:
        return DATA_DIR / self.id

    @property
    def repo_dir(self) -> Path:
        return self.dir / "repo"

    @property
    def out_dir(self) -> Path:
        return self.repo_dir / "graphify-out"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["ready"] = self.status == "ready"
        return d


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        for p in DATA_DIR.glob("*/job.json"):
            try:
                d = json.loads(p.read_text())
                job = Job(**{k: d[k] for k in ("id", "repo_url", "status", "message", "created_at", "updated_at", "stats") if k in d})
                # A job interrupted mid-pipeline is stale; mark it so it can be re-run.
                if job.status not in ("ready", "error"):
                    job.status, job.message = "error", "interrupted by restart; re-run analyze"
                self._jobs[job.id] = job
            except Exception:  # noqa: BLE001 - corrupt sidecar, skip
                continue

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def ready(self) -> list[Job]:
        return sorted((j for j in self._jobs.values() if j.status == "ready"), key=lambda j: j.updated_at, reverse=True)

    def create(self, job_id: str, repo_url: str) -> Job:
        with self._lock:
            job = Job(id=job_id, repo_url=repo_url)
            self._jobs[job_id] = job
            self._persist(job)
            return job

    def update(self, job: Job, status: str | None = None, message: str | None = None, **stats) -> Job:
        with self._lock:
            if status:
                job.status = status
            if message is not None:
                job.message = message
            if stats:
                job.stats.update(stats)
            job.updated_at = time.time()
            self._persist(job)
            return job

    def _persist(self, job: Job) -> None:
        job.dir.mkdir(parents=True, exist_ok=True)
        (job.dir / "job.json").write_text(json.dumps(asdict(job), indent=2))


store = JobStore()
