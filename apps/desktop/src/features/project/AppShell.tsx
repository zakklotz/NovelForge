import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookCopy,
  ListOrdered,
  MessageSquareText,
  Search,
  Settings2,
  Sparkles,
  Theater,
  Users,
} from "lucide-react";
import type { DomainEvent, ProjectSnapshot, Suggestion } from "@novelforge/domain";
import { useShallow } from "zustand/react/shallow";
import { Button, EmptyState, Input, ListRow, Panel, TabButton } from "@/components/ui";
import { normalizeProjectRoute, shouldPersistProjectRoute } from "@/lib/routes";
import { tauriApi } from "@/lib/tauri";
import { cn, formatRelativeTimestamp } from "@/lib/utils";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { useUiStore } from "@/store/uiStore";
import { SceneWorkspaceLeavePrompt } from "./SceneWorkspaceLeavePrompt";

type StoryDomain = "story" | "chapters" | "scenes" | "characters" | "suggestions";

const storyDomainTabs: Array<{
  domain: StoryDomain;
  to: "/story" | "/chapters" | "/scenes" | "/characters" | "/suggestions";
  label: string;
  icon: typeof BookCopy;
}> = [
  { domain: "story", to: "/story", label: "Story", icon: ListOrdered },
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
  if (pathname.startsWith("/story")) {
    return "story";
  }
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
        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] px-3 py-4 text-[13px] text-[var(--ink-muted)]">
          Open a project to browse chapters, scenes, characters, and suggestions in
          story order.
        </div>
      );
    }

    if (storyBrowserDomain === "story" || storyBrowserDomain === "chapters") {
      return chapters.length > 0 ? (
        <div className="grid gap-2">
          {chapters.map((chapter) => {
            const isActive = location.startsWith(`/chapters/${chapter.id}`) || activeChapterId === chapter.id;
            return (
              <ListRow
                key={chapter.id}
                active={isActive}
                className="rounded-[4px]"
                onClick={() => {
                  setSelectedChapterId(chapter.id);
                  void navigate({
                    to: "/chapters/$chapterId",
                    params: { chapterId: chapter.id },
                  });
                }}
              >
                <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{chapter.title}</p>
                <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                  {chapterSceneCounts[chapter.id] ?? 0} scene
                  {(chapterSceneCounts[chapter.id] ?? 0) === 1 ? "" : "s"}
                </p>
                </div>
              </ListRow>
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
              <ListRow
                key={scene.id}
                active={isActive}
                className="rounded-[4px]"
                onClick={() =>
                  void navigate({
                    to: "/scenes/$sceneId",
                    params: { sceneId: scene.id },
                  })
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{scene.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--ink-faint)]">{chapterTitle}</p>
                </div>
              </ListRow>
            );
          })}
          {unassignedSceneCount > 0 ? (
            <p className="px-3 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
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
                <ListRow
                  key={character.id}
                  active={isActive}
                  className="rounded-[4px]"
                  onClick={() => {
                    setSelectedCharacterId(character.id);
                    void navigate({ to: "/characters" });
                  }}
                >
                  <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{character.name}</p>
                  <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                    {character.role || "No role set yet"}
                  </p>
                  </div>
                </ListRow>
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
          <ListRow
            key={suggestion.id}
            className="rounded-[4px]"
            onClick={() => void navigate({ to: "/suggestions" })}
          >
            <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{suggestion.title}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              {suggestion.status}
            </p>
            </div>
          </ListRow>
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
    <div className="min-h-screen bg-[var(--background)] p-3 text-[var(--ink)]">
      <div className="grid min-h-[calc(100vh-1.5rem)] grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-[8px] border border-[var(--border)] bg-[var(--sidebar-bg)]">
          <div className="border-b border-[var(--border)] px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Workspace
            </p>
            <h1 className="mt-2 text-base font-semibold text-[var(--ink)]">
              {snapshot ? snapshot.project.title : "NovelForge"}
            </h1>
            <p className="mt-2 text-[13px] text-[var(--ink-muted)]">
              {snapshot
                ? snapshot.project.logline ||
                  snapshot.project.premise ||
                  "Add a story brief to sharpen the planning spine."
                : "Local-first story workspace for chapters, scenes, characters, and structured revision support."}
            </p>
            {snapshot ? (
              <p className="mt-3 text-[11px] text-[var(--ink-faint)]">
                Last opened {formatRelativeTimestamp(snapshot.project.lastOpenedAt)}
              </p>
            ) : (
              <p className="mt-3 text-[11px] text-[var(--ink-faint)]">
                Use File to create or open a project.
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
            <div className="border-b border-[var(--border)] pb-3">
            <p className="px-1 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Story Browser
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {storyDomainTabs.map((item) => {
                const Icon = item.icon;
                const isActive = storyBrowserDomain === item.domain;
                return (
                  <TabButton
                    key={item.to}
                    active={isActive}
                    className={cn(
                      "justify-start",
                      !snapshot &&
                        "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-[var(--ink-muted)]",
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
                  </TabButton>
                );
              })}
            </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-3">
              <div className="grid gap-1">{renderStoryBrowser()}</div>
            </div>
          </div>

          <nav className="grid gap-1 border-t border-[var(--border)] px-3 py-3">
            {utilityNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location === item.to || location.startsWith(`${item.to}/`);
              const disabled = !snapshot && item.to !== "/settings";
              return (
                <ListRow
                  key={item.to}
                  active={isActive}
                  className={cn(
                    "items-center rounded-[4px]",
                    disabled &&
                      "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-[var(--ink-muted)]",
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
                </ListRow>
              );
            })}
          </nav>

          {snapshot ? (
            <div className="border-t border-[var(--border)] p-3">
            <Panel className="bg-[var(--panel-bg)] p-3">
              <div className="flex items-center gap-3">
                <Activity className="size-4 text-[var(--accent)]" />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--ink)]">Analysis Engine</p>
                  <p className="text-[11px] text-[var(--ink-faint)]">
                    {isAnalyzing
                      ? "Reviewing recent story changes..."
                      : `${openSuggestionsCount} open suggestions`}
                  </p>
                </div>
              </div>
            </Panel>
            </div>
          ) : null}
        </aside>

        <div className="flex min-h-0 flex-col rounded-[8px] border border-[var(--border)] bg-[var(--content-bg)]">
          <header className="grid gap-3 border-b border-[var(--border)] px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            {snapshot ? (
              <>
                <div className="flex items-center gap-2 rounded-[4px] border border-[var(--border)] bg-[var(--input-bg)] px-3">
                  <Search className="size-4 text-[var(--ink-faint)]" />
                  <Input
                    className="border-none bg-transparent px-0 focus:border-none focus:ring-0 hover:border-transparent"
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
                <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                  Structured Story Workspace
                </h2>
                <p className="max-w-2xl text-[13px] text-[var(--ink-muted)]">
                  Start from a local .novelforge file, then work in chapters,
                  scenes, characters, and suggestions without leaving the desktop
                  app.
                </p>
              </div>
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-hidden p-3">{children}</main>
        </div>
      </div>
      <SceneWorkspaceLeavePrompt />
    </div>
  );
}
