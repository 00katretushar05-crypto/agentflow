import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileCode2,
  FlaskConical,
  AlertTriangle,
  Clock,
  ArrowRight,
  ChevronRight,
  Play,
  RotateCcw,
} from "lucide-react";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { AgentCard } from "@/components/AgentCard";
import { ActivityFeed, historyToActivityEntries } from "@/components/ActivityFeed";
import type { RichActivityEntry } from "@/components/ActivityFeed";
import { RiskGauge } from "@/components/RiskGauge";
import { CodeDiff } from "@/components/CodeDiff";
import { StatusBadge } from "@/components/StatusBadge";
import {
  MOCK_TASK,
  AGENT_META,
  toAgentStatus,
  supervisorStateToStage,
  CODE_DIFF,
} from "@/data/demo";
import type { SupervisorState, AgentRunStatus, WorkflowStage, HistoryEntry } from "@/data/demo";

// ─── Stage-advance simulation ─────────────────────────────────────────────────
// Ordered sequence of supervisor states for the demo replay
const DEMO_STATES: SupervisorState[] = [
  "RECEIVED",
  "PLANNING",
  "ANALYZING",
  "IMPLEMENTING",
  "TESTING",
  "VERIFYING",
  "AWAITING_APPROVAL",
  "VERIFIED",
];

// Per-step agent status snapshots
const DEMO_AGENT_STATUSES: Record<SupervisorState, Record<string, AgentRunStatus>> = {
  RECEIVED:          { CODE_INTELLIGENCE: "PENDING",     TEST_QA: "PENDING",     DEBUG_REVIEW: "PENDING" },
  PLANNING:          { CODE_INTELLIGENCE: "PENDING",     TEST_QA: "PENDING",     DEBUG_REVIEW: "PENDING" },
  ANALYZING:         { CODE_INTELLIGENCE: "IN_PROGRESS", TEST_QA: "PENDING",     DEBUG_REVIEW: "PENDING" },
  IMPLEMENTING:      { CODE_INTELLIGENCE: "DONE",        TEST_QA: "PENDING",     DEBUG_REVIEW: "PENDING" },
  TESTING:           { CODE_INTELLIGENCE: "DONE",        TEST_QA: "IN_PROGRESS", DEBUG_REVIEW: "PENDING" },
  RECOVERING:        { CODE_INTELLIGENCE: "DONE",        TEST_QA: "DONE",        DEBUG_REVIEW: "IN_PROGRESS" },
  RETESTING:         { CODE_INTELLIGENCE: "DONE",        TEST_QA: "IN_PROGRESS", DEBUG_REVIEW: "DONE" },
  FAILED:            { CODE_INTELLIGENCE: "DONE",        TEST_QA: "DONE",        DEBUG_REVIEW: "PENDING" },
  VERIFYING:         { CODE_INTELLIGENCE: "DONE",        TEST_QA: "DONE",        DEBUG_REVIEW: "PENDING" },
  AWAITING_APPROVAL: { CODE_INTELLIGENCE: "DONE",        TEST_QA: "DONE",        DEBUG_REVIEW: "PENDING" },
  VERIFIED:          { CODE_INTELLIGENCE: "DONE",        TEST_QA: "DONE",        DEBUG_REVIEW: "DONE" },
};

// Human-readable reason per transition
const DEMO_REASONS: Partial<Record<SupervisorState, string>> = {
  RECEIVED:          "Task received, preparing decomposition",
  PLANNING:          "Task decomposed into agent subtasks",
  ANALYZING:         "Agents assigned: CODE_INTELLIGENCE, TEST_QA",
  IMPLEMENTING:      "Both agents returned findings",
  TESTING:           "Implementation complete, running tests",
  VERIFYING:         "Tests passed (11/11), proceeding to verification",
  AWAITING_APPROVAL: "Static analysis clean, awaiting human sign-off",
  VERIFIED:          "Human approval granted — task complete ✓",
};

