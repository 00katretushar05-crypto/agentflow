import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@/data/demo";

const TYPE_CONFIG = {
  info: { dot: "bg-sky-500", text: "text-white/50" },
  success: { dot: "bg-emerald-500", text: "text-emerald-300/80" },
  warning: { dot: "bg-amber-400", text: "text-amber-300/80" },
  error: { dot: "bg-red-500", text: "text-red-300/80" },
  code: { dot: "bg-indigo-500", text: "text-indigo-300/80" },
};

const AGENT_COLOR: Record<string, string> = {
  Supervisor: "text-violet-400",
  "Code Agent": "text-indigo-400",
  "QA Agent": "text-cyan-400",
  "Debug Agent": "text-orange-400",
};

interface ActivityFeedProps {
  entries: ActivityEntry[];
  maxHeight?: string;
}

export function ActivityFeed({ entries, maxHeight = "300px" }: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div
      className="overflow-y-auto space-y-0 font-mono"
      style={{ maxHeight }}
    >
      {entries.map((entry, i) => {
        const cfg = TYPE_CONFIG[entry.type];
        const agentColor = AGENT_COLOR[entry.agent] ?? "text-white/40";
        const isLast = i === entries.length - 1;

        return (
          <div
            key={entry.id}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2 rounded-md transition-colors",
              isLast ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
            )}
          >
            {/* Timestamp */}
            <span className="text-[10px] text-white/20 shrink-0 pt-0.5 tabular-nums">
              {entry.timestamp}
            </span>

            {/* Dot */}
            <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", cfg.dot)} />

            {/* Agent */}
            <span className={cn("text-[11px] font-semibold shrink-0 pt-0.5", agentColor)}>
              [{entry.agent}]
            </span>

            {/* Message */}
            <span className={cn("text-[11px] leading-relaxed", cfg.text)}>
              {entry.message}
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
