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

interface RiskGaugeProps {
  level: RiskLevel;
  showLabel?: boolean;
}

export function RiskGauge({ level, showLabel = true }: RiskGaugeProps) {
  const cfg = RISK_CONFIG[level];
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
