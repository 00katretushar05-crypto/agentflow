import {
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  Cpu,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvidenceLedger as EvidenceLedgerData, EvidenceLogItem } from "@/data/demo";

// ─── Verification Checklist ────────────────────────────────────────────────────
// Derived from the evidence endpoint's `ledger` object (GET /api/task/:id/evidence)

interface CheckRow {
  label: string;
  passed: boolean;
  detail?: string;
}

function VerificationRow({ label, passed, detail }: CheckRow) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border",
        passed
          ? "border-emerald-500/15 bg-emerald-500/[0.04]"
          : "border-red-500/15 bg-red-500/[0.04]"
      )}
    >
      {passed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
      )}
      <span className="flex-1 text-[13px] font-medium text-white/80">{label}</span>
      {detail !== undefined && (
        <span
          className={cn(
            "text-[12px] font-semibold tabular-nums",
            passed ? "text-emerald-400" : "text-red-400"
          )}
        >
          {detail}
        </span>
      )}
      <span
        className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-md",
          passed
            ? "text-emerald-400 bg-emerald-400/10"
            : "text-red-400 bg-red-400/10"
        )}
      >
        {passed ? "PASS" : "FAIL"}
      </span>
    </div>
  );
}

interface VerificationChecklistProps {
  ledger: EvidenceLedgerData;
}

export function VerificationChecklist({ ledger }: VerificationChecklistProps) {
  const rows: CheckRow[] = [
    { label: "Requirement Confirmed", passed: ledger.requirementConfirmed },
    { label: "Impact Analysis Done", passed: ledger.impactAnalysisDone },
    {
      label: "Tests Executed",
      passed: ledger.testsExecuted > 0,
      detail: String(ledger.testsExecuted),
    },
    {
      label: "Tests Passed",
      passed: ledger.testsExecuted > 0 && ledger.testsPassed === ledger.testsExecuted,
      detail: `${ledger.testsPassed}/${ledger.testsExecuted}`,
    },
    { label: "Regression Clear", passed: ledger.regressionPassed },
    { label: "Code Reviewed", passed: ledger.codeReviewStatus === "DONE" },
    {
      label: "Human Approval",
      passed: ledger.humanApprovalStatus === "APPROVED",
      detail: ledger.humanApprovalStatus,
    },
  ];

  const passCount = rows.filter((r) => r.passed).length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] tracking-widest text-white/25 uppercase font-semibold">
          Verification Checklist
        </p>
        <span className="text-[11px] text-white/40">
          <span className="text-emerald-400 font-semibold">{passCount}</span>
          <span className="text-white/25">/{rows.length} passed</span>
        </span>
      </div>
      {rows.map((row) => (
        <VerificationRow key={row.label} {...row} />
      ))}
    </div>
  );
}

// ─── Evidence Log ──────────────────────────────────────────────────────────────

const LOG_ITEM_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  TRANSITION: {
    icon: <ArrowLeftRight className="w-3.5 h-3.5" />,
    color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
  },
  AGENT_RESULT: {
    icon: <Cpu className="w-3.5 h-3.5" />,
    color: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  },
};

const FALLBACK_LOG_CONFIG = {
  icon: <HelpCircle className="w-3.5 h-3.5" />,
  color: "text-white/30 bg-white/[0.05] border-white/[0.08]",
};

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

interface EvidenceLogProps {
  items: EvidenceLogItem[];
}

export function EvidenceLog({ items }: EvidenceLogProps) {
  if (items.length === 0) {
    return (
      <p className="text-[12px] text-white/25 italic">No evidence items yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const cfg = LOG_ITEM_CONFIG[item.type] ?? FALLBACK_LOG_CONFIG;
        return (
          <div
            key={item.seq}
            className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-[#111318]"
          >
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 mt-0.5",
                cfg.color
              )}
            >
              {cfg.icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white/70 leading-relaxed">{item.summary}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-white/25 font-mono">
                  {formatTimestamp(item.timestamp)}
                </span>
                <span className="text-[10px] text-white/20">·</span>
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-wide",
                    item.type === "TRANSITION" ? "text-indigo-400/70" :
                    item.type === "AGENT_RESULT" ? "text-sky-400/70" :
                    "text-white/25"
                  )}
                >
                  {item.type.replace("_", " ")}
                </span>
              </div>
            </div>

            <span className="text-[10px] text-white/20 font-mono shrink-0 mt-1">
              #{item.seq}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Combined EvidenceLedger ───────────────────────────────────────────────────

interface EvidenceLedgerProps {
  ledger: EvidenceLedgerData | null;
  logItems: EvidenceLogItem[];
}

export function EvidenceLedger({ ledger, logItems }: EvidenceLedgerProps) {
  return (
    <div className="space-y-8">
      {ledger ? (
        <VerificationChecklist ledger={ledger} />
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] tracking-widest text-white/25 uppercase font-semibold mb-3">
            Verification Checklist
          </p>
          <p className="text-[12px] text-white/25 italic">
            Verification results will appear here once the task reaches the VERIFYING stage.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] tracking-widest text-white/25 uppercase font-semibold">
            Evidence Log
          </p>
          <span className="text-[11px] text-white/25">{logItems.length} entries</span>
        </div>
        <EvidenceLog items={logItems} />
      </div>
    </div>
  );
}