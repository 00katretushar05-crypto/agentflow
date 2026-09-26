import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Shield } from "lucide-react";
import { EvidenceLedger } from "@/components/EvidenceLedger";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskGauge } from "@/components/RiskGauge";
import { EVIDENCE_ITEMS, TASKS } from "@/data/demo";

export function Evidence() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const task = TASKS.find((t) => t.id === taskId) ?? TASKS[0];

  const passed = EVIDENCE_ITEMS.filter((e) => e.status === "PASS").length;
  const total = EVIDENCE_ITEMS.length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-white/30 mb-2">
              <span>Evidence Ledger</span>
              <ChevronRight className="w-3 h-3" />
              <span className="font-mono text-white/50">{task.id}</span>
            </div>
            <h1 className="text-xl font-bold text-white/90">{task.title}</h1>
            <p className="text-[13px] text-white/40 mt-1">{task.description}</p>
          </div>
          <StatusBadge variant={task.status} dot />
        </div>
      </div>

      {/* Summary bar */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-[11px] text-white/30 uppercase tracking-wide">Evidence Score</p>
              <p className="text-[22px] font-bold text-white/90">
                {passed}
                <span className="text-[14px] text-white/30">/{total}</span>
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex-1 max-w-xs space-y-1.5">
            <div className="flex justify-between text-[10px] text-white/30">
              <span>Completion</span>
              <span>{Math.round((passed / total) * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
                style={{ width: `${(passed / total) * 100}%` }}
              />
            </div>
          </div>

          <RiskGauge level={task.riskLevel} showLabel />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Files Changed", value: task.filesChanged },
          { label: "Tests Run", value: task.testsRun },
          { label: "Tests Passed", value: task.testsPassed },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/[0.07] bg-[#111318] p-4 text-center"
          >
            <p className="text-[24px] font-bold text-white/80">{s.value}</p>
            <p className="text-[10px] text-white/25 uppercase tracking-wide mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Evidence Items */}
      <div className="space-y-2">
        <h2 className="text-[10px] tracking-widest text-white/25 uppercase font-semibold mb-4">
          Verification Checklist
        </h2>
        <EvidenceLedger items={EVIDENCE_ITEMS} />
      </div>

      {/* Approve Button */}
      {task.status !== "VERIFIED" && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <p className="text-[12px] text-white/50 mb-3">
            All automated checks have passed. Human approval required before merge.
          </p>
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-semibold transition-colors shadow-lg shadow-emerald-500/20">
            <Shield className="w-4 h-4" />
            Approve & Merge
          </button>
        </div>
      )}
    </div>
  );
}
