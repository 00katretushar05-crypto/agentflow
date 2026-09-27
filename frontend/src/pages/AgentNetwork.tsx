import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Cpu, GitBranch, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { AGENT_META } from "@/data/demo";
import type { AgentRunStatus, TaskDetail } from "@/data/demo";
import { getTasks, getTask } from "@/lib/api";

// ─── Layout ────────────────────────────────────────────────────────────────────

const NODE_LAYOUT: Record<string, { x: number; y: number }> = {
  CODE_INTELLIGENCE: { x: 20, y: 62 },
  TEST_QA:           { x: 50, y: 62 },
  DEBUG_REVIEW:      { x: 80, y: 62 },
};

const SUPERVISOR_NODE = { x: 50, y: 15 };

const AGENT_ICON: Record<string, React.ReactNode> = {
  SUPERVISOR:        <Zap className="w-5 h-5" />,
  CODE_INTELLIGENCE: <Cpu className="w-5 h-5" />,
  TEST_QA:           <Activity className="w-5 h-5" />,
  DEBUG_REVIEW:      <GitBranch className="w-5 h-5" />,
};

// ─── Status helpers ────────────────────────────────────────────────────────────

/** Terminal run statuses — once here the agent is done for this task */
const TERMINAL_STATUSES = new Set<AgentRunStatus>(["SUCCESS", "FAILURE", "PARTIAL", "SKIPPED"]);

function isTerminalStatus(s: AgentRunStatus | "RUNNING"): s is AgentRunStatus {
  return TERMINAL_STATUSES.has(s as AgentRunStatus);
}

/** Visual color for each agent run status */
const STATUS_COLOR: Record<AgentRunStatus | "RUNNING" | "IDLE", string> = {
  SUCCESS: "#34d399",  // green
  FAILURE: "#f87171",  // red
  PARTIAL: "#fbbf24",  // amber
  SKIPPED: "rgba(255,255,255,0.18)", // grey
  RUNNING: "#818cf8",  // indigo (actively running)
  IDLE:    "rgba(255,255,255,0.12)", // dim (no task)
};

// Resolve raw API status → display key
function resolveStatus(s: AgentRunStatus | undefined): AgentRunStatus | "RUNNING" | "IDLE" {
  if (!s) return "IDLE";
  if (TERMINAL_STATUSES.has(s)) return s;
  return "RUNNING";
}

// ─── SVG connection line ───────────────────────────────────────────────────────

function ConnectionLine({
  from,
  to,
  status,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  status: AgentRunStatus | "RUNNING" | "IDLE";
}) {
  const color = STATUS_COLOR[status];
  const isRunning = status === "RUNNING";
  const isTerminal = isTerminalStatus(status as AgentRunStatus | "RUNNING");

  // Dot position (midpoint, slightly toward agent end)
  const dotX = from.x + (to.x - from.x) * 0.72;
  const dotY = from.y + (to.y - from.y) * 0.72;

  return (
    <g>
      <line
        x1={`${from.x}%`}
        y1={`${from.y + 3}%`}
        x2={`${to.x}%`}
        y2={`${to.y - 3}%`}
        stroke={isRunning || isTerminal ? color : "rgba(255,255,255,0.07)"}
        strokeWidth={isRunning || isTerminal ? 1.5 : 1}
        strokeDasharray={isRunning ? "4 4" : "none"}
        opacity={isRunning || isTerminal ? 1 : 0.4}
      >
        {isRunning && (
          <animate
            attributeName="stroke-dashoffset"
            values="0;-16"
            dur="0.8s"
            repeatCount="indefinite"
          />
        )}
      </line>

      {/* Terminal status dot on the line */}
      {isTerminal && status !== "SKIPPED" && (
        <circle
          cx={`${dotX}%`}
          cy={`${dotY}%`}
          r="1.2"
          fill={color}
        />
      )}
    </g>
  );
}

// ─── Supervisor node (SVG overlay) ────────────────────────────────────────────

