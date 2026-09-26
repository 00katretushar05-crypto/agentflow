import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ActivityEntry, HistoryEntry } from "@/data/demo";

const TYPE_CONFIG = {
  info:    { dot: "bg-sky-500",     text: "text-white/50",       bar: "bg-sky-500/30" },
  success: { dot: "bg-emerald-500", text: "text-emerald-300/80", bar: "bg-emerald-500/30" },
  warning: { dot: "bg-amber-400",   text: "text-amber-300/80",   bar: "bg-amber-400/30" },
  error:   { dot: "bg-red-500",     text: "text-red-300/80",     bar: "bg-red-500/30" },
  code:    { dot: "bg-indigo-500",  text: "text-indigo-300/80",  bar: "bg-indigo-500/30" },
};

const AGENT_COLOR: Record<string, string> = {
  Supervisor:        "text-violet-400",
  "Code Agent":      "text-indigo-400",
  "QA Agent":        "text-cyan-400",
  "Debug Agent":     "text-orange-400",
  CODE_INTELLIGENCE: "text-indigo-400",
  TEST_QA:           "text-cyan-400",
  DEBUG_REVIEW:      "text-orange-400",
};

/** Map a SupervisorState "to" value → ActivityEntry type */
function stateToType(to: string): ActivityEntry["type"] {
  if (to === "FAILED")                       return "error";
  if (to === "VERIFIED")                     return "success";
  if (to === "RECOVERING" || to === "RETESTING") return "warning";
  if (to === "IMPLEMENTING")                 return "code";
  return "info";
}

/** Convert the API history array (sorted by timestamp) into ActivityEntry rows */
export function historyToActivityEntries(history: HistoryEntry[]): ActivityEntry[] {
  const sorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return sorted.map((h, i) => ({
    id: `h-${i}`,
    timestamp: new Date(h.timestamp).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    agent: "Supervisor",
    type: stateToType(h.to),
    // Rich message: the state transition badge + reason
    message: h.reason,
    // Store the raw transition for rendering
    from: h.from,
    to: h.to,
  }));
}

// Extend ActivityEntry with optional transition fields for richer display
export type RichActivityEntry = ActivityEntry & { from?: string; to?: string };

interface ActivityFeedProps {
  entries: RichActivityEntry[];
  maxHeight?: string;
}

export function ActivityFeed({ entries, maxHeight = "300px" }: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const prevLenRef = useRef(entries.length);

  // Auto-scroll + flash newest entry
  useEffect(() => {
    if (entries.length > prevLenRef.current) {
      const latest = entries[entries.length - 1];
      setNewId(latest.id);
      const t = setTimeout(() => setNewId(null), 1200);
      prevLenRef.current = entries.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return () => clearTimeout(t);
    }
    prevLenRef.current = entries.length;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-white/20 font-mono"
        style={{ minHeight: "80px" }}
      >
        No activity yet…
      </div>
    );
  }

  return (
    <div className="overflow-y-auto space-y-0 font-mono" style={{ maxHeight }}>
      {entries.map((entry, i) => {
        const cfg = TYPE_CONFIG[entry.type];
        const agentColor = AGENT_COLOR[entry.agent] ?? "text-white/40";
        const isLast = i === entries.length - 1;
        const isNew = entry.id === newId;

        return (
          <div
            key={entry.id}
            className={cn(
              "relative flex items-start gap-2.5 px-3 py-2 rounded-md transition-all duration-500",
              isNew
                ? "bg-white/[0.055]"
                : isLast
                ? "bg-white/[0.025]"
                : "hover:bg-white/[0.018]"
            )}
          >
            {/* Left accent bar for new entry */}
            {isNew && (
              <span
                className={cn(
                  "absolute left-0 top-1 bottom-1 w-[2px] rounded-full transition-opacity duration-700",
                  cfg.bar
                )}
              />
            )}

            {/* Timestamp */}
            <span className="text-[10px] text-white/20 shrink-0 pt-0.5 tabular-nums">
              {entry.timestamp}
            </span>

            {/* Dot */}
            <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", cfg.dot)} />

            {/* Agent tag */}
            <span className={cn("text-[11px] font-semibold shrink-0 pt-0.5", agentColor)}>
              [{entry.agent}]
            </span>

            {/* State transition badge + message */}
            <span className="flex-1 min-w-0">
              {entry.from && entry.to && (
                <span className="inline-flex items-center gap-1 mr-1.5 align-middle">
                  <span className="px-1 py-0 rounded text-[9px] font-bold bg-white/[0.06] text-white/35 font-mono leading-tight">
                    {entry.from}
                  </span>
                  <span className="text-white/20 text-[9px]">→</span>
                  <span
                    className={cn(
                      "px-1 py-0 rounded text-[9px] font-bold font-mono leading-tight",
                      entry.type === "success" && "bg-emerald-500/15 text-emerald-300/80",
                      entry.type === "error"   && "bg-red-500/15 text-red-300/80",
                      entry.type === "warning" && "bg-amber-400/15 text-amber-300/80",
                      entry.type === "code"    && "bg-indigo-500/15 text-indigo-300/80",
                      entry.type === "info"    && "bg-sky-500/15 text-sky-300/80"
                    )}
                  >
                    {entry.to}
                  </span>
                </span>
              )}
              <span className={cn("text-[11px] leading-relaxed", cfg.text)}>
                {entry.message}
              </span>
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
