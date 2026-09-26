import { cn } from "@/lib/utils";
import type { SupervisorState, RiskLevel } from "@/data/demo";

type BadgeVariant = SupervisorState | RiskLevel | "ACTIVE" | "IDLE" | "THINKING";

const BADGE_CONFIG: Record<BadgeVariant, { label: string; cls: string }> = {
  // SupervisorState values
  RECEIVED:          { label: "RECEIVED",          cls: "bg-white/[0.05] text-white/40 border border-white/[0.08]" },
  PLANNING:          { label: "PLANNING",           cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  ANALYZING:         { label: "ANALYZING",          cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  IMPLEMENTING:      { label: "IMPLEMENTING",       cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  TESTING:           { label: "TESTING",            cls: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  FAILED:            { label: "FAILED",             cls: "bg-red-500/10 text-red-400 border border-red-500/20" },
  RECOVERING:        { label: "RECOVERING",         cls: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  RETESTING:         { label: "RETESTING",          cls: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  VERIFYING:         { label: "VERIFYING",          cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  AWAITING_APPROVAL: { label: "AWAITING APPROVAL",  cls: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" },
  VERIFIED:          { label: "VERIFIED",           cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  // Risk levels
  LOW:      { label: "LOW",      cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" },
  MEDIUM:   { label: "MEDIUM",   cls: "bg-amber-500/10 text-amber-400 border border-amber-500/15" },
  HIGH:     { label: "HIGH",     cls: "bg-orange-500/10 text-orange-400 border border-orange-500/15" },
  CRITICAL: { label: "CRITICAL", cls: "bg-red-500/10 text-red-400 border border-red-500/15" },
  // Agent UI states
  ACTIVE:   { label: "ACTIVE",   cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  IDLE:     { label: "IDLE",     cls: "bg-white/[0.05] text-white/35 border border-white/[0.07]" },
  THINKING: { label: "THINKING", cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export function StatusBadge({ variant, className, dot = false }: StatusBadgeProps) {
  const cfg = BADGE_CONFIG[variant] ?? BADGE_CONFIG.RECEIVED;

  const dotColor =
    variant === "ACTIVE" || variant === "VERIFIED"
      ? "bg-emerald-400 animate-pulse"
      : variant === "THINKING" || variant === "PLANNING" || variant === "ANALYZING" ||
        variant === "IMPLEMENTING" || variant === "VERIFYING" || variant === "AWAITING_APPROVAL"
      ? "bg-indigo-400 animate-pulse"
      : variant === "TESTING" || variant === "RECOVERING" || variant === "RETESTING"
      ? "bg-amber-400 animate-pulse"
      : variant === "FAILED" || variant === "CRITICAL"
      ? "bg-red-400"
      : variant === "MEDIUM" || variant === "HIGH"
      ? "bg-amber-400"
      : "bg-white/30";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide",
        cfg.cls,
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />}
      {cfg.label}
    </span>
  );
}
