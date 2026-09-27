import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Terminal, Zap, Shield, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLE_PROMPTS = [
  "Implement JWT authentication middleware for all /api/v2 routes",
  "Refactor the database connection pool to use pgPool with health checks",
  "Add rate limiting to public endpoints using a Redis sliding window",
  "Migrate the email service from SMTP to SendGrid with template support",
];

const FEATURES = [
  {
    icon: <Zap className="w-4 h-4" />,
    title: "Autonomous Execution",
    desc: "Multi-agent system plans, implements, tests, and verifies code changes end-to-end.",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
  },
  {
    icon: <Shield className="w-4 h-4" />,
    title: "Evidence-Driven",
    desc: "Every change produces a cryptographic audit trail: tests, diffs, risk scores.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    icon: <GitBranch className="w-4 h-4" />,
    title: "Human-in-the-Loop",
    desc: "Full visibility and approval gates at every critical decision point.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
];

export function CommandCenter() {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) return;
    setLoading(true);
    setTimeout(() => navigate("/mission/AF-1024"), 800);
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-grid pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center text-center gap-8">
        {/* Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/[0.07] text-indigo-300 text-[11px] font-semibold tracking-wide">
          <Sparkles className="w-3 h-3" />
          AUTONOMOUS SOFTWARE DEVELOPMENT SUPERVISOR
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            <span className="text-white">Meet </span>
            <span className="text-gradient-indigo">AgentFlow</span>
          </h1>
          <p className="mt-4 text-[15px] text-white/40 leading-relaxed max-w-lg mx-auto">
            Describe what needs to be built. AgentFlow orchestrates a team of AI agents to plan, implement, test, and verify your code — autonomously.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleStart} className="w-full space-y-3">
          <div className="relative">
            <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="What should we work on?"
              className={cn(
                "w-full bg-[#111318] border border-white/[0.09] rounded-xl pl-11 pr-4 py-4",
                "text-[14px] text-white/80 placeholder:text-white/20",
                "focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30",
                "transition-all duration-200"
              )}
            />
          </div>

          <button
            type="submit"
            disabled={!task.trim() || loading}
            className={cn(
              "w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-[13px] tracking-wide transition-all duration-200",
              task.trim() && !loading
                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 glow-indigo"
                : "bg-white/[0.05] text-white/25 cursor-not-allowed"
            )}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Initializing agents…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                START SUPERVISED TASK
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Example Prompts */}
        <div className="w-full">
          <p className="text-[10px] tracking-widest text-white/20 uppercase mb-3">Example tasks</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setTask(p)}
                className="text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all text-[11px] text-white/35 hover:text-white/60"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 w-full pt-4 border-t border-white/[0.05]">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col items-center text-center gap-2">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", f.bg, f.color)}>
                {f.icon}
              </div>
              <p className="text-[11px] font-semibold text-white/60">{f.title}</p>
              <p className="text-[10px] text-white/25 leading-relaxed hidden sm:block">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