export function MissionControl() {
  useParams(); // taskId — used by real API fetch; mock ignores it
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"feed" | "diff">("feed");

  // ── Simulation state ──────────────────────────────────────────────────────
  const [stateIndex, setStateIndex] = useState<number>(() =>
    DEMO_STATES.indexOf(MOCK_TASK.status)
  );
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([
    ...MOCK_TASK.history,
  ]);

  const currentStatus = DEMO_STATES[stateIndex];
  const agentStatuses = DEMO_AGENT_STATUSES[currentStatus] ?? DEMO_AGENT_STATUSES["TESTING"];

  const canAdvance = stateIndex < DEMO_STATES.length - 1;
  const canReset = stateIndex > 0;

  const advance = useCallback(() => {
    if (!canAdvance) return;
    const nextIdx = stateIndex + 1;
    const from = DEMO_STATES[stateIndex];
    const to = DEMO_STATES[nextIdx];
    setHistoryEntries((prev) => [
      ...prev,
      {
        from,
        to,
        reason: DEMO_REASONS[to] ?? `Transitioned to ${to}`,
        timestamp: new Date().toISOString(),
      },
    ]);
    setStateIndex(nextIdx);
  }, [stateIndex, canAdvance]);

  const reset = useCallback(() => {
    setStateIndex(DEMO_STATES.indexOf("TESTING"));
    setHistoryEntries([...MOCK_TASK.history]);
  }, []);

  // Auto-advance every 4 s while still in demo (optional — only when not yet VERIFIED)
  const [autoPlay, setAutoPlay] = useState(false);
  useEffect(() => {
    if (!autoPlay || !canAdvance) return;
    const t = setTimeout(advance, 4000);
    return () => clearTimeout(t);
  }, [autoPlay, advance, canAdvance]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const stage: WorkflowStage = supervisorStateToStage(currentStatus);

  const ciResult = MOCK_TASK.agentResults["CODE_INTELLIGENCE"];
  const filesChanged = ciResult?.findings.affectedFiles.length ?? 0;

  // Build activity feed from the accumulated history
  const feedEntries = historyToActivityEntries(historyEntries) as RichActivityEntry[];

  // Latest history entry for supervisor status display
  const latestHistory = historyEntries[historyEntries.length - 1];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] text-white/30">
            <span>Task</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-mono text-white/50">{MOCK_TASK.taskId}</span>
          </div>
          <h1 className="text-xl font-bold text-white/90">{MOCK_TASK.goal}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge variant={currentStatus} dot />
          <button
            onClick={() => navigate(`/evidence/${MOCK_TASK.taskId}`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all"
          >
            View Evidence
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Workflow Timeline */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] tracking-widest text-white/25 uppercase font-semibold">
            Workflow Progress
          </h2>
          {/* Demo controls */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/20 mr-1">demo</span>
            <button
              onClick={reset}
              disabled={!canReset}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.07] text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              onClick={() => setAutoPlay((v) => !v)}
              disabled={!canAdvance}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                autoPlay
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                  : "bg-white/[0.04] border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07]"
              }`}
            >
              <Play className="w-3 h-3" />
              {autoPlay ? "Playing…" : "Auto"}
            </button>
            <button
              onClick={advance}
              disabled={!canAdvance}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-[11px] text-indigo-300 hover:bg-indigo-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next Stage
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
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
          {Object.entries(agentStatuses).map(([agentId, runStatus]) => {
            const meta = AGENT_META[agentId];
            if (!meta) return null;
            const uiStatus = toAgentStatus(runStatus);
            const agent = { ...meta, status: uiStatus };
            // Only pass result when agent is DONE
            const agentResult =
              runStatus === "DONE" ? MOCK_TASK.agentResults[agentId] : null;
            return (
              <AgentCard
                key={agentId}
                agent={agent}
                agentRunStatus={runStatus}
                agentResult={agentResult}
                highlight={runStatus === "IN_PROGRESS"}
              />
            );
          })}
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
              value={stateIndex >= DEMO_STATES.indexOf("TESTING") ? "11" : "—"}
              color="cyan"
            />
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              label="Tests Passed"
              value={stateIndex >= DEMO_STATES.indexOf("VERIFYING") ? "11" : "—"}
              color="emerald"
            />
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-4 flex flex-col items-center justify-center gap-1">
              <RiskGauge level={MOCK_TASK.risk ?? "MEDIUM"} showLabel />
            </div>
          </div>

          {/* Supervisor Status */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-indigo-400" />
              <span className="text-[11px] font-semibold text-indigo-300 tracking-wide">
                SUPERVISOR STATUS
              </span>
            </div>
            <p className="text-[13px] text-white/60 transition-all duration-500">
              {latestHistory?.reason ?? "Monitoring agents…"}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Clock className="w-3.5 h-3.5 text-white/25" />
              <span className="text-[11px] text-white/30">
                Stage: {stage} · State: {currentStatus} · Retries: {MOCK_TASK.retryCount}/{MOCK_TASK.maxRetries}
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
                <CodeDiff diff={CODE_DIFF} filename="src/discounts/discountService.js" />
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
