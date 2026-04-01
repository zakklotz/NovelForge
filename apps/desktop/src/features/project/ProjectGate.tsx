import { useEffect, useEffectEvent, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { CreateProjectInput, ProjectSnapshot } from "@novelforge/domain";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { Button, EmptyState, Field, Input, Panel } from "@/components/ui";
import { useUiStore } from "@/store/uiStore";
import { resolveProjectRouteNavigation } from "@/lib/routes";
import { AppShell } from "./AppShell";
import { SettingsView } from "@/features/settings/SettingsView";

const MENU_EVENT_NEW_PROJECT = "novelforge://new-project";
const MENU_EVENT_OPEN_PROJECT = "novelforge://open-project";
const MENU_EVENT_CLOSE_PROJECT = "novelforge://close-project";
const MENU_EVENT_OPEN_SETTINGS = "novelforge://open-settings";
const CLOSE_APP_TARGET_LABEL = "close NovelForge";

function StartupState({
  projectTitle,
  onProjectTitleChange,
  onCreateProject,
  onOpenProject,
  isBusy,
  isRestoring,
  errorMessage,
}: {
  projectTitle: string;
  onProjectTitleChange: (value: string) => void;
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
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--ink)]">No project open</h2>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Use File -&gt; New Project or File -&gt; Open Project to enter the
                workspace. AI provider configuration stays in Settings, not in
                the startup flow.
              </p>
            </div>

            <Field label="New Project Title">
              <Input
                placeholder="Untitled Novel"
                value={projectTitle}
                onChange={(event) => onProjectTitleChange(event.target.value)}
              />
            </Field>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => onCreateProject()} disabled={isBusy}>
                New Project
              </Button>
              <Button
                variant="secondary"
                onClick={() => onOpenProject()}
                disabled={isBusy}
              >
                Open Project
              </Button>
            </div>

            {errorMessage ? (
              <Panel className="bg-[color:rgba(174,67,45,0.1)]">
                <p className="text-sm text-[var(--danger)]">{errorMessage}</p>
              </Panel>
            ) : null}
          </div>
        )}
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
  const [projectTitle, setProjectTitle] = useState("");
  const [isStartingProject, setIsStartingProject] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const hasAttemptedRestore = useRef(false);

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
        const normalizedTitle = projectTitle.trim() || "Untitled Novel";
        const path = await save({
          defaultPath: `${normalizedTitle.replace(/\s+/g, "-").toLowerCase()}.novelforge`,
          filters: [{ name: "NovelForge Project", extensions: ["novelforge"] }],
        });

        if (!path) {
          return;
        }

        const input: CreateProjectInput = {
          title: normalizedTitle,
          logline: "",
          path,
        };

        const snapshot = await createProject(input);
        setProjectTitle("");
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
        void handleCreateProject();
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
    handleCreateProject,
    handleOpenProject,
    handleOpenSettings,
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
    <AppShell snapshot={snapshotQuery.data ?? null}>
      {!currentProjectId && pathname !== "/settings" ? (
        <StartupState
          projectTitle={projectTitle}
          onProjectTitleChange={setProjectTitle}
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
  );
}
