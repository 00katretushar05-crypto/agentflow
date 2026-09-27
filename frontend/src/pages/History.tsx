import { useNavigate } from "react-router-dom";
import {
  Clock,
  ChevronRight,
  Search,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { SupervisorState, TaskSummary } from "@/data/demo";
import { useState, useEffect } from "react";
import { getTasks, ApiError } from "@/lib/api";

const STATUS_FILTERS: Array<"ALL" | SupervisorState> = [
  "ALL",
  "VERIFIED",
  "FAILED",
  "TESTING",
  "IMPLEMENTING",
];

export function History() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("ALL");

  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const data = await getTasks();
      setTasks(data.tasks);
      setUnreachable(false);
    } catch (err) {
      const isUnreachable = err instanceof ApiError && err.unreachable;
      setUnreachable(isUnreachable);
      setError(
        isUnreachable
          ? "Backend not reachable — make sure the server is running on port 3001."
          : err instanceof Error
          ? err.message
          : "Failed to load history.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTasks(); }, []);

  const filtered =
    filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);

  const counts = {
    VERIFIED: tasks.filter((t) => t.status === "VERIFIED").length,
    FAILED: tasks.filter((t) => t.status === "FAILED").length,
    TESTING: tasks.filter(
      (t) => t.status === "TESTING" || t.status === "RETESTING"
    ).length,
    IMPLEMENTING: tasks.filter(
      (t) => t.status === "IMPLEMENTING" || t.status === "ANALYZING" || t.status === "PLANNING"
    ).length,
  };

  function formatRelativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/40">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Loading history…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90">Task History</h1>
          <p className="text-[13px] text-white/35 mt-1">
            {tasks.length} tasks total · {counts.VERIFIED} verified · {counts.FAILED} failed
          </p>
        </div>
        <button
          onClick={loadTasks}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] text-white/35 hover:text-white/60 hover:bg-white/[0.06] transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-[12px] font-semibold">
              {unreachable ? "Backend not reachable" : "Failed to load history"}
            </p>
            <p className="text-[11px] text-red-300/70">{error}</p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Verified",     count: counts.VERIFIED,     color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Testing",      count: counts.TESTING,      color: "text-amber-400",   bg: "bg-amber-500/10" },
          { label: "Failed",       count: counts.FAILED,       color: "text-red-400",     bg: "bg-red-500/10" },
          { label: "Implementing", count: counts.IMPLEMENTING, color: "text-indigo-400",  bg: "bg-indigo-500/10" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/[0.07] bg-[#111318] p-4 text-center"
          >
            <p className={`text-[28px] font-bold ${s.color}`}>{s.count}</p>
            <p className="text-[10px] text-white/25 uppercase tracking-wide mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              filter === f
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "bg-white/[0.04] text-white/35 border border-white/[0.06] hover:text-white/60 hover:bg-white/[0.06]"
            }`}
          >
            {f.replace("_", " ")}
          </button>
        ))}
        <div className="flex-1 flex justify-end">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/25 text-[12px]">
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filter tasks</span>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        {filtered.length === 0 && !error && (
          <div className="px-5 py-8 text-center text-[13px] text-white/25">
            {tasks.length === 0 ? "No tasks yet." : "No tasks match this filter."}
          </div>
        )}
        <div className="divide-y divide-white/[0.04]">
          {filtered.map((task) => (
            <div
              key={task.taskId}
              className="group flex items-start gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
              onClick={() => navigate(`/mission/${task.taskId}`)}
            >
              {/* Status badge */}
              <div className="mt-0.5 shrink-0">
                <StatusBadge variant={task.status} dot />
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-[14px] font-semibold text-white/85 group-hover:text-white transition-colors truncate">
                  {task.goal}
                </p>

                {/* Meta */}
                <div className="flex items-center gap-4 pt-0.5 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/25">
                    <Clock className="w-3 h-3" />
                    <span>Updated {formatRelativeTime(task.updatedAt)}</span>
                  </div>
                  <span className="text-[11px] text-white/20 font-mono ml-auto hidden sm:block">
                    {task.taskId}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/40 shrink-0 mt-1 transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
