import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Shield, Loader2, AlertCircle, CheckCircle2, Terminal } from "lucide-react";
import { EvidenceLedger } from "@/components/EvidenceLedger";
import { StatusBadge } from "@/components/StatusBadge";
import { RiskGauge } from "@/components/RiskGauge";
import type { TaskDetail, EvidenceResponse } from "@/data/demo";
import { getTask, getEvidence, approveTask, ApiError } from "@/lib/api";

export function Evidence() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;

    async function load() {
      try {
        const [taskData, evidenceData] = await Promise.all([
          getTask(taskId!),
          getEvidence(taskId!),
        ]);
        if (!cancelled) {
          setTask(taskData);
          setEvidence(evidenceData);
          setError(null);
          setUnreachable(false);
        }
      } catch (err) {
        if (cancelled) return;
        const isUnreachable = err instanceof ApiError && err.unreachable;
        setUnreachable(isUnreachable);
        setError(
          isUnreachable
            ? "Backend not reachable — make sure the server is running on port 3001."
            : err instanceof Error
            ? err.message
            : "Failed to load evidence.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [taskId]);

  async function handleApprove() {
    if (!taskId) return;
    setApproving(true);
    setApproveError(null);
    try {
      await approveTask(taskId);
      setApproved(true);
      const updated = await getTask(taskId);
      setTask(updated);
    } catch (err) {
      const isUnreachable = err instanceof ApiError && err.unreachable;
      setApproveError(
        isUnreachable
          ? "Backend not reachable — approval could not be submitted."
          : err instanceof Error
          ? err.message
          : "Failed to approve task.",
      );
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/40">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Loading evidence…</span>
        </div>
      </div>
    );
  }

  if (!task || !evidence) {
    // Backend is reachable but task/evidence doesn't exist — friendly empty state
    if (!unreachable) {
      return (
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col items-center justify-center gap-6 h-72">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
              <Terminal className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-[15px] font-semibold text-white/60">No task selected yet</p>
            <p className="text-[12px] text-white/30 max-w-xs leading-relaxed">
              Dispatch a task from the Command Center to generate an evidence ledger.
            </p>
          </div>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[13px] font-medium hover:bg-indigo-500/20 transition-colors"
          >
            <Terminal className="w-4 h-4" />
            Go to Command Center
          </button>
        </div>
      );
    }

    // Backend unreachable — show the technical error so the dev can debug
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] text-red-300">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[13px] font-semibold">Backend not reachable</p>
            <p className="text-[12px] text-red-300/70">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const ledger = evidence.ledger;
  const riskAssessment = task.riskAssessment;

  const checklistRows = ledger
    ? [
        ledger.requirementConfirmed,
        ledger.impactAnalysisDone,
        ledger.testsExecuted > 0,
        ledger.testsExecuted > 0 && ledger.testsPassed === ledger.testsExecuted,
        ledger.regressionPassed,
        ledger.codeReviewStatus === "DONE",
        ledger.humanApprovalStatus === "APPROVED",
      ]
    : [];

  const checklistTotal = checklistRows.length;
  const checklistPassed = checklistRows.filter(Boolean).length;

  const filesChanged = ledger?.filesChangedCount ?? 0;
  const testsExecuted = ledger?.testsExecuted ?? null;
  const testsPassed = ledger?.testsPassed ?? null;

  const isVerified = task.status === "VERIFIED" || approved;
  const isFailed = task.status === "FAILED";
  const canApprove = task.status === "AWAITING_APPROVAL" && !approved;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
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
              <span className="font-mono text-white/50">{evidence.taskId}</span>
            </div>
            <h1 className="text-xl font-bold text-white/90">{task.goal}</h1>
          </div>
          <StatusBadge variant={task.status} dot />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-[11px] text-white/30 uppercase tracking-wide">Evidence Score</p>
              <p className="text-[22px] font-bold text-white/90">
                {checklistPassed}
                <span className="text-[14px] text-white/30">/{checklistTotal}</span>
              </p>
            </div>
          </div>

          <div className="flex-1 max-w-xs space-y-1.5">
            <div className="flex justify-between text-[10px] text-white/30">
              <span>Completion</span>
              <span>{checklistTotal > 0 ? Math.round((checklistPassed / checklistTotal) * 100) : 0}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
                style={{ width: checklistTotal > 0 ? `${(checklistPassed / checklistTotal) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {riskAssessment ? (
            <RiskGauge
              riskPercent={riskAssessment.riskPercent}
              dependencyImpact={riskAssessment.dependencyImpact}
              showLabel
            />
          ) : (
            <RiskGauge level="MEDIUM" showLabel />
          )}
        </div>

        {riskAssessment?.recommendation && (
          <p className="mt-3 pt-3 border-t border-white/[0.05] text-[12px] text-white/40 leading-relaxed">
            {riskAssessment.recommendation}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Files Changed", value: filesChanged > 0 ? filesChanged : "—" },
          { label: "Tests Run", value: testsExecuted !== null ? testsExecuted : "—" },
          { label: "Tests Passed", value: testsPassed !== null ? testsPassed : "—" },
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

      <EvidenceLedger
        ledger={ledger}
        logItems={evidence.items}
      />

      {isFailed && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5">
          <p className="text-[13px] font-semibold text-red-300 mb-1">Task failed</p>
          <p className="text-[12px] text-white/40">
            This task reached a terminal FAILED state. No further automated action will be taken.
          </p>
        </div>
      )}

      {canApprove && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <p className="text-[12px] text-white/50 mb-3">
            All automated checks have passed. Human approval required before merge.
          </p>
          {approveError && (
            <div className="flex items-start gap-2 mb-3 text-[12px] text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{approveError}</span>
            </div>
          )}
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-colors shadow-lg shadow-emerald-500/20"
          >
            {approving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            {approving ? "Submitting…" : "Approve & Merge"}
          </button>
        </div>
      )}

      {(isVerified && !isFailed) && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-emerald-300">Task verified</p>
            <p className="text-[12px] text-white/40">This task has been approved and marked as verified.</p>
          </div>
        </div>
      )}
    </div>
  );
}