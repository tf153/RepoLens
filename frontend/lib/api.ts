// Thin client for the RepoLens API. All calls go through the Next.js rewrite at /api/*.

export type JobStatus = "queued" | "cloning" | "extracting" | "reporting" | "ready" | "error";

export interface Job {
  id: string;
  name: string;
  repo_url: string;
  status: JobStatus;
  message: string;
  ready: boolean;
  stats: { files?: number; nodes?: number; edges?: number; communities?: number };
}

export interface GodNode {
  id: string;
  label: string;
  degree: number;
  file?: string;
  loc: string;
  community?: number;
  community_name: string;
}

export interface Community {
  id: number;
  label: string;
  size: number;
  cohesion: number;
  hub: string;
  sample: string[];
  files: string[];
}

export interface Summary {
  id: string;
  name: string;
  repo_url: string;
  stats: {
    nodes: number;
    edges: number;
    communities: number;
    files: number;
    languages: { ext: string; files: number }[];
    relations: { relation: string; count: number }[];
    confidence: Record<string, number>;
    built_at_commit?: string;
  };
  god_nodes: GodNode[];
  communities: Community[];
  top_dirs: string[];
  surprises: { source: string; target: string; relation: string; confidence: string; why?: string }[];
  questions: string[];
  has_tour: boolean;
  gemma: boolean;
  model: string;
}

export interface Tour {
  architecture_summary: string;
  start_here: { node: string; file: string; why: string }[];
  subsystems: { community: number; label: string; role: string }[];
  reading_path: { step: number; file: string; what_to_look_for: string }[];
  gotchas?: string[];
  onboarding_md: string;
  model: string;
  parse_warning?: string;
  graph_html_relabelled?: boolean;
}

export interface EdgeRow {
  source: string;
  target: string;
  source_loc?: string;
  target_loc?: string;
  relation: string;
  confidence: string;
  file?: string;
  loc?: string;
}

export interface ChatResult {
  answer: string;
  seeds: { label: string; loc: string; degree: number; community: string }[];
  paths: EdgeRow[][];
  evidence: EdgeRow[];
  explored: number;
  model: string;
}

export interface DiagramResult {
  components: {
    name: string;
    found_in_graph: boolean;
    matched_node?: string | null;
    note?: string;
    verified?: boolean;
    graph_node?: string;
    graph_loc?: string;
  }[];
  relationships?: { from: string; to: string; label?: string; supported_by_graph: boolean | "unknown" }[];
  missing_in_diagram: string[];
  drift_summary: string;
  drift_score?: number | null;
  model: string;
  error?: string;
}

export interface RepoListItem {
  id: string;
  name: string;
  repo_url: string;
  stats: Job["stats"];
  has_tour: boolean;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch("/api/health").then(j<{ ok: boolean; gemma: boolean; model: string }>),
  repos: () => fetch("/api/repos", { cache: "no-store" }).then(j<RepoListItem[]>),
  analyze: (repo_url: string, force = false) =>
    fetch(`/api/analyze${force ? "?force=true" : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo_url }),
    }).then(j<{ job_id: string; status: JobStatus; name: string; cached?: boolean }>),
  job: (id: string) => fetch(`/api/jobs/${id}`, { cache: "no-store" }).then(j<Job>),
  summary: (id: string) => fetch(`/api/repos/${id}/summary`, { cache: "no-store" }).then(j<Summary>),
  tour: (id: string, refresh = false) =>
    fetch(`/api/repos/${id}/tour${refresh ? "?refresh=true" : ""}`, { method: "POST" }).then(j<Tour>),
  chat: (id: string, question: string) =>
    fetch(`/api/repos/${id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    }).then(j<ChatResult>),
  path: (id: string, a: string, b: string) =>
    fetch(`/api/repos/${id}/path?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`).then(
      j<{ found: boolean; hops?: number; edges?: EdgeRow[]; error?: string }>,
    ),
  diagram: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    return fetch(`/api/repos/${id}/diagram`, { method: "POST", body: fd }).then(j<DiagramResult>);
  },
  graphHtmlUrl: (id: string) => `/api/repos/${id}/graph.html`,
};
