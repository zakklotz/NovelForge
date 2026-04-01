import type { ReactNode } from "react";
import { Button, Field, Input, Panel, Textarea } from "@/components/ui";

export interface ProjectCreationSeedState {
  title: string;
  logline: string;
  premise: string;
  centralConflict: string;
  thematicIntent: string;
  genre: string;
  tone: string;
}

export function emptyProjectCreationSeedState(): ProjectCreationSeedState {
  return {
    title: "",
    logline: "",
    premise: "",
    centralConflict: "",
    thematicIntent: "",
    genre: "",
    tone: "",
  };
}

export function CreateProjectSurface({
  title,
  description,
  projectSeed,
  onProjectSeedChange,
  showOptionalStoryAnchors,
  onToggleOptionalStoryAnchors,
  onSubmit,
  secondaryAction,
  isBusy,
  errorMessage,
  submitLabel = "New Project",
}: {
  title: string;
  description: ReactNode;
  projectSeed: ProjectCreationSeedState;
  onProjectSeedChange: (field: keyof ProjectCreationSeedState, value: string) => void;
  showOptionalStoryAnchors: boolean;
  onToggleOptionalStoryAnchors: () => void;
  onSubmit: () => Promise<void>;
  secondaryAction?: ReactNode;
  isBusy: boolean;
  errorMessage: string | null;
  submitLabel?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--ink)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
      </div>

      <Field label="New Project Title" hint="Required">
        <Input
          placeholder="Untitled Novel"
          value={projectSeed.title}
          onChange={(event) => onProjectSeedChange("title", event.target.value)}
        />
      </Field>

      <div className="rounded-[1.5rem] border border-black/8 bg-white/55 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Story Brief Seed</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Start with a few high-value story anchors now, then continue shaping the brief
              from Story.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => onToggleOptionalStoryAnchors()}
            disabled={isBusy}
          >
            {showOptionalStoryAnchors ? "Hide Optional Anchors" : "Add Optional Anchors"}
          </Button>
        </div>

        <div className="mt-4 grid gap-4">
          <Field label="Logline" hint="Optional, 1-2 sentences">
            <Textarea
              rows={3}
              value={projectSeed.logline}
              onChange={(event) => onProjectSeedChange("logline", event.target.value)}
              placeholder="Who wants what, what stands in the way, and why it matters."
            />
          </Field>

          <div className="grid gap-4 xl:grid-cols-2">
            <Field label="Premise" hint="Optional">
              <Textarea
                rows={4}
                value={projectSeed.premise}
                onChange={(event) => onProjectSeedChange("premise", event.target.value)}
                placeholder="State the core setup the story is built around."
              />
            </Field>

            <Field label="Central Conflict" hint="Optional">
              <Textarea
                rows={4}
                value={projectSeed.centralConflict}
                onChange={(event) =>
                  onProjectSeedChange("centralConflict", event.target.value)
                }
                placeholder="Name the pressure, opposition, or impossible bind driving the story."
              />
            </Field>
          </div>

          {showOptionalStoryAnchors ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)]">
              <Field label="Thematic Intent" hint="Optional">
                <Textarea
                  rows={3}
                  value={projectSeed.thematicIntent}
                  onChange={(event) =>
                    onProjectSeedChange("thematicIntent", event.target.value)
                  }
                  placeholder="Describe the human question or tension the story wants to test."
                />
              </Field>

              <Field label="Genre" hint="Optional">
                <Input
                  value={projectSeed.genre}
                  onChange={(event) => onProjectSeedChange("genre", event.target.value)}
                  placeholder="Science-fantasy adventure"
                />
              </Field>

              <Field label="Tone" hint="Optional">
                <Input
                  value={projectSeed.tone}
                  onChange={(event) => onProjectSeedChange("tone", event.target.value)}
                  placeholder="Tense and wonder-struck"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-[var(--ink-muted)]">
        Keep it light if you want. Anything beyond the title can be skipped and refined later
        in the Story workspace.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onSubmit()} disabled={isBusy}>
          {submitLabel}
        </Button>
        {secondaryAction}
      </div>

      {errorMessage ? (
        <Panel className="bg-[color:rgba(174,67,45,0.1)]">
          <p className="text-sm text-[var(--danger)]">{errorMessage}</p>
        </Panel>
      ) : null}
    </div>
  );
}
