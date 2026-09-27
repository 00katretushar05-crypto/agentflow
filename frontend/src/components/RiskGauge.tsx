import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/data/demo";

const RISK_CONFIG: Record<RiskLevel, {
  label: string;
  value: number;
  color: string;
  bg: string;
  textClass: string;
}> = {
  LOW: { label: "LOW", value: 15, color: "#34d399", bg: "rgba(52,211,153,0.15)", textClass: "text-emerald-400" },
  MEDIUM: { label: "MEDIUM", value: 45, color: "#fbbf24", bg: "rgba(251,191,36,0.15)", textClass: "text-amber-400" },
  HIGH: { label: "HIGH", value: 72, color: "#f97316", bg: "rgba(249,115,22,0.15)", textClass: "text-orange-400" },
  CRITICAL: { label: "CRITICAL", value: 95, color: "#ef4444", bg: "rgba(239,68,68,0.15)", textClass: "text-red-400" },
};

/** Derive a color/label from a raw 0–100 percent value */
function configFromPercent(percent: number) {
  if (percent >= 85) return { ...RISK_CONFIG.CRITICAL, value: percent };
  if (percent >= 60) return { ...RISK_CONFIG.HIGH, value: percent };
  if (percent >= 35) return { ...RISK_CONFIG.MEDIUM, value: percent };
  return { ...RISK_CONFIG.LOW, value: percent };
}

/** Derive a color/label from a dependencyImpact string (e.g. "MEDIUM", "LOW") */
function configFromImpact(impact: string, percent?: number) {
  const level = (impact.toUpperCase() as RiskLevel) in RISK_CONFIG
    ? (impact.toUpperCase() as RiskLevel)
    : "MEDIUM";
  const base = RISK_CONFIG[level];
  return { ...base, value: percent ?? base.value };
}

interface RiskGaugeProps {
  /** Named risk level — mutually exclusive with riskPercent */
  level?: RiskLevel;
  /** Numeric 0–100 risk score from riskAssessment.riskPercent */
  riskPercent?: number;
  /** String impact label from riskAssessment.dependencyImpact */
  dependencyImpact?: string;
  showLabel?: boolean;
}

export function RiskGauge({ level, riskPercent, dependencyImpact, showLabel = true }: RiskGaugeProps) {
  let cfg: ReturnType<typeof configFromPercent>;

  if (riskPercent !== undefined) {
    cfg = configFromPercent(riskPercent);
    // If we also have a dependencyImpact, use its color palette but keep the numeric value
    if (dependencyImpact) {
      const impactCfg = configFromImpact(dependencyImpact, riskPercent);
      cfg = { ...impactCfg, value: riskPercent };
    }
  } else if (level) {
    cfg = RISK_CONFIG[level];
  } else {
    cfg = RISK_CONFIG.MEDIUM;
  }

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  // Only fill the bottom 75% arc (270deg arc from 135deg to 405deg)
  const arcRatio = 0.75;
  const arcLength = circumference * arcRatio;
  const fillLength = (cfg.value / 100) * arcLength;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-16 flex items-end justify-center overflow-hidden">
        <svg width="96" height="64" viewBox="0 0 96 64" className="absolute top-0 left-0">
          {/* Track */}
          <circle
            cx="48"
            cy="56"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="6"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform="rotate(135 48 56)"
          />
          {/* Fill */}
          <circle
            cx="48"
            cy="56"
            r={radius}
            fill="none"
            stroke={cfg.color}
            strokeWidth="6"
            strokeDasharray={`${fillLength} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform="rotate(135 48 56)"
            style={{ filter: `drop-shadow(0 0 4px ${cfg.color}80)` }}
          />
        </svg>
        <div className="relative z-10 text-center pb-0.5">
          <span className={cn("text-[22px] font-bold leading-none", cfg.textClass)}>
            {cfg.value}
          </span>
          <span className="text-[10px] text-white/25 block">/ 100</span>
        </div>
      </div>
      {showLabel && (
        <div
          className="px-3 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{ color: cfg.color, background: cfg.bg }}
        >
          {cfg.label} RISK
        </div>
      )}
    </div>
  );
}
