"""Runtime configuration (all overridable through environment variables)."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("REPOLENS_DATA_DIR", BACKEND_DIR / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
# Gemma 4 served through the Gemini API. Alternatives: gemma-4-31b-it
GEMMA_MODEL = os.environ.get("GEMMA_MODEL", "gemma-4-26b-a4b-it")

# ---------------------------------------------------------------------------------------------
# LLM provider. Default "gemini" = Gemma 4 on the Gemini API (what the hackathon entry runs on).
# The other two are OpenAI-compatible chat-completions endpoints, useful when latency matters:
#   "openrouter" -> Gemma 4 weights on faster hosts, reasoning switched off (model stays Gemma)
#   "openai"     -> OpenAI models (or any OpenAI-compatible server via OPENAI_BASE_URL)
# ---------------------------------------------------------------------------------------------
PROVIDER = os.environ.get("REPOLENS_PROVIDER", "gemini").strip().lower()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-6-luna")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemma-4-26b-a4b-it")

# Ask OpenAI-compatible hosts to skip hidden reasoning (big latency win on Gemma 4). "0" to leave default.
LLM_DISABLE_REASONING = os.environ.get("LLM_DISABLE_REASONING", "1") == "1"


def active_model() -> str:
    return {"openai": OPENAI_MODEL, "openrouter": OPENROUTER_MODEL}.get(PROVIDER, GEMMA_MODEL)

GRAPHIFY_BIN = os.environ.get("GRAPHIFY_BIN") or shutil.which("graphify") or str(Path.home() / ".local/bin/graphify")

MAX_FILES = int(os.environ.get("REPOLENS_MAX_FILES", "6000"))
CLONE_TIMEOUT = int(os.environ.get("REPOLENS_CLONE_TIMEOUT", "180"))
EXTRACT_TIMEOUT = int(os.environ.get("REPOLENS_EXTRACT_TIMEOUT", "900"))
QUERY_TIMEOUT = int(os.environ.get("REPOLENS_QUERY_TIMEOUT", "60"))

ALLOWED_GIT_HOSTS = {"github.com", "www.github.com", "gitlab.com", "www.gitlab.com", "codeberg.org", "bitbucket.org"}
