import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { CreateProjectInput, ProjectSnapshot } from "@novelforge/domain";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { Button, EmptyState, Panel } from "@/components/ui";
import { useUiStore } from "@/store/uiStore";
import { resolveProjectRouteNavigation } from "@/lib/routes";
import { AppShell } from "./AppShell";
import { SettingsView } from "@/features/settings/SettingsView";
import {
  CreateProjectSurface,
  emptyProjectCreationSeedState,
  type ProjectCreationSeedState,
} from "./CreateProjectSurface";

const MENU_EVENT_NEW_PROJECT = "novelforge://new-project";
const MENU_EVENT_OPEN_PROJECT = "novelforge://open-project";
const MENU_EVENT_CLOSE_PROJECT = "novelforge://close-project";
const MENU_EVENT_OPEN_SETTINGS = "novelforge://open-settings";
const CLOSE_APP_TARGET_LABEL = "close NovelForge";

interface FocusRestoreDescriptor {
  tagName: "button" | "input" | "textarea" | "select";
  label: string | null;
}

function normalizeFocusRestoreLabel(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function describeFocusRestoreTarget(
  element: HTMLElement | null,
): FocusRestoreDescriptor | null {
  if (element instanceof HTMLButtonElement) {
    return {
      tagName: "button",
      label: element.getAttribute("aria-label") || element.textContent,
    };
  }

  if (element instanceof HTMLInputElement) {
    return {
      tagName: "input",
      label: element.getAttribute("aria-label") || element.placeholder,
    };
  }

  if (element instanceof HTMLTextAreaElement) {
    return {
      tagName: "textarea",
      label: element.getAttribute("aria-label") || element.placeholder,
    };
  }

  if (element instanceof HTMLSelectElement) {
    return {
      tagName: "select",
      label: element.getAttribute("aria-label"),
    };
  }

  return null;
}

function findFocusRestoreTarget(
  descriptor: FocusRestoreDescriptor | null,
): HTMLElement | null {
  if (!descriptor) {
    return null;
  }

  const normalizedLabel = normalizeFocusRestoreLabel(descriptor.label);
  if (!normalizedLabel) {
    return null;
  }

  const selectorByTagName: Record<FocusRestoreDescriptor["tagName"], string> = {
    button: "button:not([disabled])",
    input: "input:not([disabled])",
    textarea: "textarea:not([disabled])",
    select: "select:not([disabled])",
  };

  return (
    Array.from(document.querySelectorAll<HTMLElement>(selectorByTagName[descriptor.tagName])).find(
      (candidate) =>
        normalizeFocusRestoreLabel(
          candidate.getAttribute("aria-label") ||
            ("placeholder" in candidate ? candidate.getAttribute("placeholder") : null) ||
            candidate.textContent,
        ) === normalizedLabel,
    ) ?? null
  );
}

function findFallbackFocusTarget() {
  return document.querySelector<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
  );
}

function StartupState({
  projectSeed,
  onProjectSeedChange,
  showOptionalStoryAnchors,
  onToggleOptionalStoryAnchors,
  onCreateProject,
  onOpenProject,
  isBusy,
  isRestoring,
  errorMessage,
}: {
  projectSeed: ProjectCreationSeedState;
  onProjectSeedChange: (field: keyof ProjectCreationSeedState, value: string) => void;
  showOptionalStoryAnchors: boolean;
  onToggleOptionalStoryAnchors: () => void;
  onCreateProject: () => Promise<void>;
  onOpenProject: () => Promise<void>;
  isBusy: boolean;
  isRestoring: boolean;
  errorMessage: string | null;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <Panel>
        {isRestoring ? (
          <EmptyState
            title="Checking for your last project"
            description="NovelForge is looking for a valid last-opened workspace."
          />
        ) : (
          <CreateProjectSurface
            title="No project open"
            description={
              <>
                Use File -&gt; New Project or File -&gt; Open Project to enter the
                workspace. AI provider configuration stays in Settings, not in the startup flow.
              </>
            }
            projectSeed={projectSeed}
            onProjectSeedChange={onProjectSeedChange}
            showOptionalStoryAnchors={showOptionalStoryAnchors}
            onToggleOptionalStoryAnchors={onToggleOptionalStoryAnchors}
            onSubmit={onCreateProject}
            secondaryAction={
              <Button variant="secondary" onClick={() => void onOpenProject()} disabled={isBusy}>
                Open Project
              </Button>
            }
            isBusy={isBusy}
            errorMessage={errorMessage}
          />
        )}
      </Panel>
    </div>
  );
}

