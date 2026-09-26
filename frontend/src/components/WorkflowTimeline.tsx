import { Check, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStage } from "@/data/demo";
import { WORKFLOW_STAGES } from "@/data/demo";

type StageStatus = "done" | "active" | "pending";

interface WorkflowTimelineProps {
  currentStage: WorkflowStage;
}

function getStageStatus(stage: WorkflowStage, current: WorkflowStage): StageStatus {
  const currentIndex = WORKFLOW_STAGES.indexOf(current);
  const stageIndex = WORKFLOW_STAGES.indexOf(stage);
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "active";
  return "pending";
}

const STAGE_DESCRIPTIONS: Record<WorkflowStage, string> = {
  Planning: "Decomposing task and assigning agents",
  Analyzing: "Impact analysis and dependency mapping",
  Implementing: "Writing and modifying code",
  Testing: "Running test suites and validation",
  Verification: "Static analysis and risk assessment",
  Approval: "Human review and sign-off",
};

export function WorkflowTimeline({ currentStage }: WorkflowTimelineProps) {
  return (
    <div className="relative">
      <div className="flex items-start gap-0">
        {WORKFLOW_STAGES.map((stage, i) => {
          const status = getStageStatus(stage, currentStage);
          const isLast = i === WORKFLOW_STAGES.length - 1;

          return (
            <div key={stage} className="flex-1 flex flex-col items-center relative">
              {/* Connector line */}
              {!isLast && (
                <div className="absolute top-4 left-1/2 w-full h-[2px] z-0">
                  <div
                    className={cn(
                      "h-full transition-all duration-700",
                      status === "done" ? "bg-indigo-500" : "bg-white/[0.08]"
                    )}
                  />
                </div>
              )}

              {/* Node */}
              <div
                className={cn(
                  "relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                  status === "done" &&
                    "bg-indigo-500 border-indigo-500 shadow-lg shadow-indigo-500/30",
                  status === "active" &&
                    "bg-indigo-500/20 border-indigo-400 shadow-lg shadow-indigo-500/20",
                  status === "pending" && "bg-[#111318] border-white/[0.1]"
                )}
              >
                {status === "done" && <Check className="w-3.5 h-3.5 text-white" />}
                {status === "active" && (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                )}
                {status === "pending" && <Lock className="w-3 h-3 text-white/20" />}

                {status === "active" && (
                  <span className="absolute inset-0 rounded-full border-2 border-indigo-400 animate-ping opacity-40" />
                )}
              </div>

              {/* Label */}
              <div className="mt-3 text-center px-1">
                <p
                  className={cn(
                    "text-[11px] font-semibold transition-colors",
                    status === "done" && "text-indigo-300",
                    status === "active" && "text-white",
                    status === "pending" && "text-white/25"
                  )}
                >
                  {stage}
                </p>
                <p
                  className={cn(
                    "text-[9px] mt-0.5 leading-tight hidden sm:block transition-colors",
                    status === "active" ? "text-white/40" : "text-white/20"
                  )}
                >
                  {STAGE_DESCRIPTIONS[stage]}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
