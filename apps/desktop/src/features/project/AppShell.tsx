import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { normalizeProjectRoute, shouldPersistProjectRoute } from "@/lib/routes";
import { tauriApi } from "@/lib/tauri";
import { cn, formatRelativeTimestamp } from "@/lib/utils";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { useUiStore } from "@/store/uiStore";

type StoryDomain = "chapters" | "scenes" | "characters" | "suggestions";

const storyDomainTabs: Array<{
  domain: StoryDomain;
  to: "/chapters" | "/scenes" | "/characters" | "/suggestions";
  label: string;
  icon: typeof BookCopy;
}> = [
  { domain: "chapters", to: "/chapters", label: "Chapters", icon: BookCopy },
  { domain: "scenes", to: "/scenes", label: "Scenes", icon: Theater },
  { domain: "characters", to: "/characters", label: "Characters", icon: Users },
  { domain: "suggestions", to: "/suggestions", label: "Suggestions", icon: Sparkles },
];

const utilityNavigationItems = [
  { to: "/scratchpad", label: "Scratchpad", icon: MessageSquareText },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

function getStoryDomainFromPath(pathname: string): StoryDomain | null {
  if (pathname.startsWith("/chapters")) {
    return "chapters";
  }
  if (pathname.startsWith("/scenes")) {
    return "scenes";
  }
  if (pathname.startsWith("/characters")) {
    return "characters";
  }
  if (pathname.startsWith("/suggestions")) {
    return "suggestions";
  }
  return null;
}

function buildOrderedScenes(snapshot: ProjectSnapshot) {
  const chapterOrder = new Map(
    [...snapshot.chapters]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((chapter, index) => [chapter.id, index]),
  );

  return [...snapshot.scenes].sort((left, right) => {
    const leftChapterOrder =
      left.chapterId === null ? Number.MAX_SAFE_INTEGER : chapterOrder.get(left.chapterId) ?? 0;
    const rightChapterOrder =
      right.chapterId === null
        ? Number.MAX_SAFE_INTEGER
        : chapterOrder.get(right.chapterId) ?? 0;

    return (
      leftChapterOrder - rightChapterOrder ||
      left.orderIndex - right.orderIndex ||
      left.title.localeCompare(right.title)
    );
  });
}

export function AppShell({
  snapshot,
  children,
}: {
  snapshot: ProjectSnapshot | null;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location.pathname });
  const { refreshSnapshot, queueAnalysis, saveProjectState } = useProjectRuntime();
  const [searchText, setSearchText, queue, isAnalyzing, dequeueAnalysis, setIsAnalyzing] =
    useUiStore(useShallow((state) => [
      state.searchText,
      state.setSearchText,
      state.analysisQueue,
      state.isAnalyzing,
      state.dequeueAnalysis,
      state.setIsAnalyzing,
    ]));
  const [selectedChapterId, setSelectedChapterId, selectedCharacterId, setSelectedCharacterId] =
    useUiStore(useShallow((state) => [
      state.selectedChapterId,
      state.setSelectedChapterId,
      state.selectedCharacterId,
      state.setSelectedCharacterId,
    ]));
  const workerRef = useRef<Worker | null>(null);
  const [storyBrowserDomain, setStoryBrowserDomain] = useState<StoryDomain>("chapters");

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
    if (!snapshot || !workerRef.current || isAnalyzing || queue.length === 0) {
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

  useEffect(() => {
    const routeDomain = getStoryDomainFromPath(location);
    if (routeDomain) {
      setStoryBrowserDomain(routeDomain);
    }
  }, [location]);

  useEffect(() => {
    if (!snapshot || !shouldPersistProjectRoute(location)) {
      return;
    }

    const normalizedRoute = normalizeProjectRoute(location);
    if (snapshot.projectState.lastRoute === normalizedRoute) {
      return;
    }

    void saveProjectState({
      ...snapshot.projectState,
      lastRoute: normalizedRoute,
    }).catch(() => undefined);
  }, [location, saveProjectState, snapshot]);

  const chapters = snapshot
    ? [...snapshot.chapters].sort((a, b) => a.orderIndex - b.orderIndex)
    : [];
  const orderedScenes = snapshot ? buildOrderedScenes(snapshot) : [];
  const activeSceneId = location.startsWith("/scenes/") ? location.split("/")[2] ?? null : null;
  const activeChapterId =
    location.startsWith("/chapters/") ? location.split("/")[2] ?? selectedChapterId : selectedChapterId;
  const chapterSceneCounts = snapshot
    ? snapshot.scenes.reduce<Record<string, number>>((counts, scene) => {
        if (scene.chapterId) {
          counts[scene.chapterId] = (counts[scene.chapterId] ?? 0) + 1;
        }
        return counts;
      }, {})
    : {};
  const unassignedSceneCount = snapshot
    ? snapshot.scenes.filter((scene) => scene.chapterId === null).length
    : 0;
  const openSuggestionsCount = snapshot
    ? snapshot.suggestions.filter((suggestion) => suggestion.status === "open").length
    : 0;

  function renderStoryBrowser() {
    if (!snapshot) {
      return (
        <div className="rounded-2xl bg-white/6 px-4 py-5 text-sm text-white/65">
          Open a project to browse chapters, scenes, characters, and suggestions in
          story order.
        </div>
      );
    }

    if (storyBrowserDomain === "chapters") {
      return chapters.length > 0 ? (
        <div className="grid gap-2">
          {chapters.map((chapter) => {
            const isActive = location.startsWith(`/chapters/${chapter.id}`) || activeChapterId === chapter.id;
            return (
              <button
                key={chapter.id}
                className={cn(
                  "rounded-2xl px-4 py-3 text-left transition",
                  isActive
                    ? "bg-white text-[var(--ink)]"
                    : "bg-white/6 text-white/75 hover:bg-white/12 hover:text-white",
                )}
                onClick={() => {
                  setSelectedChapterId(chapter.id);
                  void navigate({
                    to: "/chapters/$chapterId",
                    params: { chapterId: chapter.id },
                  });
                }}
              >
                <p className="text-sm font-semibold">{chapter.title}</p>
                <p className="mt-1 text-xs opacity-75">
                  {chapterSceneCounts[chapter.id] ?? 0} scene
                  {(chapterSceneCounts[chapter.id] ?? 0) === 1 ? "" : "s"}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No chapters yet"
          description="Create the first chapter to start building the story spine."
        />
      );
    }

    if (storyBrowserDomain === "scenes") {
      return orderedScenes.length > 0 ? (
        <div className="grid gap-2">
          {orderedScenes.map((scene) => {
            const chapterTitle =
              snapshot.chapters.find((chapter) => chapter.id === scene.chapterId)?.title ??
              "Unassigned";
            const isActive = activeSceneId === scene.id;

            return (
              <button
                key={scene.id}
                className={cn(
                  "rounded-2xl px-4 py-3 text-left transition",
                  isActive
                    ? "bg-white text-[var(--ink)]"
                    : "bg-white/6 text-white/75 hover:bg-white/12 hover:text-white",
                )}
                onClick={() =>
                  void navigate({
                    to: "/scenes/$sceneId",
                    params: { sceneId: scene.id },
                  })
                }
              >
                <p className="text-sm font-semibold">{scene.title}</p>
                <p className="mt-1 text-xs opacity-75">{chapterTitle}</p>
              </button>
            );
          })}
          {unassignedSceneCount > 0 ? (
            <p className="px-2 text-xs uppercase tracking-[0.18em] text-white/45">
              {unassignedSceneCount} unassigned scene
              {unassignedSceneCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="No scenes yet"
          description="Add a scene and it will appear here in chapter order."
        />
      );
    }

    if (storyBrowserDomain === "characters") {
      return snapshot.characters.length > 0 ? (
        <div className="grid gap-2">
          {[...snapshot.characters]
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((character) => {
              const isActive =
                location.startsWith("/characters") && selectedCharacterId === character.id;

              return (
                <button
                  key={character.id}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-left transition",
                    isActive
                      ? "bg-white text-[var(--ink)]"
                      : "bg-white/6 text-white/75 hover:bg-white/12 hover:text-white",
                  )}
                  onClick={() => {
                    setSelectedCharacterId(character.id);
                    void navigate({ to: "/characters" });
                  }}
                >
                  <p className="text-sm font-semibold">{character.name}</p>
                  <p className="mt-1 text-xs opacity-75">
                    {character.role || "No role set yet"}
                  </p>
                </button>
              );
            })}
        </div>
      ) : (
        <EmptyState
          title="No characters yet"
          description="Character cards will collect here as the cast takes shape."
        />
      );
    }

    const orderedSuggestions = [...snapshot.suggestions].sort((left, right) =>
      left.status === right.status
        ? left.updatedAt.localeCompare(right.updatedAt)
        : left.status.localeCompare(right.status),
    );

    return orderedSuggestions.length > 0 ? (
      <div className="grid gap-2">
        {orderedSuggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            className="rounded-2xl bg-white/6 px-4 py-3 text-left text-white/75 transition hover:bg-white/12 hover:text-white"
            onClick={() => void navigate({ to: "/suggestions" })}
          >
            <p className="text-sm font-semibold">{suggestion.title}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] opacity-75">
              {suggestion.status}
            </p>
          </button>
        ))}
      </div>
    ) : (
      <EmptyState
        title="No suggestions yet"
        description="Continuity and structure signals will collect here after story changes."
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-4 text-[var(--ink)] md:px-6">
      <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 rounded-[2rem] border border-white/60 bg-[color:rgba(51,37,22,0.92)] p-5 text-white shadow-[0_30px_80px_rgba(30,18,9,0.3)]">
          <div className="rounded-3xl bg-white/8 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">
              Workspace
            </p>
            <h1 className="mt-3 text-2xl font-semibold">
              {snapshot ? snapshot.project.title : "NovelForge"}
            </h1>
            <p className="mt-2 text-sm text-white/70">
              {snapshot
                ? snapshot.project.logline ||
                  "Add a logline to sharpen the story spine."
                : "Local-first story workspace for chapters, scenes, characters, and structured revision support."}
            </p>
            {snapshot ? (
              <p className="mt-4 text-xs text-white/50">
                Last opened {formatRelativeTimestamp(snapshot.project.lastOpenedAt)}
              </p>
            ) : (
              <p className="mt-4 text-xs text-white/50">
                Use File to create or open a project.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="px-1 text-xs uppercase tracking-[0.18em] text-white/45">
              Story Browser
            </p>
            <div className="grid grid-cols-2 gap-2">
              {storyDomainTabs.map((item) => {
                const Icon = item.icon;
                const isActive = storyBrowserDomain === item.domain;
                return (
                  <button
                    key={item.to}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-white text-[var(--ink)]"
                        : "bg-white/6 text-white/75 hover:bg-white/10 hover:text-white",
                      !snapshot && "cursor-not-allowed opacity-60 hover:bg-white/6 hover:text-white/75",
                    )}
                    onClick={() => {
                      if (!snapshot) {
                        return;
                      }
                      setStoryBrowserDomain(item.domain);
                      void navigate({ to: item.to });
                    }}
                    disabled={!snapshot}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2">{renderStoryBrowser()}</div>
          </div>

          <nav className="mt-auto grid gap-2">
            {utilityNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location === item.to || location.startsWith(`${item.to}/`);
              const disabled = !snapshot && item.to !== "/settings";
              return (
                <button
                  key={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                    isActive
                      ? "bg-white text-[var(--ink)]"
                      : "bg-white/0 text-white/75 hover:bg-white/10 hover:text-white",
                    disabled &&
                      "cursor-not-allowed opacity-50 hover:bg-white/0 hover:text-white/75",
                  )}
                  onClick={() => {
                    if (disabled) {
                      return;
                    }
                    void navigate({ to: item.to });
                  }}
                  disabled={disabled}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {snapshot ? (
            <Panel className="bg-white/10 text-white shadow-none">
              <div className="flex items-center gap-3">
                <Activity className="size-4 text-[var(--sand)]" />
                <div>
                  <p className="text-sm font-semibold">Analysis engine</p>
                  <p className="text-xs text-white/65">
                    {isAnalyzing
                      ? "Reviewing recent story changes..."
                      : `${openSuggestionsCount} open suggestions`}
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}
        </aside>

        <div className="flex min-h-0 flex-col gap-4">
          <header className="grid gap-4 rounded-[2rem] border border-white/60 bg-[color:rgba(255,247,236,0.85)] p-5 shadow-[0_20px_50px_rgba(38,27,16,0.08)] backdrop-blur xl:grid-cols-[minmax(0,1fr)_auto]">
            {snapshot ? (
              <>
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
              </>
            ) : (
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-[var(--ink)]">
                  Structured Story Workspace
                </h2>
                <p className="max-w-2xl text-sm text-[var(--ink-muted)]">
                  Start from a local .novelforge file, then work in chapters,
                  scenes, characters, and suggestions without leaving the desktop
                  app.
                </p>
              </div>
            )}
          </header>

          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
