import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeDiffProps {
  diff: string;
  filename?: string;
}

function renderLine(line: string, i: number) {
  let cls = "text-white/40";
  let bg = "";
  let prefix = " ";

  if (line.startsWith("+++") || line.startsWith("---")) {
    cls = "text-white/25";
  } else if (line.startsWith("@@")) {
    cls = "text-cyan-400/70";
    bg = "bg-cyan-500/[0.06]";
  } else if (line.startsWith("+")) {
    cls = "text-emerald-300";
    bg = "bg-emerald-500/[0.08]";
    prefix = "+";
  } else if (line.startsWith("-")) {
    cls = "text-red-300";
    bg = "bg-red-500/[0.08]";
    prefix = "-";
  }

  return (
    <div
      key={i}
      className={cn("flex items-start gap-2 px-3 py-0.5 rounded-sm", bg)}
    >
      <span className="text-white/15 text-[10px] w-6 text-right shrink-0 select-none tabular-nums pt-0.5">
        {prefix === " " ? i + 1 : prefix}
      </span>
      <span className={cn("text-[11px] font-mono leading-relaxed break-all", cls)}>
        {line.slice(line.startsWith("@@") ? 0 : 1) || " "}
      </span>
    </div>
  );
}

export function CodeDiff({ diff, filename = "auth.ts" }: CodeDiffProps) {
  const [copied, setCopied] = useState(false);
  const lines = diff.split("\n");

  function handleCopy() {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d0f14] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-[#111318]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
          </div>
          <span className="text-[11px] text-white/30 font-mono ml-2">{filename}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[10px] text-white/25 hover:text-white/60 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.05]"
        >
          {copied ? (
            <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
          ) : (
            <><Copy className="w-3 h-3" /><span>Copy</span></>
          )}
        </button>
      </div>
      {/* Lines */}
      <div className="overflow-y-auto max-h-80 py-2">
        {lines.map((line, i) => renderLine(line, i))}
      </div>
    </div>
  );
}
