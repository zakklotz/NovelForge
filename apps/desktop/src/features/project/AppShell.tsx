import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, CircleDot, X } from "lucide-react";
import type { DomainEvent, ProjectSnapshot, Suggestion } from "@novelforge/domain";
import { useShallow } from "zustand/react/shallow";
import { EmptyState } from "@/components/ui";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { normalizeProjectRoute, resolveProjectRouteNavigation, shouldPersistProjectRoute } from "@/lib/routes";
import { tauriApi } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import {
  useUiStore,
  type WorkbenchActivityId,
  type WorkbenchTab,
} from "@/store/uiStore";
import { SceneWorkspaceLeavePrompt } from "./SceneWorkspaceLeavePrompt";
import { WorkbenchActivityBar } from "./WorkbenchActivityBar";
import { WorkbenchAiPanel } from "./WorkbenchAiPanel";
import { WorkbenchExplorerPanel } from "./WorkbenchExplorerPanel";
import {
  buildWorkbenchTab,
  getWorkbenchActivityForTabKind,
  getWorkbenchDocumentMeta,
} from "./workbench";

function isTabDirty(
  tab: WorkbenchTab,
  workspaceSession: ReturnType<typeof useUiStore.getState>["workspaceSession"],
) {
  if (!workspaceSession || workspaceSession.dirtyAreas.length === 0) {
    return false;
  }

  if (workspaceSession.kind === "story") {
    return tab.kind === "story";
  }

  if (workspaceSession.kind === "chapter") {
    return tab.kind === "chapter" && tab.entityId === workspaceSession.entityId;
  }

  return tab.kind === "scene" && tab.entityId === workspaceSession.entityId;
}

function navigateToResolvedRoute(
  navigate: ReturnType<typeof useNavigate>,
  target: ReturnType<typeof resolveProjectRouteNavigation>,
) {
  if (
    target.to === "/chapters/$chapterId" ||
    target.to === "/scenes/$sceneId" ||
    target.to === "/characters/$characterId" ||
    target.to === "/suggestions/$suggestionId"
  ) {
    return navigate({
      to: target.to,
      params: target.params,
    });
  }

  return navigate({ to: target.to });
}

