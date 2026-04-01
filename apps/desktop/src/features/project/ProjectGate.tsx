import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { CreateProjectInput } from "@novelforge/domain";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { Button, EmptyState, Field, Input, Panel } from "@/components/ui";
import { useUiStore } from "@/store/uiStore";
import { formatRelativeTimestamp } from "@/lib/utils";
import { AppShell } from "./AppShell";
import { SettingsView } from "@/features/settings/SettingsView";

function ProjectSplash() {
  const { createProject, openProject } = useProjectRuntime();
  const [projectTitle, setProjectTitle] = useState("");

  async function handleCreate() {
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

    await createProject(input);
    setProjectTitle("");
  }

  async function handleOpen() {
    const path = await open({
      multiple: false,
      filters: [
        { name: "NovelForge Project", extensions: ["novelforge", "sqlite", "db"] },
      ],
    });

    if (!path || Array.isArray(path)) {
      return;
    }

    await openProject({ path });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 rounded-[2rem] border border-white/50 bg-[color:rgba(255,248,239,0.7)] p-10 shadow-[0_30px_80px_rgba(36,24,15,0.14)] backdrop-blur">
          <span className="inline-flex rounded-full bg-[color:rgba(184,88,63,0.14)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">
            Structured Novel Workshop
          </span>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-5xl font-semibold leading-tight text-[var(--ink)]">
              Build a novel as a living system, not a pile of disconnected pages.
            </h1>
            <p className="max-w-2xl text-lg text-[var(--ink-muted)]">
              Organize chapters and scenes, write in a context-rich workspace, and
              surface revision warnings when structure or character logic shifts.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Chapter maps", "Track purpose, emotional movement, and major events."],
              ["Scene workspace", "Draft with chapter intent, character cards, and warnings in view."],
              ["Continuity review", "Flag dependency and structure risks as the manuscript evolves."],
            ].map(([title, text]) => (
              <Panel key={title} className="bg-white/75">
                <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
                <p className="mt-2 text-sm text-[var(--ink-muted)]">{text}</p>
              </Panel>
            ))}
          </div>
        </div>

        <Panel className="self-center">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--ink)]">
                Start a new project
              </h2>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Create a portable local project file and begin structuring the novel.
              </p>
            </div>
            <Field label="Project Title">
              <Input
                placeholder="Ashen Sky"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={handleCreate}>Create Project</Button>
              <Button variant="secondary" onClick={handleOpen}>
                Open Existing
              </Button>
            </div>
            <div className="pt-2 text-sm text-[var(--ink-muted)]">
              Need to add Gemini, Groq, or OpenRouter keys first?{" "}
              <Link
                to="/settings"
                className="font-semibold text-[var(--accent-strong)] underline"
              >
                Open AI Settings
              </Link>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function ProjectGate({ children }: { children: React.ReactNode }) {
  const snapshotQuery = useProjectSnapshot();
  const currentProjectId = useUiStore((state) => state.currentProjectId);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!currentProjectId) {
    if (pathname === "/settings") {
      return <SettingsView standalone />;
    }
    return <ProjectSplash />;
  }

  if (snapshotQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <EmptyState
          title="Opening project"
          description="Loading chapters, scenes, and character context."
        />
      </div>
    );
  }

  if (snapshotQuery.isError || !snapshotQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Panel className="max-w-xl">
          <h2 className="text-xl font-semibold text-[var(--ink)]">
            Project could not be opened
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {snapshotQuery.error instanceof Error
              ? snapshotQuery.error.message
              : "NovelForge hit an unexpected error while loading the current project."}
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Last attempted load {formatRelativeTimestamp(new Date().toISOString())}
          </p>
        </Panel>
      </div>
    );
  }

  return <AppShell snapshot={snapshotQuery.data}>{children}</AppShell>;
}
