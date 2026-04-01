import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { Chapter } from "@novelforge/domain";
import {
  ArrowLeft,
  FileText,
  ListOrdered,
  Plus,
  Save,
  Target,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionHeading,
  Textarea,
} from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { splitLines } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { createEmptySceneInput } from "@/features/scenes/sceneFactories";

interface ChapterPlanningState {
  title: string;
  summary: string;
  purpose: string;
  majorEvents: string;
  emotionalMovement: string;
  setupPayoffNotes: string;
  characterFocusIds: string[];
}

function emptyChapterPlanningState(): ChapterPlanningState {
  return {
    title: "",
    summary: "",
    purpose: "",
    majorEvents: "",
    emotionalMovement: "",
    setupPayoffNotes: "",
    characterFocusIds: [],
  };
}

function buildChapterPlanningState(chapter: Chapter): ChapterPlanningState {
  return {
    title: chapter.title,
    summary: chapter.summary,
    purpose: chapter.purpose,
    majorEvents: chapter.majorEvents.join("\n"),
    emotionalMovement: chapter.emotionalMovement,
    setupPayoffNotes: chapter.setupPayoffNotes,
    characterFocusIds: [...chapter.characterFocusIds],
  };
}

function areStringListsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function arePlanningStatesEqual(
  left: ChapterPlanningState,
  right: ChapterPlanningState,
) {
  return (
    left.title === right.title &&
    left.summary === right.summary &&
    left.purpose === right.purpose &&
    left.majorEvents === right.majorEvents &&
    left.emotionalMovement === right.emotionalMovement &&
    left.setupPayoffNotes === right.setupPayoffNotes &&
    areStringListsEqual(left.characterFocusIds, right.characterFocusIds)
  );
}

function getChangedFields(
  planning: ChapterPlanningState,
  persistedPlanning: ChapterPlanningState,
) {
  return [
    planning.title !== persistedPlanning.title ? "title" : null,
    planning.summary !== persistedPlanning.summary ? "summary" : null,
    planning.purpose !== persistedPlanning.purpose ? "purpose" : null,
    planning.majorEvents !== persistedPlanning.majorEvents ? "majorEvents" : null,
    planning.emotionalMovement !== persistedPlanning.emotionalMovement
      ? "emotionalMovement"
      : null,
    planning.setupPayoffNotes !== persistedPlanning.setupPayoffNotes
      ? "setupPayoffNotes"
      : null,
    !areStringListsEqual(
      planning.characterFocusIds,
      persistedPlanning.characterFocusIds,
    )
      ? "characterFocusIds"
      : null,
  ].filter((value): value is string => Boolean(value));
}

