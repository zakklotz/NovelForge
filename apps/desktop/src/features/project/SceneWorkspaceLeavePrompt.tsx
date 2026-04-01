import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button, Panel } from "@/components/ui";
import { useUiStore } from "@/store/uiStore";

function describeDirtyAreas(dirtyAreas: string[]) {
  if (dirtyAreas.length === 2) {
    return "planning and draft changes";
  }
  return dirtyAreas[0] === "draft" ? "draft changes" : "planning changes";
}

function describeNavigationTarget(pathname: string) {
  if (pathname.startsWith("/scenes/")) {
    return "open another scene";
  }
  if (pathname === "/scenes") {
    return "return to the scene board";
  }
  if (pathname === "/chapters") {
    return "open Chapters";
  }
  if (pathname.startsWith("/chapters/")) {
    return "open another chapter";
  }
  if (pathname === "/characters") {
    return "open Characters";
  }
  if (pathname === "/suggestions") {
    return "open Suggestions";
  }
  if (pathname === "/scratchpad") {
    return "open Scratchpad";
  }
  if (pathname === "/settings") {
    return "open Settings";
  }
  return "leave this workspace";
}

function describeWorkspaceLabel(kind: "scene" | "chapter") {
  return kind === "chapter" ? "chapter" : "scene";
}

function toErrorMessage(error: unknown, workspaceLabel: string) {
  return error instanceof Error
    ? error.message
    : `NovelForge could not finish that ${workspaceLabel} workspace action.`;
}

export function SceneWorkspaceLeavePrompt() {
  const [session, pendingAction, setPendingAction] = useUiStore(
    useShallow((state) => [
      state.workspaceSession,
      state.pendingWorkspaceAction,
      state.setPendingWorkspaceAction,
    ]),
  );
  const [activeChoice, setActiveChoice] = useState<"save" | "discard" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasUnsavedChanges = Boolean(session && session.dirtyAreas.length > 0);
  const workspaceLabel = session ? describeWorkspaceLabel(session.kind) : "workspace";

  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });

  const isOpen = Boolean(pendingAction) || blocker.status === "blocked";
  const targetLabel =
    pendingAction?.targetLabel ??
    (blocker.status === "blocked"
      ? describeNavigationTarget(blocker.next.pathname)
      : `leave this ${workspaceLabel} workspace`);

  useEffect(() => {
    if (!isOpen) {
      setActiveChoice(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!hasUnsavedChanges && blocker.status === "blocked" && !pendingAction) {
      void blocker.proceed();
    }
  }, [blocker, blocker.status, hasUnsavedChanges, pendingAction]);

  async function runProtectedAction(mode: "save" | "discard") {
    if (!session) {
      return;
    }

    setActiveChoice(mode);
    setErrorMessage(null);

    try {
      if (mode === "save") {
        await session.saveChanges();
      } else {
        await session.discardChanges();
      }

      if (pendingAction) {
        const nextAction = pendingAction.runAction;
        setPendingAction(null);
        await nextAction();
        return;
      }

      if (blocker.status === "blocked") {
        await blocker.proceed?.();
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error, workspaceLabel));
    } finally {
      setActiveChoice(null);
    }
  }

  function handleCancel() {
    if (activeChoice) {
      return;
    }

    setErrorMessage(null);
    if (pendingAction) {
      setPendingAction(null);
    }
    if (blocker.status === "blocked") {
      blocker.reset();
    }
  }

  if (!session || !isOpen) {
    return null;
  }

  const dirtySummary = describeDirtyAreas(session.dirtyAreas);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(32,22,14,0.4)] p-4 backdrop-blur-sm">
      <Panel className="w-full max-w-lg shadow-[0_30px_80px_rgba(24,17,10,0.3)]">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[color:rgba(174,67,45,0.12)] p-3 text-[var(--danger)]">
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-semibold text-[var(--ink)]">
              Unsaved {workspaceLabel} changes
            </h2>
            <p className="text-sm text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--ink)]">
                {session.entityTitle}
              </span>{" "}
              has unsaved {dirtySummary}. Save them before you {targetLabel}?
            </p>
          </div>
        </div>

        {errorMessage ? (
          <Panel className="mt-5 bg-[color:rgba(174,67,45,0.08)] shadow-none">
            <p className="text-sm text-[var(--danger)]">{errorMessage}</p>
          </Panel>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={handleCancel} disabled={Boolean(activeChoice)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => void runProtectedAction("discard")}
            disabled={Boolean(activeChoice)}
          >
            {activeChoice === "discard" ? "Discarding..." : "Discard Changes"}
          </Button>
          <Button
            onClick={() => void runProtectedAction("save")}
            disabled={Boolean(activeChoice)}
          >
            {activeChoice === "save" ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
