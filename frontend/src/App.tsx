import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { CommandCenter } from "@/pages/CommandCenter";
import { MissionControl } from "@/pages/MissionControl";
import { AgentNetwork } from "@/pages/AgentNetwork";
import { Evidence } from "@/pages/Evidence";
import { History } from "@/pages/History";

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    requestAnimationFrame(() => {
      el.style.transition = "opacity 200ms ease, transform 200ms ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  }, [location.pathname]);

  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-y-auto">
      {children}
    </div>
  );
}

function AppLayout() {
  return (
    <div className="dark flex h-screen overflow-hidden bg-[#0a0b0d]">
      <Sidebar />
      <div className="flex flex-col flex-1 ml-56 min-w-0">
        <TopBar />
        <PageTransition>
          <Routes>
            <Route path="/" element={<CommandCenter />} />
            <Route path="/mission/:taskId" element={<MissionControl />} />
            <Route path="/agents" element={<AgentNetwork />} />
            <Route path="/evidence/:taskId" element={<Evidence />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </PageTransition>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