export function ChapterDetailView() {
  const navigate = useNavigate();
  const { chapterId } = useParams({ from: "/chapters/$chapterId" });
  const snapshotQuery = useProjectSnapshot();
  const { saveChapter, saveScene } = useProjectRuntime();
  const setSelectedChapterId = useUiStore((state) => state.setSelectedChapterId);
  const snapshot = snapshotQuery.data;

  const chapter = snapshot?.chapters.find((item) => item.id === chapterId);
  const [planning, setPlanning] = useState<ChapterPlanningState>(() =>
    chapter ? buildChapterPlanningState(chapter) : emptyChapterPlanningState(),
  );
  const [persistedPlanning, setPersistedPlanning] = useState<ChapterPlanningState>(() =>
    chapter ? buildChapterPlanningState(chapter) : emptyChapterPlanningState(),
  );
  const planningRef = useRef(planning);
  const activeChapterIdRef = useRef<string | null>(null);

  useEffect(() => {
    planningRef.current = planning;
  }, [planning]);

  useEffect(() => {
    if (!chapter) {
      return;
    }

    const nextPersistedPlanning = buildChapterPlanningState(chapter);
    const chapterChanged = activeChapterIdRef.current !== chapter.id;
    activeChapterIdRef.current = chapter.id;

    setPersistedPlanning((currentPersistedPlanning) => {
      if (
        chapterChanged ||
        arePlanningStatesEqual(planningRef.current, currentPersistedPlanning)
      ) {
        setPlanning(nextPersistedPlanning);
      }
      return nextPersistedPlanning;
    });
    setSelectedChapterId(chapter.id);
  }, [chapter, setSelectedChapterId]);

  if (!snapshot) {
    return null;
  }

  if (!chapter) {
    return (
      <Panel>
        <EmptyState
          title="Chapter not found"
          description="The requested chapter could not be found in the current project."
        />
      </Panel>
    );
  }

  const currentSnapshot = snapshot;
  const currentChapter = chapter;
  const chapterScenes = currentSnapshot.scenes
    .filter((scene) => scene.chapterId === currentChapter.id)
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const focusedCharacters = currentSnapshot.characters.filter((character) =>
    planning.characterFocusIds.includes(character.id),
  );
  const chapterDirty = !arePlanningStatesEqual(planning, persistedPlanning);
  const canSave = planning.title.trim().length > 0;

  function updatePlanningField<Key extends keyof ChapterPlanningState>(
    field: Key,
    value: ChapterPlanningState[Key],
  ) {
    setPlanning((current) => ({ ...current, [field]: value }));
  }

  async function handleSaveChapter() {
    if (!chapterDirty || !canSave) {
      return;
    }

    await saveChapter(
      {
        id: currentChapter.id,
        projectId: currentChapter.projectId,
        title: planning.title.trim(),
        summary: planning.summary,
        purpose: planning.purpose,
        majorEvents: splitLines(planning.majorEvents),
        emotionalMovement: planning.emotionalMovement,
        characterFocusIds: planning.characterFocusIds,
        setupPayoffNotes: planning.setupPayoffNotes,
        orderIndex: currentChapter.orderIndex,
      },
      {
        id: crypto.randomUUID(),
        projectId: currentChapter.projectId,
        occurredAt: new Date().toISOString(),
        type: "chapter.updated",
        chapterId: currentChapter.id,
        changedFields: getChangedFields(planning, persistedPlanning),
      },
    );
  }

  async function handleCreateScene() {
    await saveScene(
      createEmptySceneInput({
        projectId: currentSnapshot.project.id,
        chapterId: currentChapter.id,
        orderIndex: chapterScenes.length,
        title: `Scene ${chapterScenes.length + 1}`,
      }),
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]">
      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title={currentChapter.title}
          description="Plan the chapter above the prose level: define why it exists, what it changes, and how its scenes ladder upward."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate({ to: "/chapters" })}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={() => void handleSaveChapter()} disabled={!chapterDirty || !canSave}>
                <Save className="size-4" />
                {chapterDirty ? "Save Chapter" : "Saved"}
              </Button>
            </div>
          }
        />

        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone="accent">Chapter {currentChapter.orderIndex + 1}</Badge>
          <Badge>{chapterScenes.length} scene{chapterScenes.length === 1 ? "" : "s"}</Badge>
          {planning.emotionalMovement ? <Badge>{planning.emotionalMovement}</Badge> : null}
          {focusedCharacters.map((character) => (
            <Badge key={character.id}>{character.name}</Badge>
          ))}
        </div>

        <div className="mt-6 grid gap-4">
          <Field label="Title">
            <Input
              value={planning.title}
              onChange={(event) => updatePlanningField("title", event.target.value)}
              placeholder="Chapter title"
            />
          </Field>

          <Field
            label="Chapter Summary"
            hint="What happens here at the chapter level?"
          >
            <Textarea
              className="min-h-28"
              value={planning.summary}
              onChange={(event) => updatePlanningField("summary", event.target.value)}
              placeholder="Summarize the chapter's visible movement."
            />
          </Field>

          <Field
            label="Chapter Purpose"
            hint="Why does this chapter exist in the story?"
          >
            <Textarea
              className="min-h-32"
              value={planning.purpose}
              onChange={(event) => updatePlanningField("purpose", event.target.value)}
              placeholder="Clarify the chapter's structural job."
            />
          </Field>

          <Field label="Emotional Movement">
            <Input
              value={planning.emotionalMovement}
              onChange={(event) =>
                updatePlanningField("emotionalMovement", event.target.value)
              }
              placeholder="Example: suspicion to uneasy alliance"
            />
          </Field>

          <Field label="Major Events" hint="One structural turn per line">
            <Textarea
              className="min-h-32"
              value={planning.majorEvents}
              onChange={(event) =>
                updatePlanningField("majorEvents", event.target.value)
              }
              placeholder={
                "Opening disturbance\nEscalation or reveal\nDecision or irreversible turn"
              }
            />
          </Field>

          <Field label="Character Focus">
            {currentSnapshot.characters.length > 0 ? (
              <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
                {currentSnapshot.characters.map((character) => (
                  <label
                    key={character.id}
                    className="flex items-center gap-2 text-sm text-[var(--ink)]"
                  >
                    <input
                      type="checkbox"
                      checked={planning.characterFocusIds.includes(character.id)}
                      onChange={(event) =>
                        updatePlanningField(
                          "characterFocusIds",
                          event.target.checked
                            ? [...planning.characterFocusIds, character.id]
                            : planning.characterFocusIds.filter((id) => id !== character.id),
                        )
                      }
                    />
                    {character.name}
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No characters yet"
                description="Add characters to tag who this chapter primarily advances."
              />
            )}
          </Field>

          <Field label="Setup / Payoff Notes">
            <Textarea
              className="min-h-28"
              value={planning.setupPayoffNotes}
              onChange={(event) =>
                updatePlanningField("setupPayoffNotes", event.target.value)
              }
              placeholder="Track promises, reversals, and later payoffs seeded here."
            />
          </Field>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <SectionHeading
          title="Scene Plan"
          description="Scenes stay in the authoritative backend order for this chapter. Add new scenes here, then jump into any scene workspace when you need detail."
          actions={
            <Button onClick={() => void handleCreateScene()}>
              <Plus className="size-4" />
              Add Scene
            </Button>
          }
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
          <Panel className="bg-white/75 shadow-none">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Target className="size-4" />
              <h3 className="font-semibold">Chapter Intent</h3>
            </div>
            <div className="mt-3 grid gap-3 text-sm text-[var(--ink-muted)]">
              <div>
                <p className="font-semibold text-[var(--ink)]">Purpose</p>
                <p className="mt-1">{planning.purpose || "Not defined yet."}</p>
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">Summary</p>
                <p className="mt-1">{planning.summary || "No chapter summary yet."}</p>
              </div>
            </div>
          </Panel>

          <Panel className="bg-white/75 shadow-none">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Users className="size-4" />
              <h3 className="font-semibold">Focus Snapshot</h3>
            </div>
            <div className="mt-3 grid gap-3 text-sm text-[var(--ink-muted)]">
              <div>
                <p className="font-semibold text-[var(--ink)]">Emotional movement</p>
                <p className="mt-1">
                  {planning.emotionalMovement || "Not defined yet."}
                </p>
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)]">Character focus</p>
                <p className="mt-1">
                  {focusedCharacters.length > 0
                    ? focusedCharacters.map((character) => character.name).join(", ")
                    : "Not defined yet."}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink-muted)]">
            <ListOrdered className="size-4" />
            Scene order comes from the chapter's saved story structure.
          </div>

          <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1">
            {chapterScenes.length > 0 ? (
              chapterScenes.map((scene, index) => (
                <button
                  key={scene.id}
                  className="rounded-3xl border border-black/8 bg-white/78 p-5 text-left transition hover:border-[color:rgba(184,88,63,0.34)] hover:bg-white"
                  onClick={() =>
                    void navigate({
                      to: "/scenes/$sceneId",
                      params: { sceneId: scene.id },
                    })
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <Badge tone="accent">{index + 1}</Badge>
                        <h3 className="text-base font-semibold text-[var(--ink)]">
                          {scene.title}
                        </h3>
                      </div>
                      <p className="mt-3 text-sm text-[var(--ink-muted)]">
                        {scene.summary || "No scene summary yet."}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm text-[var(--ink-faint)]">
                      <FileText className="size-4" />
                      Open
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-[var(--ink-muted)] lg:grid-cols-2">
                    <div>
                      <p className="font-semibold text-[var(--ink)]">Scene purpose</p>
                      <p className="mt-1">{scene.purpose || "Not defined yet."}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--ink)]">Scene footing</p>
                      <p className="mt-1">
                        {[scene.location, scene.timeLabel].filter(Boolean).join(" · ") ||
                          "Location and time not set."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {scene.outcome ? <Badge>{scene.outcome}</Badge> : null}
                    {scene.povCharacterId ? (
                      <Badge>
                        POV{" "}
                        {currentSnapshot.characters.find(
                          (character) => character.id === scene.povCharacterId,
                        )?.name ?? "Character"}
                      </Badge>
                    ) : null}
                    {scene.dependencySceneIds.length > 0 ? (
                      <Badge>{scene.dependencySceneIds.length} dependency link{scene.dependencySceneIds.length === 1 ? "" : "s"}</Badge>
                    ) : null}
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                title="No scenes in this chapter yet"
                description="Create the first scene here to start turning chapter intent into scene-level structure."
                action={
                  <Button onClick={() => void handleCreateScene()}>
                    <Plus className="size-4" />
                    Create First Scene
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
