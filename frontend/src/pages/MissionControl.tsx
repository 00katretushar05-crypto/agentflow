import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileCode2,
  FlaskConical,
  AlertTriangle,
  Clock,
  ArrowRight,
  ChevronRight,
  AlertCircle,
  XCircle,
  Loader2,
  Terminal,
} from "lucide-react";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { AgentCard } from "@/components/AgentCard";
import { ActivityFeed, historyToActivityEntries } from "@/components/ActivityFeed";
import type { RichActivityEntry } from "@/components/ActivityFeed";
import { RiskGauge } from "@/components/RiskGauge";
import { CodeDiff } from "@/components/CodeDiff";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AGENT_META,
  toAgentStatus,
  supervisorStateToStage,
  CODE_DIFF,
} from "@/data/demo";
import type { TaskDetail, WorkflowStage } from "@/data/demo";
import { getTask, approveTask, ApiError, isTerminal } from "@/lib/api";

const POLL_INTERVAL = 2000;

export function MissionControl() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"feed" | "diff">("feed");

  // ── Remote data state ──────────────────────────────────────────────────────
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  // ── Approval state ─────────────────────────────────────────────────────────
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Keep polling ref so we can clear it on unmount / terminal state
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollRef.current !== null) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }

  async function fetchTask(id: string) {
    try {
      const data = await getTask(id);
      setTask(data);
      setError(null);
      setUnreachable(false);

      if (!isTerminal(data.status)) {
        pollRef.current = setTimeout(() => fetchTask(id), POLL_INTERVAL);
      }
    } catch (err) {
      const isUnreachable = err instanceof ApiError && err.unreachable;
      setUnreachable(isUnreachable);
      setError(
        isUnreachable
          ? "Backend not reachable — make sure the server is running on port 3001."
          : err instanceof Error
          ? err.message
          : "Failed to load task.",
      );
      // Retry even on error so the page recovers when the backend comes back
      pollRef.current = setTimeout(() => fetchTask(id!), POLL_INTERVAL);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!taskId || approving) return;
    setApproving(true);
    setApproveError(null);
    try {
      await approveTask(taskId);
      // Kick off a fresh fetch; polling will resume from there
      stopPolling();
      await fetchTask(taskId);
    } catch (err) {
      setApproveError(
        err instanceof Error ? err.message : "Approval request failed.",
      );
    } finally {
      setApproving(false);
    }
  }

  useEffect(() => {
    if (!taskId) return;
    fetchTask(taskId);
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-white/40">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Loading task…</span>
        </div>
      </div>
    );
  }

  // ── Error / unreachable banner (task not loaded at all) ────────────────────
  if (!task) {
    // Backend is reachable but task doesn't exist — friendly empty state
    if (!unreachable) {
      return (
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col items-center justify-center gap-6 h-72">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
              <Terminal className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-[15px] font-semibold text-white/60">No task selected yet</p>
            <p className="text-[12px] text-white/30 max-w-xs leading-relaxed">
              Dispatch a task from the Command Center to begin orchestration.
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
      <div className="max-w-7xl mx-auto px-6 py-8">
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

  // ── Derived values (task is loaded) ───────────────────────────────────────
  const stage: WorkflowStage = supervisorStateToStage(task.status);

  // agentStatus is now an array
  const agentStatusList = task.agentStatus ?? [];

  const ciResult = task.agentResults?.["CODE_INTELLIGENCE"];
  const filesChanged = ciResult?.findings?.affectedFiles?.length ?? 0;

  // Pull real test counts from verification or TEST_QA result
  const verification = task.verification;
  const qaResult = task.agentResults?.["TEST_QA"];
  const testsExecuted =
    verification?.testsExecuted ?? qaResult?.testResult?.totalTests ?? null;
  const testsPassed =
    verification?.testsPassed ?? qaResult?.testResult?.passed ?? null;

  // Risk gauge: prefer riskAssessment from API, fall back to nothing
  const riskAssessment = task.riskAssessment;

  const feedEntries = historyToActivityEntries(task.history ?? []) as RichActivityEntry[];
  const latestHistory = task.history?.[task.history.length - 1];

  const isFailed = task.status === "FAILED";

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Non-blocking error banner (polling error while task is displayed) */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] text-[12px] text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] text-white/30">
            <span>Task</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-mono text-white/50">{task.taskId}</span>
          </div>
          <h1 className="text-xl font-bold text-white/90">{task.goal}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge variant={task.status} dot />
          <button
            onClick={() => navigate(`/evidence/${task.taskId}`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all"
          >
            View Evidence
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* AWAITING_APPROVAL — human approval banner */}
      {task.status === "AWAITING_APPROVAL" && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-amber-300">Human approval required</p>
              <p className="text-[12px] text-amber-300/60 mt-0.5">
                All agents have completed successfully. Review the activity feed and code diff, then approve to mark this task as verified.
              </p>
              {approveError && (
                <p className="flex items-center gap-1.5 text-[12px] text-red-300 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {approveError}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex items-center gap-2 shrink-0 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-[12px] font-semibold text-black transition-colors"
          >
            {approving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Approving…
              </>
            ) : (
              "Request Human Approval"
            )}
          </button>
        </div>
      )}

      {/* FAILED terminal message */}
      {isFailed && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl border border-red-500/25 bg-red-500/[0.06]">
          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-red-300">Task failed</p>
            <p className="text-[12px] text-red-300/70 mt-0.5">
              {latestHistory?.reason ?? "The agents were unable to complete this task. Review the activity feed for details."}
            </p>
          </div>
        </div>
      )}

      {/* Workflow Timeline */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] tracking-widest text-white/25 uppercase font-semibold">
            Workflow Progress
          </h2>
          {/* Live polling indicator */}
          {!isTerminal(task.status) && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/25">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Live
            </div>
          )}
        </div>
        <WorkflowTimeline currentStage={stage} />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Agents */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-[10px] tracking-widest text-white/25 uppercase font-semibold">
            Active Agents
          </h2>
          {agentStatusList.map(({ agent: agentId, status: runStatus }) => {
            const meta = AGENT_META[agentId];
            if (!meta) return null;
            const uiStatus = toAgentStatus(runStatus);
            const agentObj = { ...meta, status: uiStatus };
            const agentResult =
              runStatus === "SUCCESS" ? (task.agentResults?.[agentId] ?? null) : null;
            return (
              <AgentCard
                key={agentId}
                agent={agentObj}
                agentRunStatus={runStatus}
                agentResult={agentResult}
                highlight={runStatus === "PARTIAL"}
              />
            );
          })}
          {agentStatusList.length === 0 && (
            <p className="text-[12px] text-white/25 italic">No agents assigned yet.</p>
          )}
        </div>

        {/* Right: Stats + Feed */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<FileCode2 className="w-4 h-4 text-indigo-400" />}
              label="Files Changed"
              value={filesChanged > 0 ? String(filesChanged) : "—"}
              color="indigo"
            />
            <StatCard
              icon={<FlaskConical className="w-4 h-4 text-cyan-400" />}
              label="Tests Run"
              value={testsExecuted !== null ? String(testsExecuted) : "—"}
              color="cyan"
            />
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              label="Tests Passed"
              value={testsPassed !== null ? String(testsPassed) : "—"}
              color="emerald"
            />
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-4 flex flex-col items-center justify-center gap-1">
              {riskAssessment ? (
                <>
                  <RiskGauge
                    riskPercent={riskAssessment.riskPercent}
                    dependencyImpact={riskAssessment.dependencyImpact}
                    showLabel
                  />
                </>
              ) : (
                <RiskGauge level="MEDIUM" showLabel />
              )}
            </div>
          </div>

          {/* Risk recommendation (when available) */}
          {riskAssessment?.recommendation && (
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-white/50 leading-relaxed">
                {riskAssessment.recommendation}
              </p>
            </div>
          )}

          {/* Supervisor Status */}
          <div className={`rounded-xl border p-4 ${
            isFailed
              ? "border-red-500/20 bg-red-500/[0.04]"
              : "border-indigo-500/20 bg-indigo-500/[0.04]"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`w-4 h-4 ${isFailed ? "text-red-400" : "text-indigo-400"}`} />
              <span className={`text-[11px] font-semibold tracking-wide ${isFailed ? "text-red-300" : "text-indigo-300"}`}>
                SUPERVISOR STATUS
              </span>
            </div>
            <p className="text-[13px] text-white/60 transition-all duration-500">
              {latestHistory?.reason ?? "Monitoring agents…"}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Clock className="w-3.5 h-3.5 text-white/25" />
              <span className="text-[11px] text-white/30">
                Stage: {stage} · State: {task.status} · Retries: {task.retryCount}/{task.maxRetries}
              </span>
            </div>
          </div>

          {/* Tab: Feed / Diff */}
          <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
            <div className="flex items-center border-b border-white/[0.06]">
              {(["feed", "diff"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    activeTab === tab
                      ? "text-indigo-300 border-b-2 border-indigo-500"
                      : "text-white/30 hover:text-white/60"
                  }`}
                >
                  {tab === "feed" ? `Activity Feed (${feedEntries.length})` : "Code Diff"}
                </button>
              ))}
            </div>
            <div className="p-3">
              {activeTab === "feed" ? (
                <ActivityFeed entries={feedEntries} maxHeight="280px" />
              ) : (
                <CodeDiff diff={CODE_DIFF} filename="src/checkout/checkout.js" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "indigo" | "cyan" | "emerald";
}) {
  const colorMap = {
    indigo: "text-indigo-400",
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-4 flex flex-col gap-2">
      {icon}
      <p className={`text-2xl font-bold transition-all duration-300 ${colorMap[color]}`}>{value}</p>
      <p className="text-[10px] text-white/30 uppercase tracking-wide">{label}</p>
    </div>
  );
}
