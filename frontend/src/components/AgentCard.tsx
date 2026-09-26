import { useState } from "react";
import {
  ChevronDown,
  Cpu,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  MinusCircle,
  FileCode2,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent, AgentStatus, AgentRunStatus, AgentResult } from "@/data/demo";

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
  ACTIVE: {
    label: "Active",
    color: "text-emerald-400",
    dot: "bg-emerald-400 animate-pulse",
    icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  },
  THINKING: {
    label: "Running",
    color: "text-indigo-400",
    dot: "bg-indigo-400 animate-pulse",
    icon: <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />,
  },
  IDLE: {
    label: "Pending",
    color: "text-white/30",
    dot: "bg-white/20",
    icon: <MinusCircle className="w-3 h-3 text-white/30" />,
  },
  ERROR: {
    label: "Error",
    color: "text-red-400",
    dot: "bg-red-400 animate-pulse",
    icon: <AlertTriangle className="w-3 h-3 text-red-400" />,
  },
  DONE: {
    label: "Done",
    color: "text-sky-400",
    dot: "bg-sky-400",
    icon: <CheckCircle2 className="w-3 h-3 text-sky-400" />,
  },
};

interface AgentCardProps {
  agent: Agent;
  /** API agentStatus for this agent — drives loading/skeleton vs result content */
  agentRunStatus: AgentRunStatus;
  /** Full result from agentResults map — null when not yet completed */
  agentResult?: AgentResult | null;
  highlight?: boolean;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded bg-white/[0.06] animate-pulse", className)} />
  );
}

const RISK_COLOR: Record<string, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-amber-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-red-400",
};

export function AgentCard({ agent, agentRunStatus, agentResult, highlight = false }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[agent.status];
  const isPending = agentRunStatus === "PENDING";
  const isInProgress = agentRunStatus === "IN_PROGRESS";
  const isLoading = isPending || isInProgress;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-300 overflow-hidden",
        highlight
          ? "border-indigo-500/30 bg-indigo-500/[0.04] glow-indigo"
          : "border-white/[0.07] bg-[#111318]",
        expanded && "shadow-lg shadow-black/30"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
          highlight ? "bg-indigo-500/20" : "bg-white/[0.05]"
        )}>
          <Cpu className={cn("w-4 h-4", highlight ? "text-indigo-400" : "text-white/40")} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-white/90 truncate">{agent.name}</span>
            <span className="text-[10px] text-white/25 font-mono">{agent.model}</span>
          </div>
          <p className="text-[11px] text-white/35 mt-0.5">{agent.role}</p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
          <span className={cn("text-[11px] font-medium", cfg.color)}>{cfg.label}</span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-white/25 transition-transform duration-200 ml-1",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded Content */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          expanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.05] space-y-3">
          {isLoading ? (
            /* ── Skeleton state for PENDING / IN_PROGRESS agents ── */
            <LoadingSkeleton label={isPending ? "Waiting to start" : "In Progress…"} />
          ) : agentResult ? (
            /* ── Rich findings panel for DONE agents with results ── */
            <FindingsPanel result={agentResult} agent={agent} />
          ) : (
            /* ── Fallback: basic stats when no structured result ── */
            <BasicStats agent={agent} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-panels ────────────────────────────────────────────────────────────── */

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <>
      <div>
        <p className="text-[9px] tracking-widest text-white/25 uppercase font-semibold mb-2">
          {label}
        </p>
        <Skeleton className="h-3 w-3/4 mb-1.5" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((k) => (
          <div key={k} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
            <Skeleton className="h-5 w-8 mx-auto mb-1" />
            <Skeleton className="h-2 w-10 mx-auto" />
          </div>
        ))}
      </div>
    </>
  );
}

function FindingsPanel({ result, agent }: { result: AgentResult; agent: Agent }) {
  const riskCls = RISK_COLOR[result.findings.riskLevel] ?? "text-white/50";

  return (
    <>
      {/* Recommendation */}
      <div>
        <p className="text-[9px] tracking-widest text-white/25 uppercase font-semibold mb-1.5 flex items-center gap-1.5">
          <Sparkles className="w-2.5 h-2.5" />
          Recommendation
        </p>
        <p className="text-[12px] text-white/60 leading-relaxed">
          {result.findings.recommendation}
        </p>
      </div>

      {/* Affected files */}
      {result.findings.affectedFiles.length > 0 && (
        <div>
          <p className="text-[9px] tracking-widest text-white/25 uppercase font-semibold mb-1.5 flex items-center gap-1.5">
            <FileCode2 className="w-2.5 h-2.5" />
            Affected Files
          </p>
          <div className="space-y-1">
            {result.findings.affectedFiles.map((f) => (
              <p key={f} className="text-[11px] font-mono text-indigo-300/70 truncate">{f}</p>
            ))}
          </div>
        </div>
      )}

      {/* Affected functions */}
      {result.findings.affectedFunctions.length > 0 && (
        <div>
          <p className="text-[9px] tracking-widest text-white/25 uppercase font-semibold mb-1.5 flex items-center gap-1.5">
            <GitBranch className="w-2.5 h-2.5" />
            Affected Functions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.findings.affectedFunctions.map((fn) => (
              <span
                key={fn}
                className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.07] text-[10px] font-mono text-white/50"
              >
                {fn}()
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer row: risk + confidence + success rate */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <Chip label="Risk" value={result.findings.riskLevel} valueCls={riskCls} />
        <Chip label="Confidence" value={result.confidence} valueCls="text-sky-400" />
        <Chip label="Success Rate" value={`${agent.successRate}%`} valueCls="text-emerald-400" />
      </div>
    </>
  );
}

function BasicStats({ agent }: { agent: Agent }) {
  return (
    <>
      <div>
        <p className="text-[9px] tracking-widest text-white/25 uppercase font-semibold mb-1">
          Current Task
        </p>
        <p className="text-[12px] text-white/60">
          {agent.currentTask ?? "No active task"}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Chip label="Completed" value={String(agent.tasksCompleted)} valueCls="text-white/80" />
        <Chip label="Success" value={`${agent.successRate}%`} valueCls="text-emerald-400" />
        <Chip label="Last Active" value={agent.lastActive} valueCls="text-white/50" />
      </div>
    </>
  );
}

function Chip({ label, value, valueCls }: { label: string; value: string; valueCls: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
      <p className={cn("text-[14px] font-bold truncate", valueCls)}>{value}</p>
      <p className="text-[9px] text-white/25 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}
