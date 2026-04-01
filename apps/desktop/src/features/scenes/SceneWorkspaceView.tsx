import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { AlertTriangle, BookOpen, Save, Sparkles, Users } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, EmptyState, Field, Input, Panel, SectionHeading, Select, Textarea } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { splitCommaSeparated } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import type { Suggestion } from "@novelforge/domain";

function buildRelatedSuggestionIds(sceneId: string, suggestions: Suggestion[]) {
  return suggestions.filter(
    (suggestion) =>
      suggestion.sourceObject.id === sceneId ||
      suggestion.impactedObject.id === sceneId ||
      suggestion.evidenceRefs.some((evidence) => evidence.id === sceneId),
  );
}

export function SceneWorkspaceView() {
  const { sceneId } = useParams({ from: "/scenes/$sceneId" });
  const snapshotQuery = useProjectSnapshot();
  const { saveScene, saveManuscript } = useProjectRuntime();
  const [sidebarTab, setSidebarTab] = useUiStore(useShallow((state) => [
    state.sceneSidebarTab,
    state.setSceneSidebarTab,
  ]));
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
    ? buildRelatedSuggestionIds(scene.id, snapshot?.suggestions ?? [])
    : [];

  const [draft, setDraft] = useState(scene?.manuscriptText ?? "<p></p>");
  const [title, setTitle] = useState(scene?.title ?? "");
  const [summary, setSummary] = useState(scene?.summary ?? "");
  const [purpose, setPurpose] = useState(scene?.purpose ?? "");
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
    setDraft(scene.manuscriptText);
    setTitle(scene.title);
    setSummary(scene.summary);
    setPurpose(scene.purpose);
    setConflict(scene.conflict);
    setOutcome(scene.outcome);
    setLocation(scene.location);
    setTimeLabel(scene.timeLabel);
    setPovCharacterId(scene.povCharacterId ?? "");
    setContinuityTags(scene.continuityTags.join(", "));
    setInvolvedCharacterIds(scene.involvedCharacterIds);
    setDependencySceneIds(scene.dependencySceneIds);
  }, [scene]);

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
  }, [editor, scene]);

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

  const currentSnapshot = snapshot;
  const currentScene = scene;

  async function handleSaveMetadata() {
    await saveScene(
      {
        ...currentScene,
        title,
        summary,
        purpose,
        conflict,
        outcome,
        location,
        timeLabel,
        povCharacterId: povCharacterId || null,
        continuityTags: splitCommaSeparated(continuityTags),
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
        changedFields: [
          "title",
          "summary",
          "purpose",
          "conflict",
          "outcome",
          "location",
          "timeLabel",
          "continuityTags",
          "dependencySceneIds",
        ],
      },
    );
  }

  const sceneOrder = currentSnapshot.scenes
    .filter((item) => item.chapterId === currentScene.chapterId)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const structuralPrompts = [
    scene.purpose ? `Push the scene toward: ${scene.purpose}` : "Clarify what this scene must accomplish.",
    chapter?.purpose ? `Stay aligned with the chapter goal: ${chapter.purpose}` : "Consider how this scene advances its chapter.",
    scene.outcome ? `Make the outcome land harder: ${scene.outcome}` : "Decide how the scene ends differently than it begins.",
  ];

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Scene Metadata"
          description="Keep story logic attached to the prose while you draft."
          actions={
            <Button onClick={handleSaveMetadata}>
              <Save className="size-4" />
              Save Details
            </Button>
          }
        />
        <div className="mt-6 grid gap-4">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Summary">
            <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
          </Field>
          <Field label="Purpose">
            <Textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </Field>
          <Field label="Conflict">
            <Textarea value={conflict} onChange={(event) => setConflict(event.target.value)} />
          </Field>
          <Field label="Outcome">
            <Textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(event) => setLocation(event.target.value)} />
          </Field>
          <Field label="Time">
            <Input value={timeLabel} onChange={(event) => setTimeLabel(event.target.value)} />
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
          <Field label="Continuity Tags" hint="Comma-separated">
            <Input
              value={continuityTags}
              onChange={(event) => setContinuityTags(event.target.value)}
            />
          </Field>
          <Field label="Involved Characters">
            <div className="grid gap-2 rounded-2xl border border-black/8 bg-white/60 p-3">
              {snapshot.characters.map((character) => (
                <label key={character.id} className="flex items-center gap-2 text-sm text-[var(--ink)]">
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
              {snapshot.scenes
                .filter((candidate) => candidate.id !== scene.id)
                .map((candidate) => (
                  <label key={candidate.id} className="flex items-center gap-2 text-sm text-[var(--ink)]">
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
                  </label>
                ))}
            </div>
          </Field>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <SectionHeading
          title={scene.title}
          description={chapter ? `${chapter.title} · ${scene.timeLabel || "Time not set"}` : "Unassigned chapter"}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {sceneOrder.map((item) => (
            <Badge key={item.id} tone={item.id === scene.id ? "accent" : "default"}>
              {item.title}
            </Badge>
          ))}
        </div>
        <div className="prose-editor mt-6 flex-1 rounded-[2rem] border border-black/8 bg-white/82 p-6 shadow-inner">
          <EditorContent editor={editor} />
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-[var(--ink-muted)]">
          <span>Autosaves after a short pause.</span>
          <span>{draft === scene.manuscriptText ? "Saved" : "Saving soon..."}</span>
        </div>
      </Panel>

      <Panel className="min-h-0 overflow-y-auto">
        <div className="flex gap-2 rounded-2xl bg-white/60 p-1">
          {[
            { id: "chapter", label: "Chapter", icon: BookOpen },
            { id: "characters", label: "Characters", icon: Users },
            { id: "warnings", label: "Warnings", icon: AlertTriangle },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = sidebarTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-muted)] hover:bg-white"
                }`}
                onClick={() => setSidebarTab(tab.id as never)}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {sidebarTab === "chapter" ? (
          <div className="mt-6 space-y-4">
            <SectionHeading
              title="Parent Chapter"
              description={chapter?.summary || "This scene is currently unassigned."}
            />
            {chapter ? (
              <>
                <Field label="Chapter Purpose">
                  <Textarea readOnly value={chapter.purpose} />
                </Field>
                <Field label="Emotional Movement">
                  <Input readOnly value={chapter.emotionalMovement} />
                </Field>
              </>
            ) : null}

            <Panel className="bg-white/75">
              <div className="flex items-center gap-2 text-[var(--accent-strong)]">
                <Sparkles className="size-4" />
                <h3 className="font-semibold">Suggested next beats</h3>
              </div>
              <ul className="mt-3 grid gap-2 text-sm text-[var(--ink-muted)]">
                {structuralPrompts.map((prompt) => (
                  <li key={prompt} className="rounded-2xl bg-white/70 px-3 py-3">
                    {prompt}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        ) : null}

        {sidebarTab === "characters" ? (
          <div className="mt-6 space-y-4">
            <SectionHeading
              title="Relevant Characters"
              description="Keep voice, worldview, and arc pressure visible while drafting."
            />
            {relatedCharacters.map((character) => (
              <Panel key={character.id} className="bg-white/75">
                <h3 className="text-base font-semibold text-[var(--ink)]">
                  {character.name}
                </h3>
                <p className="mt-2 text-sm text-[var(--ink-muted)]">
                  {character.role}
                </p>
                <div className="mt-4 grid gap-3 text-sm text-[var(--ink-muted)]">
                  <div>
                    <span className="font-semibold text-[var(--ink)]">Speaking style:</span>{" "}
                    {character.speakingStyle || "Not defined yet."}
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)]">Vocabulary:</span>{" "}
                    {character.vocabularyTendencies || "Not defined yet."}
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--ink)]">Arc direction:</span>{" "}
                    {character.arcDirection || "Not defined yet."}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        ) : null}

        {sidebarTab === "warnings" ? (
          <div className="mt-6 space-y-4">
            <SectionHeading
              title="Continuity + Revision Warnings"
              description="Suggestions generated from scene dependencies, chapter fit, and character changes."
            />
            {relatedSuggestions.length > 0 ? (
              relatedSuggestions.map((suggestion) => (
                <Panel key={suggestion.id} className="bg-white/80">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[var(--ink)]">
                        {suggestion.title}
                      </h3>
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
                </Panel>
              ))
            ) : (
              <EmptyState
                title="No warnings yet"
                description="This scene currently has no open continuity or structure suggestions."
              />
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
