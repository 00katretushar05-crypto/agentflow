import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@/data/demo";

const STATUS_CONFIG = {
  PASS: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    label: "PASS",
    labelClass: "text-emerald-400 bg-emerald-400/10",
    rowClass: "border-emerald-500/10",
  },
  FAIL: {
    icon: <XCircle className="w-4 h-4 text-red-400" />,
    label: "FAIL",
    labelClass: "text-red-400 bg-red-400/10",
    rowClass: "border-red-500/10",
  },
  IN_PROGRESS: {
    icon: <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />,
    label: "IN PROGRESS",
    labelClass: "text-amber-400 bg-amber-400/10",
    rowClass: "border-amber-500/10",
  },
  PENDING: {
    icon: <Clock className="w-4 h-4 text-white/25" />,
    label: "PENDING",
    labelClass: "text-white/25 bg-white/[0.05]",
    rowClass: "border-white/[0.04]",
  },
} as const;

const FALLBACK_STATUS_CONFIG = {
  icon: <Clock className="w-4 h-4 text-white/25" />,
  label: "UNKNOWN",
  labelClass: "text-white/25 bg-white/[0.05]",
  rowClass: "border-white/[0.04]",
};

interface EvidenceLedgerProps {
  items: EvidenceItem[];
}

export function EvidenceLedger({ items }: EvidenceLedgerProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const cfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? (() => {
          console.warn(`[EvidenceLedger] Unrecognized evidence status: "${item.status}"`);
          return FALLBACK_STATUS_CONFIG;
        })();
        const itemKey = `${item.label}-${i}`;
        const isOpen = expanded === itemKey;

        return (
          <div
            key={itemKey}
            className={cn(
              "rounded-xl border overflow-hidden transition-all duration-200",
              "bg-[#111318]",
              cfg.rowClass
            )}
          >
            <button
              onClick={() => item.detail != null ? setExpanded(isOpen ? null : itemKey) : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                item.detail != null ? "hover:bg-white/[0.02] cursor-pointer" : "cursor-default"
              )}
            >
              <FileText className="w-4 h-4 text-white/20 shrink-0" />
              <span className="flex-1 text-[13px] font-medium text-white/80">{item.label}</span>
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md", cfg.labelClass)}>
                {cfg.label}
              </span>
              {cfg.icon}
              {item.detail != null && (
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-white/20 transition-transform duration-200 ml-1",
                    isOpen && "rotate-180"
                  )}
                />
              )}
            </button>

            {item.detail != null && (
              <div
                className={cn(
                  "overflow-hidden transition-all duration-250",
                  isOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="px-4 pb-3 pt-2 border-t border-white/[0.04]">
                  <p className="text-[12px] text-white/45 leading-relaxed font-mono">
                    {item.detail}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
