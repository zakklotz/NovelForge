import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlertTriangle,
  BookOpen,
  FileText,
  ListOrdered,
  Save,
  Sparkles,
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
  Select,
  Textarea,
} from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { cn, splitCommaSeparated } from "@/lib/utils";
import type { ProjectSnapshot, Suggestion } from "@novelforge/domain";

type SceneWorkspaceTab = "overview" | "beats" | "draft";

function findRelatedSuggestions(sceneId: string, suggestions: Suggestion[]) {
  return suggestions.filter(
    (suggestion) =>
      suggestion.sourceObject.id === sceneId ||
      suggestion.impactedObject.id === sceneId ||
      suggestion.evidenceRefs.some((evidence) => evidence.id === sceneId),
  );
}

function buildStoryOrderedScenes(snapshot: ProjectSnapshot) {
  const chapterOrder = new Map(
    [...snapshot.chapters]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((chapter, index) => [chapter.id, index]),
  );

  return [...snapshot.scenes].sort((left, right) => {
    const leftChapterOrder =
      left.chapterId === null
        ? Number.MAX_SAFE_INTEGER
        : chapterOrder.get(left.chapterId) ?? Number.MAX_SAFE_INTEGER;
    const rightChapterOrder =
      right.chapterId === null
        ? Number.MAX_SAFE_INTEGER
        : chapterOrder.get(right.chapterId) ?? Number.MAX_SAFE_INTEGER;

    return (
      leftChapterOrder - rightChapterOrder ||
      left.orderIndex - right.orderIndex ||
      left.title.localeCompare(right.title)
    );
  });
}

function areListsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function SceneWorkspaceView() {
  const navigate = useNavigate();
  const { sceneId } = useParams({ from: "/scenes/$sceneId" });
  const snapshotQuery = useProjectSnapshot();
  const { saveScene, saveManuscript } = useProjectRuntime();
  const snapshot = snapshotQuery.data;

  const scene = snapshot?.scenes.find((item) => item.id === sceneId);
  const chapter = snapshot?.chapters.find((item) => item.id === scene?.chapterId);
  const relatedCharacters =
    snapshot?.characters.filter(
      (character) =>
        scene?.involvedCharacterIds.includes(character.id) ||
        scene?.povCharacterId === character.id,
    ) ?? [];
  const relatedSuggestions = scene
    ? findRelatedSuggestions(scene.id, snapshot?.suggestions ?? [])
    : [];
  const chapterScenes =
    snapshot?.scenes
      .filter((item) => item.chapterId === scene?.chapterId)
      .sort((left, right) => left.orderIndex - right.orderIndex) ?? [];
  const storyOrderedScenes = snapshot ? buildStoryOrderedScenes(snapshot) : [];
  const chapterById = new Map(snapshot?.chapters.map((item) => [item.id, item]) ?? []);

  const [workspaceTab, setWorkspaceTab] = useState<SceneWorkspaceTab>("overview");
  const [draft, setDraft] = useState(scene?.manuscriptText ?? "<p></p>");
  const [title, setTitle] = useState(scene?.title ?? "");
  const [summary, setSummary] = useState(scene?.summary ?? "");
  const [purpose, setPurpose] = useState(scene?.purpose ?? "");
  const [beatOutline, setBeatOutline] = useState(scene?.beatOutline ?? "");
  const [conflict, setConflict] = useState(scene?.conflict ?? "");
  const [outcome, setOutcome] = useState(scene?.outcome ?? "");
  const [location, setLocation] = useState(scene?.location ?? "");
  const [timeLabel, setTimeLabel] = useState(scene?.timeLabel ?? "");
  const [povCharacterId, setPovCharacterId] = useState(scene?.povCharacterId ?? "");
  const [continuityTags, setContinuityTags] = useState(
    scene?.continuityTags.join(", ") ?? "",
  );
  const [involvedCharacterIds, setInvolvedCharacterIds] = useState<string[]>(
    scene?.involvedCharacterIds ?? [],
  );
  const [dependencySceneIds, setDependencySceneIds] = useState<string[]>(
    scene?.dependencySceneIds ?? [],
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    setWorkspaceTab("overview");
    setDraft(scene.manuscriptText);
    setTitle(scene.title);
    setSummary(scene.summary);
    setPurpose(scene.purpose);
    setBeatOutline(scene.beatOutline);
    setConflict(scene.conflict);
    setOutcome(scene.outcome);
    setLocation(scene.location);
    setTimeLabel(scene.timeLabel);
    setPovCharacterId(scene.povCharacterId ?? "");
    setContinuityTags(scene.continuityTags.join(", "));
    setInvolvedCharacterIds(scene.involvedCharacterIds);
    setDependencySceneIds(scene.dependencySceneIds);
  }, [scene?.id]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: scene?.manuscriptText ?? "<p></p>",
    onUpdate: ({ editor: currentEditor }) => {
      const nextDraft = currentEditor.getHTML();
      setDraft((currentDraft) =>
        currentDraft === nextDraft ? currentDraft : nextDraft,
      );
    },
    editorProps: {
      attributes: {
        class: "prose-editor",
      },
    },
  });

  useEffect(() => {
    if (!editor || !scene) {
      return;
    }

    if (editor.getHTML() !== scene.manuscriptText) {
      editor.commands.setContent(scene.manuscriptText, false);
    }
  }, [editor, scene?.id, scene?.manuscriptText]);

  useEffect(() => {
    if (!scene || draft === scene.manuscriptText) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveManuscript({
        projectId: scene.projectId,
        sceneId: scene.id,
        manuscriptText: draft,
      }).catch(() => undefined);
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [draft, saveManuscript, scene]);

  if (!snapshot || !scene) {
    return (
      <Panel>
        <EmptyState
          title="Scene not found"
          description="The requested scene could not be found in the current project."
        />
      </Panel>
    );
  }

  const currentScene = scene;
  const normalizedContinuityTags = splitCommaSeparated(continuityTags);
  const metadataChangedFields = [
    title !== currentScene.title ? "title" : null,
    summary !== currentScene.summary ? "summary" : null,
    purpose !== currentScene.purpose ? "purpose" : null,
    beatOutline !== currentScene.beatOutline ? "beatOutline" : null,
    conflict !== currentScene.conflict ? "conflict" : null,
    outcome !== currentScene.outcome ? "outcome" : null,
    location !== currentScene.location ? "location" : null,
    timeLabel !== currentScene.timeLabel ? "timeLabel" : null,
    (povCharacterId || null) !== currentScene.povCharacterId ? "povCharacterId" : null,
    !areListsEqual(normalizedContinuityTags, currentScene.continuityTags)
      ? "continuityTags"
      : null,
    !areListsEqual(involvedCharacterIds, currentScene.involvedCharacterIds)
      ? "involvedCharacterIds"
      : null,
    !areListsEqual(dependencySceneIds, currentScene.dependencySceneIds)
      ? "dependencySceneIds"
      : null,
  ].filter((value): value is string => Boolean(value));
  const metadataDirty = metadataChangedFields.length > 0;
  const scenePosition = chapterScenes.findIndex((item) => item.id === currentScene.id);
  const structuralPrompts = [
    purpose
      ? `Scene purpose: ${purpose}`
      : "Clarify why this scene belongs in the story at all.",
    beatOutline.trim()
      ? "Check that each beat changes pressure, information, or emotional position."
      : "Sketch the scene in 3 to 5 beats before polishing the prose.",
    outcome
      ? `Exit change: ${outcome}`
      : "Decide what is different by the end of the scene.",
  ];

  async function handleSaveMetadata() {
    if (!metadataDirty) {
      return;
    }

    await saveScene(
      {
        ...currentScene,
        title,
        summary,
        purpose,
        beatOutline,
        conflict,
        outcome,
        location,
        timeLabel,
        povCharacterId: povCharacterId || null,
        continuityTags: normalizedContinuityTags,
        involvedCharacterIds,
        dependencySceneIds,
        manuscriptText: draft,
      },
      {
        id: crypto.randomUUID(),
        projectId: currentScene.projectId,
        occurredAt: new Date().toISOString(),
        type: "scene.updated",
        sceneId: currentScene.id,
        changedFields: metadataChangedFields,
      },
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Scene Frame"
          description="Keep the scene's title, cast pressure, and continuity anchored while you plan and draft."
          actions={
            <Button onClick={handleSaveMetadata} disabled={!metadataDirty}>
              <Save className="size-4" />
              {metadataDirty ? "Save Planning" : "Planning Saved"}
            </Button>
          }
        />
        <p className="mt-4 text-sm text-[var(--ink-muted)]">
          {metadataDirty
            ? "Planning changes are local until you save them."
            : "Planning fields are in sync with the project snapshot."}
        </p>
        <div className="mt-6 grid gap-4">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Story Slot">
            <Input
              readOnly
              value={
                chapter && scenePosition >= 0
                  ? `${chapter.title} · Scene ${scenePosition + 1} of ${chapterScenes.length}`
                  : "Unassigned scene"
              }
            />
          </Field>
          <Field label="POV Character">
            <Select
              value={povCharacterId}
              onChange={(event) => setPovCharacterId(event.target.value)}
            >
              <option value="">No POV selected</option>
              {snapshot.characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <Field label="Location">
              <Input value={location} onChange={(event) => setLocation(event.target.value)} />
            </Field>
            <Field label="Time">
              <Input value={timeLabel} onChange={(event) => setTimeLabel(event.target.value)} />
            </Field>
          </div>
          <Field label="Continuity Tags" hint="Comma-separated">
            <Input
              value={continuityTags}
              onChange={(event) => setContinuityTags(event.target.value)}
            />
          </Field>
          <Field label="Involved Characters">
            <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
              {snapshot.characters.map((character) => (
                <label
                  key={character.id}
                  className="flex items-center gap-2 text-sm text-[var(--ink)]"
                >
                  <input
                    type="checkbox"
                    checked={involvedCharacterIds.includes(character.id)}
                    onChange={(event) =>
                      setInvolvedCharacterIds((current) =>
                        event.target.checked
                          ? [...current, character.id]
                          : current.filter((value) => value !== character.id),
                      )
                    }
                  />
                  {character.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Dependencies">
            <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
              {storyOrderedScenes
                .filter((candidate) => candidate.id !== currentScene.id)
                .map((candidate) => {
                  const candidateChapter = candidate.chapterId
                    ? chapterById.get(candidate.chapterId)
                    : null;

                  return (
                    <label
                      key={candidate.id}
                      className="grid gap-1 text-sm text-[var(--ink)]"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={dependencySceneIds.includes(candidate.id)}
                          onChange={(event) =>
                            setDependencySceneIds((current) =>
                              event.target.checked
                                ? [...current, candidate.id]
                                : current.filter((value) => value !== candidate.id),
                            )
                          }
                        />
                        {candidate.title}
                      </span>
                      <span className="pl-6 text-xs text-[var(--ink-faint)]">
                        {candidateChapter ? candidateChapter.title : "Unassigned"}
                      </span>
                    </label>
                  );
                })}
            </div>
          </Field>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <SectionHeading
          title={title || currentScene.title}
          description={
            chapter
              ? `${chapter.title} · ${timeLabel || "Time not set"}`
              : "Unassigned chapter"
          }
        />
        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl bg-white/60 p-1">
          {[
            { id: "overview", label: "Overview", icon: Target },
            { id: "beats", label: "Beats", icon: ListOrdered },
            { id: "draft", label: "Draft", icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = workspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-muted)] hover:bg-white",
                )}
                onClick={() => setWorkspaceTab(tab.id as SceneWorkspaceTab)}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {workspaceTab === "overview" ? (
          <div className="mt-6 grid gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
            <Field label="Summary" className="lg:col-span-2">
              <Textarea
                className="min-h-28"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="What happens in this scene at a high level?"
              />
            </Field>
            <Field label="Purpose">
              <Textarea
                className="min-h-32"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Why does this scene exist in the story?"
              />
            </Field>
            <Field label="Outcome">
              <Textarea
                className="min-h-32"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                placeholder="What changes by the end of the scene?"
              />
            </Field>
            <Field label="Conflict" className="lg:col-span-2">
              <Textarea
                className="min-h-32"
                value={conflict}
                onChange={(event) => setConflict(event.target.value)}
                placeholder="What pressure, opposition, or contradiction drives the scene?"
              />
            </Field>
          </div>
        ) : null}

        {workspaceTab === "beats" ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
            <Field label="Beat Outline" hint="One beat per line">
              <Textarea
                className="min-h-[18rem] flex-1"
                value={beatOutline}
                onChange={(event) => setBeatOutline(event.target.value)}
                placeholder={
                  "Opening image or status quo\nPressure enters\nTurn or reveal\nDecision\nExit state"
                }
              />
            </Field>
            <div className="grid gap-3 lg:grid-cols-3">
              {structuralPrompts.map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-2xl border border-black/8 bg-white/72 px-4 py-4 text-sm text-[var(--ink-muted)]"
                >
                  {prompt}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {workspaceTab === "draft" ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-4 text-sm text-[var(--ink-muted)]">
              <span>Draft prose stays separate from scene planning and autosaves after a pause.</span>
              <span>{draft === currentScene.manuscriptText ? "Saved" : "Saving soon..."}</span>
            </div>
            <div className="prose-editor mt-4 flex-1 rounded-[2rem] border border-black/8 bg-white/82 p-6 shadow-inner">
              <EditorContent editor={editor} />
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Context"
          description="Keep chapter placement, nearby scenes, characters, and current analysis visible while you work."
        />

        <div className="mt-6 space-y-4">
          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <BookOpen className="size-4" />
              <h3 className="font-semibold">Parent Chapter</h3>
            </div>
            {chapter ? (
              <div className="mt-3 grid gap-3 text-sm text-[var(--ink-muted)]">
                <div>
                  <p className="font-semibold text-[var(--ink)]">{chapter.title}</p>
                  <p className="mt-1">{chapter.summary || "No chapter summary yet."}</p>
                </div>
                <div>
                  <span className="font-semibold text-[var(--ink)]">Purpose:</span>{" "}
                  {chapter.purpose || "Not defined yet."}
                </div>
                <div>
                  <span className="font-semibold text-[var(--ink)]">Emotional movement:</span>{" "}
                  {chapter.emotionalMovement || "Not defined yet."}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No parent chapter"
                description="Assign this scene to a chapter to see its structural context here."
              />
            )}
          </Panel>

          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Sparkles className="size-4" />
              <h3 className="font-semibold">Nearby Scenes</h3>
            </div>
            {chapterScenes.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {chapterScenes.map((item, index) => (
                  <button
                    key={item.id}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-left transition",
                      item.id === currentScene.id
                        ? "border-[color:rgba(184,88,63,0.34)] bg-white"
                        : "border-black/8 bg-white/70 hover:bg-white",
                    )}
                    onClick={() =>
                      void navigate({
                        to: "/scenes/$sceneId",
                        params: { sceneId: item.id },
                      })
                    }
                  >
                    <div className="flex items-start gap-3">
                      <Badge tone={item.id === currentScene.id ? "accent" : "default"}>
                        {index + 1}
                      </Badge>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                        <p className="mt-1 text-sm text-[var(--ink-muted)]">
                          {item.summary || "No summary yet."}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No nearby scenes yet"
                description="Once this chapter has more scenes, they will appear here in story order."
              />
            )}
          </Panel>

          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <Users className="size-4" />
              <h3 className="font-semibold">Relevant Characters</h3>
            </div>
            {relatedCharacters.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {relatedCharacters.map((character) => (
                  <div
                    key={character.id}
                    className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-[var(--ink)]">{character.name}</h4>
                        <p className="mt-1 text-sm text-[var(--ink-muted)]">
                          {character.role || "Role not defined yet."}
                        </p>
                      </div>
                      {currentScene.povCharacterId === character.id ? (
                        <Badge tone="accent">POV</Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-[var(--ink-muted)]">
                      <div>
                        <span className="font-semibold text-[var(--ink)]">Speaking style:</span>{" "}
                        {character.speakingStyle || "Not defined yet."}
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--ink)]">Arc direction:</span>{" "}
                        {character.arcDirection || "Not defined yet."}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No linked characters"
                description="Add involved characters or a POV character to keep their story pressure visible here."
              />
            )}
          </Panel>

          <Panel className="bg-white/75">
            <div className="flex items-center gap-2 text-[var(--accent-strong)]">
              <AlertTriangle className="size-4" />
              <h3 className="font-semibold">Suggestions + Analysis</h3>
            </div>
            {relatedSuggestions.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {relatedSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{suggestion.title}</p>
                        <p className="mt-2 text-sm text-[var(--ink-muted)]">
                          {suggestion.rationale}
                        </p>
                      </div>
                      <Badge
                        tone={
                          suggestion.severity === "high"
                            ? "danger"
                            : suggestion.severity === "medium"
                              ? "warning"
                              : "default"
                        }
                      >
                        {suggestion.severity}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No scene-specific suggestions"
                description="Continuity and structure suggestions connected to this scene will appear here."
              />
            )}
          </Panel>
        </div>
      </Panel>
    </div>
  );
}