function CreateProjectDialog({
  projectSeed,
  onProjectSeedChange,
  showOptionalStoryAnchors,
  onToggleOptionalStoryAnchors,
  onCreateProject,
  onCancel,
  dialogRef,
  isBusy,
  errorMessage,
}: {
  projectSeed: ProjectCreationSeedState;
  onProjectSeedChange: (field: keyof ProjectCreationSeedState, value: string) => void;
  showOptionalStoryAnchors: boolean;
  onToggleOptionalStoryAnchors: () => void;
  onCreateProject: () => Promise<void>;
  onCancel: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
  isBusy: boolean;
  errorMessage: string | null;
}) {
  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(32,22,14,0.4)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create a new project"
    >
      <Panel className="w-full max-w-3xl shadow-[0_30px_80px_rgba(24,17,10,0.3)]">
        <CreateProjectSurface
          title="New Project"
          description="Start with a title and a few high-value story anchors, then continue shaping the brief from Story once the project opens."
          projectSeed={projectSeed}
          onProjectSeedChange={onProjectSeedChange}
          showOptionalStoryAnchors={showOptionalStoryAnchors}
          onToggleOptionalStoryAnchors={onToggleOptionalStoryAnchors}
          onSubmit={onCreateProject}
          secondaryAction={
            <Button variant="ghost" onClick={onCancel} disabled={isBusy}>
              Cancel
            </Button>
          }
          isBusy={isBusy}
          errorMessage={errorMessage}
        />
      </Panel>
    </div>
  );
}

