import { useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, Search } from "lucide-react";

const BREADCRUMBS: Record<string, string> = {
  "/": "Command Center",
  "/agents": "Agent Network",
  "/history": "Task History",
};

function getTitle(pathname: string) {
  if (BREADCRUMBS[pathname]) return BREADCRUMBS[pathname];
  if (pathname.startsWith("/mission/")) return "Mission Control";
  if (pathname.startsWith("/evidence/")) return "Evidence Ledger";
  return "AgentFlow";
}

function getSubtitle(pathname: string) {
  if (pathname === "/") return "Autonomous Software Development Supervisor";
  if (pathname.startsWith("/mission/")) return `Task · ${pathname.split("/").pop()}`;
  if (pathname.startsWith("/evidence/")) return `Task · ${pathname.split("/").pop()}`;
  if (pathname === "/agents") return "4 agents registered · 1 active";
  if (pathname === "/history") return "6 tasks completed";
  return "";
}

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = getTitle(location.pathname);
  const subtitle = getSubtitle(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-6 h-14 border-b border-white/[0.06] bg-[#0a0b0d]/80 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate("/")}
          className="text-white/30 hover:text-white/60 transition-colors text-[11px] tracking-wide uppercase font-medium"
        >
          AgentFlow
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-white/20" />
        <span className="text-white/70 text-[13px] font-medium">{title}</span>
        {subtitle && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-white/20" />
            <span className="text-white/30 text-[12px]">{subtitle}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-white/30 hover:text-white/60 hover:bg-white/[0.07] transition-all text-[12px]">
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-white/25">⌘K</kbd>
        </button>
        <button className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-white/[0.05] transition-colors text-white/30 hover:text-white/60">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[11px] font-bold text-white ml-1">
          E
        </div>
      </div>
    </header>
  );
}
