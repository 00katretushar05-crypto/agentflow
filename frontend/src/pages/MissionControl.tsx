import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileCode2,
  FlaskConical,
  AlertTriangle,
  Clock,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { AgentCard } from "@/components/AgentCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RiskGauge } from "@/components/RiskGauge";
import { CodeDiff } from "@/components/CodeDiff";
import { StatusBadge } from "@/components/StatusBadge";
import { AGENTS, ACTIVITY, TASKS, CODE_DIFF } from "@/data/demo";

export function MissionControl() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const task = TASKS.find((t) => t.id === taskId) ?? TASKS[0];
  const [activeTab, setActiveTab] = useState<"feed" | "diff">("feed");

  const agents = AGENTS.filter((a) => task.agents.includes(a.id));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] text-white/30">
            <span>Task</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-mono text-white/50">{task.id}</span>
          </div>
          <h1 className="text-xl font-bold text-white/90">{task.title}</h1>
          <p className="text-[13px] text-white/40 max-w-xl">{task.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge variant={task.status} dot />
          <button
            onClick={() => navigate(`/evidence/${task.id}`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all"
          >
            View Evidence
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Workflow Timeline */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-6">
        <h2 className="text-[10px] tracking-widest text-white/25 uppercase font-semibold mb-6">
          Workflow Progress
        </h2>
        <WorkflowTimeline currentStage={task.stage} />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Agents */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-[10px] tracking-widest text-white/25 uppercase font-semibold">
            Active Agents
          </h2>
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              highlight={agent.status === "ACTIVE" || agent.status === "THINKING"}
            />
          ))}
        </div>

        {/* Right: Stats + Feed */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<FileCode2 className="w-4 h-4 text-indigo-400" />}
              label="Files Changed"
              value={String(task.filesChanged)}
              color="indigo"
            />
            <StatCard
              icon={<FlaskConical className="w-4 h-4 text-cyan-400" />}
              label="Tests Run"
              value={String(task.testsRun)}
              color="cyan"
            />
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              label="Tests Passed"
              value={String(task.testsPassed)}
              color="emerald"
            />
            <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-4 flex flex-col items-center justify-center gap-1">
              <RiskGauge level={task.riskLevel} showLabel />
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
            <p className="text-[13px] text-white/60">
              {AGENTS[0].currentTask ?? "Monitoring agents…"}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Clock className="w-3.5 h-3.5 text-white/25" />
              <span className="text-[11px] text-white/30">Stage: {task.stage} · Risk: {task.riskLevel}</span>
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
                  {tab === "feed" ? "Activity Feed" : "Code Diff"}
                </button>
              ))}
            </div>
            <div className="p-3">
              {activeTab === "feed" ? (
                <ActivityFeed entries={ACTIVITY} maxHeight="260px" />
              ) : (
                <CodeDiff diff={CODE_DIFF} filename="src/middleware/auth.ts" />
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
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      <p className="text-[10px] text-white/30 uppercase tracking-wide">{label}</p>
    </div>
  );
}