export function ProjectGate({ children }: { children: React.ReactNode }) {
  const snapshotQuery = useProjectSnapshot();
  const navigate = useNavigate();
  const currentProjectId = useUiStore((state) => state.currentProjectId);
  const setPendingWorkspaceAction = useUiStore(
    (state) => state.setPendingWorkspaceAction,
  );
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { createProject, openProject, restoreLastProject, closeProject } =
    useProjectRuntime();
  const [projectSeed, setProjectSeed] = useState<ProjectCreationSeedState>(
    emptyProjectCreationSeedState,
  );
  const [showOptionalStoryAnchors, setShowOptionalStoryAnchors] = useState(false);
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [isStartingProject, setIsStartingProject] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const hasAttemptedRestore = useRef(false);
  const createProjectDialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const previousFocusedDescriptorRef = useRef<FocusRestoreDescriptor | null>(null);
  const wasCreateProjectDialogOpenRef = useRef(false);

  const openWorkspace = useEffectEvent(
    async (
      route: string | null | undefined,
      snapshotOverride?: Pick<ProjectSnapshot, "chapters" | "scenes">,
    ) => {
      const routeSnapshot = snapshotOverride ?? snapshotQuery.data;
      const target = routeSnapshot
        ? resolveProjectRouteNavigation(route, routeSnapshot)
        : resolveProjectRouteNavigation(route);

      if (target.to === "/chapters/$chapterId" || target.to === "/scenes/$sceneId") {
        await navigate({
          to: target.to,
          params: target.params,
        });
        return;
      }

      await navigate({ to: target.to });
    },
  );

  const updateProjectSeedField = useEffectEvent(
    (field: keyof ProjectCreationSeedState, value: string) => {
      setProjectSeed((current) => ({ ...current, [field]: value }));
    },
  );

  const resetProjectCreationState = useEffectEvent(() => {
    setProjectSeed(emptyProjectCreationSeedState());
    setShowOptionalStoryAnchors(false);
    setStartupError(null);
  });

  const handleDismissCreateProjectDialog = useEffectEvent(() => {
    if (isStartingProject) {
      return;
    }

    setIsCreateProjectDialogOpen(false);
    resetProjectCreationState();
  });

  const runProtectedProjectAction = useEffectEvent(
    async (targetLabel: string, action: () => Promise<void>) => {
      const session = useUiStore.getState().workspaceSession;

      if (session && session.dirtyAreas.length > 0) {
        setPendingWorkspaceAction({
          targetLabel,
          runAction: action,
        });
        return;
      }

      await action();
    },
  );

  const handleCreateProject = useEffectEvent(async () => {
    await runProtectedProjectAction("create a new project", async () => {
      setIsStartingProject(true);
      setStartupError(null);

      try {
        const normalizedTitle = projectSeed.title.trim() || "Untitled Novel";
        const path = await save({
          defaultPath: `${normalizedTitle.replace(/\s+/g, "-").toLowerCase()}.novelforge`,
          filters: [{ name: "NovelForge Project", extensions: ["novelforge"] }],
        });

        if (!path) {
          return;
        }

        const input: CreateProjectInput = {
          title: normalizedTitle,
          logline: projectSeed.logline,
          premise: projectSeed.premise,
          centralConflict: projectSeed.centralConflict,
          thematicIntent: projectSeed.thematicIntent,
          genre: projectSeed.genre,
          tone: projectSeed.tone,
          path,
        };

        const snapshot = await createProject(input);
        resetProjectCreationState();
        setIsCreateProjectDialogOpen(false);
        await openWorkspace(snapshot.projectState.lastRoute, snapshot);
      } catch (error) {
        setStartupError(
          error instanceof Error
            ? error.message
            : "NovelForge could not create the project.",
        );
      } finally {
        setIsStartingProject(false);
        setIsRestoring(false);
      }
    });
  });

  const handleStartNewProjectFlow = useEffectEvent(async () => {
    setStartupError(null);

    if (!currentProjectId) {
      setIsCreateProjectDialogOpen(false);
      if (pathname !== "/") {
        await navigate({ to: "/" });
      }
      return;
    }

    setIsCreateProjectDialogOpen(true);
  });

  const handleOpenProject = useEffectEvent(async () => {
    await runProtectedProjectAction("open another project", async () => {
      setIsStartingProject(true);
      setStartupError(null);

      try {
        const path = await open({
          multiple: false,
          filters: [
            { name: "NovelForge Project", extensions: ["novelforge", "sqlite", "db"] },
          ],
        });

        if (!path || Array.isArray(path)) {
          return;
        }

        const snapshot = await openProject({ path });
        setIsCreateProjectDialogOpen(false);
        await openWorkspace(snapshot.projectState.lastRoute, snapshot);
      } catch (error) {
        setStartupError(
          error instanceof Error
            ? error.message
            : "NovelForge could not open that project file.",
        );
      } finally {
        setIsStartingProject(false);
        setIsRestoring(false);
      }
    });
  });

  const handleCloseProject = useEffectEvent(async () => {
    await runProtectedProjectAction("close the current project", async () => {
      await closeProject();
      setIsCreateProjectDialogOpen(false);
      setStartupError(null);
      await navigate({ to: "/" });
    });
  });

  const handleOpenSettings = useEffectEvent(async () => {
    await navigate({ to: "/settings" });
  });

  const handleNativeCloseRequested = useEffectEvent(async () => {
    const session = useUiStore.getState().workspaceSession;

    if (!session || session.dirtyAreas.length === 0) {
      return false;
    }

    setPendingWorkspaceAction({
      targetLabel: CLOSE_APP_TARGET_LABEL,
      runAction: async () => {
        await getCurrentWindow().destroy();
      },
    });

    return true;
  });

  useEffect(() => {
    if (hasAttemptedRestore.current || currentProjectId) {
      setIsRestoring(false);
      return;
    }

    hasAttemptedRestore.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await restoreLastProject();
        if (cancelled || !snapshot) {
          return;
        }
        await openWorkspace(snapshot.projectState.lastRoute, snapshot);
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentProjectId, openWorkspace, restoreLastProject]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_EVENT_PLUGIN_INTERNALS__" in window)) {
      return;
    }

    let unlistenFns: Array<() => void> = [];
    let disposed = false;

    void Promise.all([
      listen(MENU_EVENT_NEW_PROJECT, () => {
        void handleStartNewProjectFlow();
      }),
      listen(MENU_EVENT_OPEN_PROJECT, () => {
        void handleOpenProject();
      }),
      listen(MENU_EVENT_CLOSE_PROJECT, () => {
        void handleCloseProject();
      }),
      listen(MENU_EVENT_OPEN_SETTINGS, () => {
        void handleOpenSettings();
      }),
    ]).then((listeners) => {
      if (disposed) {
        listeners.forEach((unlisten) => unlisten());
        return;
      }
      unlistenFns = listeners;
    });

    return () => {
      disposed = true;
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, [
    handleCloseProject,
    handleOpenProject,
    handleOpenSettings,
    handleStartNewProjectFlow,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_EVENT_PLUGIN_INTERNALS__" in window)) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let unlistenCloseRequested: (() => void) | null = null;
    let disposed = false;

    void currentWindow
      .onCloseRequested(async (event) => {
        const shouldBlockClose = await handleNativeCloseRequested();
        if (shouldBlockClose) {
          event.preventDefault();
        }
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenCloseRequested = unlisten;
      });

    return () => {
      disposed = true;
      unlistenCloseRequested?.();
    };
  }, [handleNativeCloseRequested]);

  useEffect(() => {
    if (!snapshotQuery.data || pathname !== "/") {
      return;
    }

    void openWorkspace(snapshotQuery.data.projectState.lastRoute);
  }, [openWorkspace, pathname, snapshotQuery.data]);

  useEffect(() => {
    if (!isCreateProjectDialogOpen) {
      if (!wasCreateProjectDialogOpenRef.current) {
        return;
      }

      wasCreateProjectDialogOpenRef.current = false;
      const previousFocusedElement = previousFocusedElementRef.current;
      const previousFocusedDescriptor = previousFocusedDescriptorRef.current;
      previousFocusedElementRef.current = null;
      previousFocusedDescriptorRef.current = null;

      if (
        previousFocusedElement &&
        previousFocusedElement !== document.body &&
        previousFocusedElement.isConnected
      ) {
        previousFocusedElement.focus();
      } else {
        findFocusRestoreTarget(previousFocusedDescriptor)?.focus();
        if (document.activeElement === document.body) {
          findFallbackFocusTarget()?.focus();
        }
      }

      return;
    }

    wasCreateProjectDialogOpenRef.current = true;
    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousFocusedDescriptorRef.current = describeFocusRestoreTarget(
      previousFocusedElementRef.current,
    );

    const primaryField = createProjectDialogRef.current?.querySelector<HTMLElement>(
      "[data-create-project-primary-field='true']",
    );
    primaryField?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isStartingProject) {
        return;
      }

      event.preventDefault();
      handleDismissCreateProjectDialog();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleDismissCreateProjectDialog, isCreateProjectDialogOpen, isStartingProject]);

  let content = children;

  if (!currentProjectId) {
    content =
      pathname === "/settings" ? (
        <SettingsView />
      ) : (
        <EmptyState
          title="No project loaded"
          description="Open or create a project to start structuring the novel."
        />
      );
  } else if (snapshotQuery.isLoading && !snapshotQuery.data) {
    content = (
      <Panel>
        <EmptyState
          title="Opening project"
          description="Loading chapters, scenes, and character context."
        />
      </Panel>
    );
  } else if (snapshotQuery.isError || !snapshotQuery.data) {
    content = (
      <Panel className="mx-auto max-w-xl">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-[var(--ink)]">
            Project could not be opened
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {snapshotQuery.error instanceof Error
              ? snapshotQuery.error.message
              : "NovelForge hit an unexpected error while loading the current project."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void handleOpenProject()}>
              Open Another Project
            </Button>
            <Button variant="ghost" onClick={() => void handleCloseProject()}>
              Back To Startup
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <AppShell snapshot={snapshotQuery.data ?? null}>
        {!currentProjectId && pathname !== "/settings" ? (
          <StartupState
            projectSeed={projectSeed}
            onProjectSeedChange={updateProjectSeedField}
            showOptionalStoryAnchors={showOptionalStoryAnchors}
            onToggleOptionalStoryAnchors={() =>
              setShowOptionalStoryAnchors((current) => !current)
            }
            onCreateProject={handleCreateProject}
            onOpenProject={handleOpenProject}
            isBusy={isStartingProject}
            isRestoring={isRestoring}
            errorMessage={startupError}
          />
        ) : (
          content
        )}
      </AppShell>

      {currentProjectId && isCreateProjectDialogOpen ? (
        <CreateProjectDialog
          projectSeed={projectSeed}
          onProjectSeedChange={updateProjectSeedField}
          showOptionalStoryAnchors={showOptionalStoryAnchors}
          onToggleOptionalStoryAnchors={() =>
            setShowOptionalStoryAnchors((current) => !current)
          }
          onCreateProject={handleCreateProject}
          onCancel={handleDismissCreateProjectDialog}
          dialogRef={createProjectDialogRef}
          isBusy={isStartingProject}
          errorMessage={startupError}
        />
      ) : null}
    </>
  );
}
