import { cn } from "@/lib/utils";
import type { TaskStatus, RiskLevel } from "@/data/demo";

type BadgeVariant = TaskStatus | RiskLevel | "ACTIVE" | "IDLE" | "THINKING";

const BADGE_CONFIG: Record<BadgeVariant, { label: string; cls: string }> = {
  VERIFIED: { label: "VERIFIED", cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  RECOVERED: { label: "RECOVERED", cls: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  FAILED: { label: "FAILED", cls: "bg-red-500/10 text-red-400 border border-red-500/20" },
  IN_PROGRESS: { label: "IN PROGRESS", cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  PENDING: { label: "PENDING", cls: "bg-white/[0.05] text-white/40 border border-white/[0.08]" },
  LOW: { label: "LOW", cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" },
  MEDIUM: { label: "MEDIUM", cls: "bg-amber-500/10 text-amber-400 border border-amber-500/15" },
  HIGH: { label: "HIGH", cls: "bg-orange-500/10 text-orange-400 border border-orange-500/15" },
  CRITICAL: { label: "CRITICAL", cls: "bg-red-500/10 text-red-400 border border-red-500/15" },
  ACTIVE: { label: "ACTIVE", cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  IDLE: { label: "IDLE", cls: "bg-white/[0.05] text-white/35 border border-white/[0.07]" },
  THINKING: { label: "THINKING", cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ variant, className, dot = false }: StatusBadgeProps) {
  const cfg = BADGE_CONFIG[variant] ?? BADGE_CONFIG.PENDING;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide",
        cfg.cls,
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            variant === "ACTIVE" || variant === "VERIFIED" ? "bg-emerald-400 animate-pulse" :
            variant === "THINKING" || variant === "IN_PROGRESS" ? "bg-indigo-400 animate-pulse" :
            variant === "FAILED" || variant === "CRITICAL" ? "bg-red-400" :
            variant === "RECOVERED" || variant === "MEDIUM" || variant === "HIGH" ? "bg-amber-400" :
            "bg-white/30"
          )}
        />
      )}
      {cfg.label}
    </span>
  );
}
