import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookCopy,
  MessageSquareText,
  Search,
  Settings2,
  Sparkles,
  Theater,
  Users,
} from "lucide-react";
import type { DomainEvent, ProjectSnapshot, Suggestion } from "@novelforge/domain";
import { useShallow } from "zustand/react/shallow";
import { Button, EmptyState, Input, Panel } from "@/components/ui";
import { tauriApi } from "@/lib/tauri";
import { cn, formatRelativeTimestamp } from "@/lib/utils";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { useUiStore } from "@/store/uiStore";

const navigationItems = [
  { to: "/chapters", label: "Chapters", icon: BookCopy },
  { to: "/scenes", label: "Scenes", icon: Theater },
  { to: "/characters", label: "Characters", icon: Users },
  { to: "/suggestions", label: "Suggestions", icon: Sparkles },
  { to: "/scratchpad", label: "Scratchpad", icon: MessageSquareText },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({
  snapshot,
  children,
}: {
  snapshot: ProjectSnapshot;
  children: React.ReactNode;
}) {
  const location = useRouterState({ select: (state) => state.location.pathname });
  const { refreshSnapshot, queueAnalysis } = useProjectRuntime();
  const [searchText, setSearchText, queue, isAnalyzing, dequeueAnalysis, setIsAnalyzing] =
    useUiStore(useShallow((state) => [
      state.searchText,
      state.setSearchText,
      state.analysisQueue,
      state.isAnalyzing,
      state.dequeueAnalysis,
      state.setIsAnalyzing,
    ]));
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/analysis.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!workerRef.current || isAnalyzing || queue.length === 0) {
      return;
    }

    const currentEvent = queue[0];
    setIsAnalyzing(true);

    const handleMessage = async (
      message: MessageEvent<{ event: DomainEvent; suggestions: Suggestion[] }>,
    ) => {
      try {
        await tauriApi.syncSuggestions({
          projectId: snapshot.project.id,
          triggerEvent: message.data.event.type,
          suggestions: message.data.suggestions,
        });
        await refreshSnapshot();
      } finally {
        dequeueAnalysis();
        setIsAnalyzing(false);
      }
    };

    workerRef.current.addEventListener("message", handleMessage, { once: true });
    workerRef.current.postMessage({
      event: currentEvent,
      snapshot,
    });

    return () => {
      workerRef.current?.removeEventListener("message", handleMessage);
    };
  }, [
    dequeueAnalysis,
    isAnalyzing,
    queue,
    refreshSnapshot,
    setIsAnalyzing,
    snapshot,
  ]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-4 text-[var(--ink)] md:px-6">
      <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/60 bg-[color:rgba(51,37,22,0.92)] p-5 text-white shadow-[0_30px_80px_rgba(30,18,9,0.3)]">
          <div className="rounded-3xl bg-white/8 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">
              Project
            </p>
            <h1 className="mt-3 text-2xl font-semibold">{snapshot.project.title}</h1>
            <p className="mt-2 text-sm text-white/70">{snapshot.project.logline || "Add a logline to sharpen the story spine."}</p>
            <p className="mt-4 text-xs text-white/50">
              Last opened {formatRelativeTimestamp(snapshot.project.lastOpenedAt)}
            </p>
          </div>

          <nav className="grid gap-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location === item.to || location.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                    isActive
                      ? "bg-white text-[var(--ink)]"
                      : "bg-white/0 text-white/75 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Panel className="mt-auto bg-white/10 text-white shadow-none">
            <div className="flex items-center gap-3">
              <Activity className="size-4 text-[var(--sand)]" />
              <div>
                <p className="text-sm font-semibold">Analysis engine</p>
                <p className="text-xs text-white/65">
                  {isAnalyzing
                    ? "Reviewing recent story changes..."
                    : `${snapshot.suggestions.filter((suggestion) => suggestion.status === "open").length} open suggestions`}
                </p>
              </div>
            </div>
          </Panel>
        </aside>

        <div className="flex min-h-0 flex-col gap-4">
          <header className="grid gap-4 rounded-[2rem] border border-white/60 bg-[color:rgba(255,247,236,0.85)] p-5 shadow-[0_20px_50px_rgba(38,27,16,0.08)] backdrop-blur xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-4 py-3">
              <Search className="size-4 text-[var(--ink-faint)]" />
              <Input
                className="border-none bg-transparent px-0 py-0 ring-0 focus:border-none focus:ring-0"
                placeholder="Quick filter chapters, scenes, and characters"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={() =>
                  queueAnalysis({
                    id: crypto.randomUUID(),
                    projectId: snapshot.project.id,
                    occurredAt: new Date().toISOString(),
                    type: "analysis.manualRequested",
                  }).catch(() => undefined)
                }
              >
                Run Full Scan
              </Button>
            </div>
          </header>

          <main className="min-h-0 flex-1">
            {snapshot ? children : (
              <EmptyState
                title="No project loaded"
                description="Open or create a project to start structuring the novel."
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
