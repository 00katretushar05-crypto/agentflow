import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Cpu, GitBranch, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { MOCK_TASK, AGENT_META, toAgentStatus } from "@/data/demo";
import type { Agent, AgentStatus } from "@/data/demo";

// Node positions for the diagram (keyed by API agent ids)
const NODE_LAYOUT: Record<string, { x: number; y: number }> = {
  CODE_INTELLIGENCE: { x: 20, y: 58 },
  TEST_QA:           { x: 50, y: 58 },
  DEBUG_REVIEW:      { x: 80, y: 58 },
};

// Static supervisor node (not in agentStatus map)
const SUPERVISOR_NODE = { x: 50, y: 10 };

const AGENT_ICON: Record<string, React.ReactNode> = {
  SUPERVISOR:        <Zap className="w-5 h-5" />,
  CODE_INTELLIGENCE: <Cpu className="w-5 h-5" />,
  TEST_QA:           <Activity className="w-5 h-5" />,
  DEBUG_REVIEW:      <GitBranch className="w-5 h-5" />,
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  ACTIVE:   "#34d399",
  THINKING: "#818cf8",
  IDLE:     "rgba(255,255,255,0.15)",
  ERROR:    "#f87171",
  DONE:     "#38bdf8",
};

function ConnectionLine({
  from,
  to,
  active,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  active: boolean;
  color: string;
}) {
  return (
    <line
      x1={`${from.x}%`}
      y1={`${from.y + 3}%`}
      x2={`${to.x}%`}
      y2={`${to.y - 3}%`}
      stroke={active ? color : "rgba(255,255,255,0.07)"}
      strokeWidth={active ? 1.5 : 1}
      strokeDasharray={active ? "4 4" : "none"}
      opacity={active ? 1 : 0.5}
    >
      {active && (
        <animate
          attributeName="stroke-dashoffset"
          values="0;-16"
          dur="0.8s"
          repeatCount="indefinite"
        />
      )}
    </line>
  );
}

export function AgentNetwork() {
  const [selected, setSelected] = useState<string | null>("CODE_INTELLIGENCE");
  const navigate = useNavigate();

  // Build agent list from agentStatus map + AGENT_META
  const agents: Agent[] = Object.entries(MOCK_TASK.agentStatus).map(
    ([id, runStatus]) => ({
      ...AGENT_META[id],
      status: toAgentStatus(runStatus),
    })
  );

  const selectedAgent = agents.find((a) => a.id === selected);
  const activeCount = agents.filter((a) => a.status !== "IDLE" && a.status !== "DONE").length;

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
              {/* Connection lines from supervisor to each agent */}
              {agents.map((agent) => {
                const pos = NODE_LAYOUT[agent.id];
                if (!pos) return null;
                const isActive = agent.status === "ACTIVE" || agent.status === "THINKING";
                const color = STATUS_COLORS[agent.status];
                return (
                  <ConnectionLine
                    key={agent.id}
                    from={SUPERVISOR_NODE}
                    to={pos}
                    active={isActive}
                    color={color}
                  />
                );
              })}
            </svg>

            {/* Nodes as absolutely positioned elements */}
            {agents.map((agent) => {
              const pos = NODE_LAYOUT[agent.id];
              if (!pos) return null;
              const color = STATUS_COLORS[agent.status];
              const isActive = agent.status === "ACTIVE" || agent.status === "THINKING";

              return (
                <div
                  key={agent.id}
                  className="absolute flex flex-col items-center gap-2 cursor-pointer group"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  onClick={() => setSelected(agent.id)}
                >
                  {/* Ring */}
                  {isActive && (
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

                  {/* Node */}
                  <div
                    className={cn(
                      "relative w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-200",
                      selected === agent.id && "scale-110"
                    )}
                    style={{
                      borderColor: selected === agent.id ? color : `${color}60`,
                      backgroundColor:
                        selected === agent.id ? `${color}22` : "rgba(17,19,24,0.95)",
                      boxShadow:
                        isActive ? `0 0 16px ${color}40` : "none",
                    }}
                  >
                    <span style={{ color }}>{AGENT_ICON[agent.id]}</span>
                  </div>

                  {/* Label */}
                  <div className="text-center">
                    <p className="text-[11px] font-semibold text-white/80 whitespace-nowrap">
                      {agent.name}
                    </p>
                    <p className="text-[9px] text-white/30 whitespace-nowrap">{agent.model}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.05]">
            {(["THINKING", "IDLE", "DONE"] as const).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[s] }}
                />
                <span className="text-[10px] text-white/30">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Detail Panel */}
        <div className="lg:col-span-2 space-y-3">
          {selectedAgent ? (
            <>
              <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-[15px] font-bold text-white/90">{selectedAgent.name}</h3>
                    <p className="text-[12px] text-white/35 mt-0.5">{selectedAgent.role}</p>
                  </div>
                  <StatusBadge variant={selectedAgent.status as "ACTIVE" | "IDLE" | "THINKING"} dot />
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-[9px] tracking-widest text-white/20 uppercase mb-1">Model</p>
                    <p className="text-[12px] font-mono text-indigo-300">{selectedAgent.model}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-[9px] tracking-widest text-white/20 uppercase mb-1">Current Task</p>
                    <p className="text-[12px] text-white/55">
                      {selectedAgent.currentTask ?? "No active task"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
                    <p className="text-[18px] font-bold text-white/80">{selectedAgent.tasksCompleted}</p>
                    <p className="text-[9px] text-white/20 uppercase tracking-wide mt-0.5">Tasks</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
                    <p className="text-[18px] font-bold text-emerald-400">{selectedAgent.successRate}%</p>
                    <p className="text-[9px] text-white/20 uppercase tracking-wide mt-0.5">Success</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
                    <p className="text-[11px] font-semibold text-white/50">{selectedAgent.lastActive}</p>
                    <p className="text-[9px] text-white/20 uppercase tracking-wide mt-0.5">Active</p>
                  </div>
                </div>

                <button
                  onClick={() => navigate("/mission/AF-1024")}
                  className="w-full py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[12px] font-medium hover:bg-indigo-500/20 transition-colors"
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
                  { label: "Message Throughput", value: "142 msg/min", ok: true },
                  { label: "Avg Response Time",  value: "1.2s",        ok: true },
                  { label: "Context Sync",       value: "In sync",     ok: true },
                  { label: "Active Connections", value: `${activeCount} / ${agents.length}`, ok: true },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <span className="text-[11px] text-white/35">{stat.label}</span>
                    <span className={cn("text-[11px] font-mono", stat.ok ? "text-emerald-400" : "text-red-400")}>
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
          {agents.map((agent) => {
            const color = STATUS_COLORS[agent.status];
            return (
              <div
                key={agent.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => setSelected(agent.id)}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center border shrink-0"
                  style={{ borderColor: `${color}50`, backgroundColor: `${color}10` }}
                >
                  <span style={{ color }}>{AGENT_ICON[agent.id]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white/80">{agent.name}</p>
                  <p className="text-[11px] text-white/30 truncate">{agent.role}</p>
                </div>
                <p className="text-[11px] font-mono text-white/25 hidden sm:block">{agent.model}</p>
                <StatusBadge variant={agent.status as "ACTIVE" | "IDLE" | "THINKING"} dot />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
