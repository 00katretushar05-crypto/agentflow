import { useState } from "react";
import { ChevronDown, Cpu, CheckCircle2, Loader2, AlertTriangle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent, AgentStatus } from "@/data/demo";

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
  ACTIVE: {
    label: "Active",
    color: "text-emerald-400",
    dot: "bg-emerald-400 animate-pulse",
    icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  },
  THINKING: {
    label: "Thinking",
    color: "text-indigo-400",
    dot: "bg-indigo-400 animate-pulse",
    icon: <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />,
  },
  IDLE: {
    label: "Idle",
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
  highlight?: boolean;
}

export function AgentCard({ agent, highlight = false }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[agent.status];

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
          "overflow-hidden transition-all duration-300",
          expanded ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.05] space-y-3">
          {/* Current Task */}
          <div>
            <p className="text-[9px] tracking-widest text-white/25 uppercase font-semibold mb-1">
              Current Task
            </p>
            <p className="text-[12px] text-white/60">
              {agent.currentTask ?? "No active task"}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[18px] font-bold text-white/80">{agent.tasksCompleted}</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide mt-0.5">Completed</p>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[18px] font-bold text-emerald-400">{agent.successRate}%</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide mt-0.5">Success</p>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
              <p className="text-[12px] font-semibold text-white/50">{agent.lastActive}</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide mt-0.5">Last Active</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
