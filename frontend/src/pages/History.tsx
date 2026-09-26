import { useNavigate } from "react-router-dom";
import {
  Clock,
  FileCode2,
  FlaskConical,
  ChevronRight,
  Search,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskGauge } from "@/components/RiskGauge";
import { TASKS } from "@/data/demo";
import { useState } from "react";

export function History() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("ALL");

  const STATUS_FILTERS = ["ALL", "VERIFIED", "RECOVERED", "FAILED", "IN_PROGRESS"];

  const filtered =
    filter === "ALL" ? TASKS : TASKS.filter((t) => t.status === filter);

  const counts = {
    VERIFIED: TASKS.filter((t) => t.status === "VERIFIED").length,
    RECOVERED: TASKS.filter((t) => t.status === "RECOVERED").length,
    FAILED: TASKS.filter((t) => t.status === "FAILED").length,
    IN_PROGRESS: TASKS.filter((t) => t.status === "IN_PROGRESS").length,
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90">Task History</h1>
          <p className="text-[13px] text-white/35 mt-1">
            {TASKS.length} tasks total · {counts.VERIFIED} verified · {counts.FAILED} failed
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Verified", count: counts.VERIFIED, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Recovered", count: counts.RECOVERED, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Failed", count: counts.FAILED, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "In Progress", count: counts.IN_PROGRESS, color: "text-indigo-400", bg: "bg-indigo-500/10" },
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
        <div className="divide-y divide-white/[0.04]">
          {filtered.map((task) => (
            <div
              key={task.id}
              className="group flex items-start gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
              onClick={() => navigate(`/mission/${task.id}`)}
            >
              {/* Status indicator */}
              <div className="mt-0.5">
                <RiskGauge level={task.riskLevel} showLabel={false} />
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-white/85 group-hover:text-white transition-colors">
                    {task.title}
                  </p>
                  <StatusBadge variant={task.status} dot />
                </div>
                <p className="text-[12px] text-white/35 truncate">{task.description}</p>

                {/* Meta */}
                <div className="flex items-center gap-4 pt-1 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/25">
                    <Clock className="w-3 h-3" />
                    <span>{task.duration ?? "In progress"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/25">
                    <FileCode2 className="w-3 h-3" />
                    <span>{task.filesChanged} files</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/25">
                    <FlaskConical className="w-3 h-3" />
                    <span>
                      {task.testsPassed}/{task.testsRun} tests
                    </span>
                  </div>
                  <span className="text-[11px] text-white/20 font-mono ml-auto hidden sm:block">
                    {task.id}
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