function SupervisorNode({ hasRunning }: { hasRunning: boolean }) {
  const color = "#818cf8";
  return (
    <g>
      {/* Ambient glow circle */}
      <circle
        cx={`${SUPERVISOR_NODE.x}%`}
        cy={`${SUPERVISOR_NODE.y}%`}
        r="4"
        fill={`${color}10`}
        stroke={`${color}40`}
        strokeWidth="0.5"
      />
      {hasRunning && (
        <circle
          cx={`${SUPERVISOR_NODE.x}%`}
          cy={`${SUPERVISOR_NODE.y}%`}
          r="5.5"
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          opacity="0.3"
        >
          <animate attributeName="r" values="4;6.5;4" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// ─── Agent node (DOM positioned) ──────────────────────────────────────────────

function AgentNode({
  agentId,
  status,
  selected,
  onClick,
}: {
  agentId: string;
  status: AgentRunStatus | "RUNNING" | "IDLE";
  selected: boolean;
  onClick: () => void;
}) {
  const meta = AGENT_META[agentId];
  const color = STATUS_COLOR[status];
  const pos = NODE_LAYOUT[agentId];
  const isRunning = status === "RUNNING";
  const isIdle = status === "IDLE";

  return (
    <div
      className="absolute flex flex-col items-center gap-2 cursor-pointer group"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: "translate(-50%, -50%)",
      }}
      onClick={onClick}
    >
      {/* Pulse ring — running agents */}
      {isRunning && (
        <div
          className="absolute rounded-full animate-ping opacity-20"
          style={{
            width: 64,
            height: 64,
            border: `2px solid ${color}`,
            top: -8,
            left: -8,
          }}
        />
      )}

      {/* Ambient glow ring — idle agents (calm, no pulse) */}
      {isIdle && (
        <div
          className="absolute rounded-full"
          style={{
            width: 56,
            height: 56,
            border: `1px solid rgba(255,255,255,0.06)`,
            top: -4,
            left: -4,
          }}
        />
      )}

      {/* Node circle */}
      <div
        className={cn(
          "relative w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-200",
          selected && "scale-110"
        )}
        style={{
          borderColor: selected ? color : `${color}55`,
          backgroundColor: selected ? `${color}1a` : "rgba(17,19,24,0.95)",
          boxShadow: isRunning
            ? `0 0 18px ${color}50`
            : !isIdle
            ? `0 0 8px ${color}30`
            : "none",
        }}
      >
        <span style={{ color }}>{AGENT_ICON[agentId]}</span>
      </div>

      {/* Label */}
      <div className="text-center">
        <p className="text-[11px] font-semibold text-white/80 whitespace-nowrap">{meta.name}</p>
        <p className="text-[9px] text-white/30 whitespace-nowrap">{meta.model}</p>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function AgentNetwork() {
  const [selected, setSelected] = useState<string | null>("CODE_INTELLIGENCE");
  const navigate = useNavigate();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll for the most recent task + its agent statuses
  useEffect(() => {
    let cancelled = false;

    async function fetchLatest() {
      try {
        const { tasks } = await getTasks();
        if (cancelled) return;
        if (!tasks.length) {
          setLoading(false);
          return;
        }
        // Most recent first (assumes tasks are sorted desc, or take max by updatedAt)
        const sorted = [...tasks].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        const summary = sorted[0];
        const detail = await getTask(summary.taskId);
        if (!cancelled) {
          setTask(detail);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLatest();
    const interval = setInterval(fetchLatest, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Build per-agent status map from the real agentStatus array
  const AGENT_IDS = ["CODE_INTELLIGENCE", "TEST_QA", "DEBUG_REVIEW"] as const;

  const agentStatusMap: Record<string, AgentRunStatus | "RUNNING" | "IDLE"> =
    Object.fromEntries(
      AGENT_IDS.map((id) => {
        const entry = task?.agentStatus?.find((e) => e.agent === id);
        return [id, resolveStatus(entry?.status as AgentRunStatus | undefined)];
      })
    );

  const selectedStatus = selected ? agentStatusMap[selected] : "IDLE";
  const selectedMeta = selected ? AGENT_META[selected] : null;

  // "Active" = an agent that is RUNNING right now
  const runningCount = AGENT_IDS.filter((id) => agentStatusMap[id] === "RUNNING").length;
  // "Connected" = any agent that has a non-idle status (has participated in the task)
  const connectedCount = AGENT_IDS.filter((id) => agentStatusMap[id] !== "IDLE").length;

  const hasRunning = runningCount > 0;

  // Supervisor node position for DOM label
  const supPos = SUPERVISOR_NODE;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white/90">Agent Network</h1>
        <p className="text-[13px] text-white/35 mt-1">
          Visual topology of active agents and their communication channels.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* SVG Diagram */}
        <div className="lg:col-span-3 rounded-xl border border-white/[0.07] bg-[#111318] p-6 relative">
          <div className="absolute inset-0 bg-grid rounded-xl opacity-40 pointer-events-none" />

          <div className="relative" style={{ height: "380px" }}>
            <svg
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="xMidYMid meet"
              viewBox="0 0 100 100"
            >
              {/* Supervisor ambient ring */}
              <SupervisorNode hasRunning={hasRunning} />

              {/* Connection lines from supervisor to each agent */}
              {AGENT_IDS.map((id) => {
                const pos = NODE_LAYOUT[id];
                return (
                  <ConnectionLine
                    key={id}
                    from={SUPERVISOR_NODE}
                    to={pos}
                    status={agentStatusMap[id]}
                  />
                );
              })}
            </svg>

            {/* Supervisor label (DOM) */}
            <div
              className="absolute flex flex-col items-center gap-1.5 pointer-events-none"
              style={{
                left: `${supPos.x}%`,
                top: `${supPos.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center border"
                style={{
                  borderColor: "rgba(129,140,248,0.4)",
                  backgroundColor: "rgba(129,140,248,0.08)",
                  boxShadow: hasRunning ? "0 0 14px rgba(129,140,248,0.35)" : "none",
                }}
              >
                <span style={{ color: "#818cf8" }}>
                  <Zap className="w-4 h-4" />
                </span>
              </div>
              <p className="text-[10px] font-semibold text-white/60 whitespace-nowrap">Supervisor</p>
            </div>

            {/* Agent nodes */}
            {AGENT_IDS.map((id) => (
              <AgentNode
                key={id}
                agentId={id}
                status={agentStatusMap[id]}
                selected={selected === id}
                onClick={() => setSelected(id)}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.05] flex-wrap">
            {(["SUCCESS", "FAILURE", "PARTIAL", "SKIPPED", "RUNNING"] as const).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[s] }}
                />
                <span className="text-[10px] text-white/30">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Detail Panel */}
        <div className="lg:col-span-2 space-y-3">
          {selectedMeta ? (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-[15px] font-bold text-white/90">{selectedMeta.name}</h3>
                    <p className="text-[12px] text-white/35 mt-0.5">{selectedMeta.role}</p>
                  </div>
                  <StatusBadge
                    variant={
                      selectedStatus === "RUNNING" || selectedStatus === "IDLE"
                        ? selectedStatus
                        : (selectedStatus as "SUCCESS" | "FAILURE" | "PARTIAL" | "SKIPPED")
                    }
                    dot
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-[9px] tracking-widest text-white/20 uppercase mb-1">Model</p>
                    <p className="text-[12px] font-mono text-indigo-300">{selectedMeta.model}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-[9px] tracking-widest text-white/20 uppercase mb-1">Current Task</p>
                    <p className="text-[12px] text-white/55">
                      {loading
                        ? "Loading…"
                        : task
                        ? task.goal
                        : "No active task"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
                    <p className="text-[18px] font-bold text-white/80">{selectedMeta.tasksCompleted}</p>
                    <p className="text-[9px] text-white/20 uppercase tracking-wide mt-0.5">Tasks</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
                    <p className="text-[18px] font-bold text-emerald-400">{selectedMeta.successRate}%</p>
                    <p className="text-[9px] text-white/20 uppercase tracking-wide mt-0.5">Success</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
                    <p className="text-[11px] font-semibold text-white/50">{selectedMeta.lastActive}</p>
                    <p className="text-[9px] text-white/20 uppercase tracking-wide mt-0.5">Active</p>
                  </div>
                </div>

                <button
                  onClick={() => task && navigate(`/mission/${task.taskId}`)}
                  disabled={!task}
                  className="w-full py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[12px] font-medium hover:bg-indigo-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  View Mission Control →
                </button>
              </div>

              {/* Network stats */}
              <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-4 space-y-2">
                <p className="text-[9px] tracking-widest text-white/20 uppercase font-semibold">
                  Network Health
                </p>
                {[
                  { label: "Message Throughput", value: "142 msg/min",                   ok: true },
                  { label: "Avg Response Time",  value: "1.2s",                          ok: true },
                  { label: "Context Sync",       value: "In sync",                       ok: true },
                  { label: "Active Connections", value: `${connectedCount} / ${AGENT_IDS.length}`, ok: connectedCount > 0 },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-[11px] text-white/35">{stat.label}</span>
                    <span className={cn("text-[11px] font-mono", stat.ok ? "text-emerald-400" : "text-white/30")}>
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-8 text-center text-white/25 text-[13px]">
              Select an agent node to inspect
            </div>
          )}
        </div>
      </div>

      {/* All agents list */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.05]">
          <p className="text-[10px] tracking-widest text-white/25 uppercase font-semibold">
            All Registered Agents
          </p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {AGENT_IDS.map((id) => {
            const meta = AGENT_META[id];
            const status = agentStatusMap[id];
            const color = STATUS_COLOR[status];
            return (
              <div
                key={id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => setSelected(id)}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center border shrink-0"
                  style={{ borderColor: `${color}50`, backgroundColor: `${color}10` }}
                >
                  <span style={{ color }}>{AGENT_ICON[id]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white/80">{meta.name}</p>
                  <p className="text-[11px] text-white/30 truncate">{meta.role}</p>
                </div>
                <p className="text-[11px] font-mono text-white/25 hidden sm:block">{meta.model}</p>
                <StatusBadge
                  variant={
                    status === "RUNNING" || status === "IDLE"
                      ? status
                      : (status as "SUCCESS" | "FAILURE" | "PARTIAL" | "SKIPPED")
                  }
                  dot
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