export function AppShell({
  snapshot,
  children,
}: {
  snapshot: ProjectSnapshot | null;
  children: React.ReactNode;
}) {
  const workbenchShellColumns = [
    "var(--workbench-activity-width)",
    "var(--workbench-explorer-width)",
    "minmax(var(--workbench-editor-min-width), 1fr)",
    "var(--workbench-ai-panel-width)",
  ].join(" ");
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location.pathname });
  const { refreshSnapshot, queueAnalysis, saveProjectState } = useProjectRuntime();
  const [
    searchText,
    setSearchText,
    queue,
    isAnalyzing,
    dequeueAnalysis,
    setIsAnalyzing,
    workbenchActivity,
    setWorkbenchActivity,
    editorTabs,
    activeEditorTabId,
    openEditorTab,
    closeEditorTab,
    setActiveEditorTab,
    setEditorTabs,
    setSelectedChapterId,
    setSelectedCharacterId,
    setSelectedSuggestionId,
    workspaceSession,
    setPendingWorkspaceAction,
  ] = useUiStore(
    useShallow((state) => [
      state.searchText,
      state.setSearchText,
      state.analysisQueue,
      state.isAnalyzing,
      state.dequeueAnalysis,
      state.setIsAnalyzing,
      state.workbenchActivity,
      state.setWorkbenchActivity,
      state.editorTabs,
      state.activeEditorTabId,
      state.openEditorTab,
      state.closeEditorTab,
      state.setActiveEditorTab,
      state.setEditorTabs,
      state.setSelectedChapterId,
      state.setSelectedCharacterId,
      state.setSelectedSuggestionId,
      state.workspaceSession,
      state.setPendingWorkspaceAction,
    ]),
  );
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

  const routeTab = useMemo(() => buildWorkbenchTab(location), [location]);

  useEffect(() => {
    if (!routeTab) {
      setActiveEditorTab(null);
      return;
    }

    openEditorTab(routeTab);
    setWorkbenchActivity(getWorkbenchActivityForTabKind(routeTab.kind));

    if (routeTab.kind === "chapter" && routeTab.entityId) {
      setSelectedChapterId(routeTab.entityId);
    }

    if (routeTab.kind === "character" && routeTab.entityId) {
      setSelectedCharacterId(routeTab.entityId);
    }

    if (routeTab.kind === "suggestion" && routeTab.entityId) {
      setSelectedSuggestionId(routeTab.entityId);
    }
  }, [
    openEditorTab,
    routeTab,
    setActiveEditorTab,
    setSelectedChapterId,
    setSelectedCharacterId,
    setSelectedSuggestionId,
    setWorkbenchActivity,
  ]);

  useEffect(() => {
    if (!snapshot || editorTabs.length === 0) {
      return;
    }

    const nextTabs = editorTabs.filter((tab) => {
      if (tab.kind === "settings") {
        return true;
      }

      return getWorkbenchDocumentMeta(tab, snapshot) !== null;
    });

    if (nextTabs.length !== editorTabs.length) {
      setEditorTabs(nextTabs);
    }
  }, [editorTabs, setEditorTabs, snapshot]);

  const activeTab =
    editorTabs.find((tab) => tab.id === activeEditorTabId) ?? routeTab ?? null;
  const activeMeta = getWorkbenchDocumentMeta(activeTab, snapshot);
  const openSuggestionsCount = snapshot
    ? snapshot.suggestions.filter((suggestion) => suggestion.status === "open").length
    : 0;
  const tabPresentations = useMemo(
    () =>
      editorTabs
        .map((tab) => ({
          tab,
          meta: getWorkbenchDocumentMeta(tab, snapshot),
        }))
        .filter(
          (
            item,
          ): item is {
            tab: WorkbenchTab;
            meta: NonNullable<ReturnType<typeof getWorkbenchDocumentMeta>>;
          } => item.meta !== null,
        ),
    [editorTabs, snapshot],
  );

  async function handleOpenWorkbenchRoute(pathname: string) {
    const target = snapshot
      ? resolveProjectRouteNavigation(pathname, snapshot)
      : resolveProjectRouteNavigation(pathname);

    await navigateToResolvedRoute(navigate, target);
  }

  function handleSelectActivity(activity: WorkbenchActivityId) {
    setWorkbenchActivity(activity);

    if (!snapshot) {
      return;
    }

    if (activity === "story") {
      void handleOpenWorkbenchRoute("/story");
      return;
    }

    if (activity === "suggestions") {
      void handleOpenWorkbenchRoute("/suggestions");
      return;
    }

    if (activity === "characters") {
      void handleOpenWorkbenchRoute("/characters");
      return;
    }

    if (activity === "ai") {
      void handleOpenWorkbenchRoute("/scratchpad");
    }
  }

  function handleOpenSettings() {
    void handleOpenWorkbenchRoute("/settings");
  }

  function handleActivateTab(tab: WorkbenchTab) {
    setActiveEditorTab(tab.id);
    void handleOpenWorkbenchRoute(tab.route);
  }

  async function handleCloseTab(tabId: string) {
    if (editorTabs.length <= 1) {
      return;
    }

    const closingIndex = editorTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex === -1) {
      return;
    }

    if (activeTab?.id !== tabId) {
      closeEditorTab(tabId);
      return;
    }

    const fallbackTab = editorTabs[closingIndex + 1] ?? editorTabs[closingIndex - 1] ?? null;
    if (!fallbackTab) {
      return;
    }

    const runClose = async () => {
      await handleOpenWorkbenchRoute(fallbackTab.route);
      closeEditorTab(tabId);
    };

    if (workspaceSession && workspaceSession.dirtyAreas.length > 0) {
      setPendingWorkspaceAction({
        targetLabel: "close this tab",
        runAction: runClose,
      });
      return;
    }

    await runClose();
  }

  return (
    <div className="h-screen overflow-hidden bg-[var(--background)] p-3 text-[var(--ink)]">
      <div
        className="grid h-full overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--content-bg)]"
        style={{ gridTemplateColumns: workbenchShellColumns }}
      >
        <WorkbenchActivityBar
          activeActivity={workbenchActivity}
          hasProject={Boolean(snapshot)}
          onSelectActivity={handleSelectActivity}
          onOpenSettings={handleOpenSettings}
          isSettingsActive={location === "/settings"}
        />

        <WorkbenchExplorerPanel
          snapshot={snapshot}
          activity={workbenchActivity}
          currentRoute={location}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          onOpenRoute={(pathname) => {
            void handleOpenWorkbenchRoute(pathname);
          }}
          onRunFullScan={() =>
            queueAnalysis({
              id: crypto.randomUUID(),
              projectId: snapshot?.project.id ?? "",
              occurredAt: new Date().toISOString(),
              type: "analysis.manualRequested",
            }).catch(() => undefined)
          }
          isAnalyzing={isAnalyzing}
          openSuggestionsCount={openSuggestionsCount}
        />

        <section className="flex min-h-0 min-w-0 flex-col bg-[var(--content-bg)]">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-[var(--workbench-editor-padding)] py-2">
            {tabPresentations.length > 0 ? (
              tabPresentations.map(({ tab, meta }) => {
                const active = activeTab?.id === tab.id;
                const dirty = isTabDirty(tab, workspaceSession);

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleActivateTab(tab)}
                    className={cn(
                      "group inline-flex h-9 shrink-0 items-center gap-2 rounded-[6px] border px-3 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                      active
                        ? "border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink)]"
                        : "border-transparent bg-transparent text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
                    )}
                  >
                    {dirty ? (
                      <CircleDot className="size-3.5 text-[var(--warning)]" />
                    ) : (
                      <Activity className="size-3.5 text-[var(--ink-faint)]" />
                    )}
                    <span className="max-w-48 truncate">{meta.shortTitle}</span>
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCloseTab(tab.id);
                      }}
                      className={cn(
                        "inline-flex size-4 items-center justify-center rounded-[4px] text-[var(--ink-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]",
                        editorTabs.length <= 1 && "pointer-events-none opacity-30",
                      )}
                    >
                      <X className="size-3.5" />
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="flex h-9 items-center px-2 text-[12px] text-[var(--ink-faint)]">
                No open tabs
              </div>
            )}
          </div>

          <main className="min-h-0 flex-1 overflow-hidden p-[var(--workbench-editor-padding)]">
            {tabPresentations.length === 0 && snapshot ? (
              <EmptyState
                title="Open a resource"
                description="Select a chapter, scene, character, or suggestion from the explorer to open it in the editor workspace."
              />
            ) : (
              children
            )}
          </main>
        </section>

        <WorkbenchAiPanel
          snapshotProjectId={snapshot?.project.id ?? null}
          activeTab={activeTab}
          activeMeta={activeMeta}
        />
      </div>
      <SceneWorkspaceLeavePrompt />
    </div>
  );
}
