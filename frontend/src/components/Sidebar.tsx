import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Terminal,
  Activity,
  Network,
  ClipboardCheck,
  History,
  Zap,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTasks } from "@/lib/api";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const [latestTaskId, setLatestTaskId] = useState<string | null>(null);

  // Fetch tasks once on mount so we can derive the latest task ID.
  // Silently ignores errors — the sidebar just shows items as disabled.
  useEffect(() => {
    getTasks()
      .then((res) => {
        const latest = res.tasks[0] ?? null;
        setLatestTaskId(latest?.taskId ?? null);
      })
      .catch(() => {
        // Backend unavailable or empty — leave latestTaskId null (items stay disabled)
      });
  }, []);

  type NavItem =
    | { type: "link"; to: string; label: string; icon: React.ElementType; exact?: boolean }
    | { type: "dynamic"; key: string; label: string; icon: React.ElementType; basePath: string };

  const NAV_ITEMS: NavItem[] = [
    { type: "link", to: "/", label: "Command Center", icon: Terminal, exact: true },
    { type: "dynamic", key: "mission", label: "Mission Control", icon: Activity, basePath: "mission" },
    { type: "link", to: "/agents", label: "Agent Network", icon: Network },
    { type: "dynamic", key: "evidence", label: "Evidence Ledger", icon: ClipboardCheck, basePath: "evidence" },
    { type: "link", to: "/history", label: "Task History", icon: History },
  ];

  function isActivePath(to: string, exact?: boolean) {
    return exact
      ? location.pathname === to
      : location.pathname.startsWith(`/${to.split("/")[1] || ""}`);
  }

  function isDynamicActive(basePath: string) {
    return location.pathname.startsWith(`/${basePath}`);
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col border-r border-white/[0.06] bg-[#0d0f14] z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/[0.06]">
        <div className="relative flex items-center justify-center w-7 h-7">
          <div className="absolute inset-0 rounded-md bg-indigo-500/20" />
          <Zap className="w-4 h-4 text-indigo-400 relative z-10" />
        </div>
        <div>
          <span className="text-[11px] font-bold tracking-[0.15em] text-white uppercase">
            AgentFlow
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <Circle className="w-1.5 h-1.5 fill-emerald-400 text-emerald-400 animate-pulse" />
            <span className="text-[9px] tracking-wider text-emerald-400/80 uppercase font-medium">
              System Active
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-3 text-[9px] tracking-[0.15em] text-white/25 uppercase font-semibold">
          Navigation
        </p>
        {NAV_ITEMS.map((item) => {
          if (item.type === "link") {
            const isActive = isActivePath(item.to, item.exact);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-150 group relative",
                  isActive
                    ? "bg-indigo-500/10 text-indigo-300"
                    : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-full" />
                )}
                <item.icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive ? "text-indigo-400" : "text-white/30 group-hover:text-white/50"
                  )}
                />
                {item.label}
              </NavLink>
            );
          }

          // Dynamic item — enabled only when a task exists
          if (!latestTaskId) {
            return (
              <div
                key={item.key}
                title="No active task"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium text-white/20 cursor-not-allowed select-none"
              >
                <item.icon className="w-4 h-4 shrink-0 text-white/15" />
                <span>{item.label}</span>
                <span className="ml-auto text-[9px] text-white/20 uppercase tracking-wide">No task</span>
              </div>
            );
          }

          const to = `/${item.basePath}/${latestTaskId}`;
          const isActive = isDynamicActive(item.basePath);
          return (
            <button
              key={item.key}
              onClick={() => navigate(to)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-150 group relative text-left",
                isActive
                  ? "bg-indigo-500/10 text-indigo-300"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-full" />
              )}
              <item.icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-indigo-400" : "text-white/30 group-hover:text-white/50"
                )}
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
            E
          </div>
          <div>
            <p className="text-[11px] font-medium text-white/70">Engineer</p>
            <p className="text-[9px] text-white/30">Supervisor Mode</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
