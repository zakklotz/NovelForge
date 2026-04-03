import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Character, Relationship } from "@novelforge/domain";
import { Plus, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, EmptyState, Field, Input, Panel, SectionHeading, Select, Textarea } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";
import { createId } from "@/lib/ids";
import { splitCommaSeparated } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";

function CharacterEditor({ character }: { character: Character }) {
  const snapshotQuery = useProjectSnapshot();
  const { saveCharacter } = useProjectRuntime();
  const [name, setName] = useState(character.name);
  const [role, setRole] = useState(character.role);
  const [traits, setTraits] = useState(character.personalityTraits.join(", "));
  const [motivations, setMotivations] = useState(character.motivations);
  const [fears, setFears] = useState(character.fears);
  const [worldview, setWorldview] = useState(character.worldview);
  const [speakingStyle, setSpeakingStyle] = useState(character.speakingStyle);
  const [vocabularyTendencies, setVocabularyTendencies] = useState(
    character.vocabularyTendencies,
  );
  const [speechRhythm, setSpeechRhythm] = useState(character.speechRhythm);
  const [emotionalBaseline, setEmotionalBaseline] = useState(character.emotionalBaseline);
  const [secrets, setSecrets] = useState(character.secrets);
  const [arcDirection, setArcDirection] = useState(character.arcDirection);
  const [contradictions, setContradictions] = useState(character.contradictions);
  const [relationships, setRelationships] = useState<Relationship[]>(character.relationships);

  useEffect(() => {
    setName(character.name);
    setRole(character.role);
    setTraits(character.personalityTraits.join(", "));
    setMotivations(character.motivations);
    setFears(character.fears);
    setWorldview(character.worldview);
    setSpeakingStyle(character.speakingStyle);
    setVocabularyTendencies(character.vocabularyTendencies);
    setSpeechRhythm(character.speechRhythm);
    setEmotionalBaseline(character.emotionalBaseline);
    setSecrets(character.secrets);
    setArcDirection(character.arcDirection);
    setContradictions(character.contradictions);
    setRelationships(character.relationships);
  }, [character]);

  const otherCharacters =
    snapshotQuery.data?.characters.filter((item) => item.id !== character.id) ?? [];
  const linkedScenes =
    snapshotQuery.data?.scenes.filter(
      (scene) =>
        scene.povCharacterId === character.id ||
        scene.involvedCharacterIds.includes(character.id),
    ) ?? [];
  const affectedSuggestions =
    snapshotQuery.data?.suggestions.filter(
      (suggestion) =>
        suggestion.sourceObject.id === character.id ||
        suggestion.impactedObject.id === character.id,
    ) ?? [];

  async function handleSave() {
    await saveCharacter(
      {
        ...character,
        name,
        role,
        personalityTraits: splitCommaSeparated(traits),
        motivations,
        fears,
        worldview,
        speakingStyle,
        vocabularyTendencies,
        speechRhythm,
        emotionalBaseline,
        secrets,
        arcDirection,
        contradictions,
        relationships: relationships.filter((item) => item.characterId && item.summary.trim()),
      },
      {
        id: crypto.randomUUID(),
        projectId: character.projectId,
        occurredAt: new Date().toISOString(),
        type: "character.updated",
        characterId: character.id,
        changedFields: [
          "speakingStyle",
          "vocabularyTendencies",
          "speechRhythm",
          "motivations",
          "arcDirection",
        ],
      },
    );
  }

  return (
    <Panel className="h-full overflow-y-auto">
      <SectionHeading
        title="Character Card"
        description="Keep voice and behavioral logic coherent as the manuscript shifts."
        actions={<Button onClick={handleSave}>Save Character</Button>}
      />
      <div className="mt-6 grid gap-4">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Role">
          <Input value={role} onChange={(event) => setRole(event.target.value)} />
        </Field>
        <Field label="Personality Traits" hint="Comma-separated">
          <Input value={traits} onChange={(event) => setTraits(event.target.value)} />
        </Field>
        <Field label="Motivations">
          <Textarea value={motivations} onChange={(event) => setMotivations(event.target.value)} />
        </Field>
        <Field label="Fears">
          <Textarea value={fears} onChange={(event) => setFears(event.target.value)} />
        </Field>
        <Field label="Worldview">
          <Textarea value={worldview} onChange={(event) => setWorldview(event.target.value)} />
        </Field>
        <Field label="Speaking Style">
          <Textarea
            value={speakingStyle}
            onChange={(event) => setSpeakingStyle(event.target.value)}
          />
        </Field>
        <Field label="Vocabulary Tendencies">
          <Textarea
            value={vocabularyTendencies}
            onChange={(event) => setVocabularyTendencies(event.target.value)}
          />
        </Field>
        <Field label="Rhythm of Speech">
          <Textarea
            value={speechRhythm}
            onChange={(event) => setSpeechRhythm(event.target.value)}
          />
        </Field>
        <Field label="Emotional Baseline">
          <Input
            value={emotionalBaseline}
            onChange={(event) => setEmotionalBaseline(event.target.value)}
          />
        </Field>
        <Field label="Relationships">
          <div className="grid gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
            {relationships.map((relationship, index) => (
              <div
                key={`${relationship.characterId}-${index}`}
                className="grid gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-3"
              >
                <div className="flex items-center gap-2">
                  <Select
                    value={relationship.characterId}
                    onChange={(event) =>
                      setRelationships((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, characterId: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">Select character</option>
                    {otherCharacters.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="ghost"
                    className="px-3"
                    onClick={() =>
                      setRelationships((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Textarea
                  value={relationship.summary}
                  onChange={(event) =>
                    setRelationships((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, summary: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                setRelationships((current) => [
                  ...current,
                  { characterId: "", summary: "" },
                ])
              }
            >
              <Plus className="size-4" />
              Add Relationship
            </Button>
          </div>
        </Field>
        <Field label="Secrets">
          <Textarea value={secrets} onChange={(event) => setSecrets(event.target.value)} />
        </Field>
        <Field label="Arc Direction">
          <Textarea
            value={arcDirection}
            onChange={(event) => setArcDirection(event.target.value)}
          />
        </Field>
        <Field label="Contradictions">
          <Textarea
            value={contradictions}
            onChange={(event) => setContradictions(event.target.value)}
          />
        </Field>

        <div className="grid gap-4 2xl:grid-cols-2">
          <Panel className="bg-[var(--surface-elevated)] p-3">
            <h3 className="text-[13px] font-semibold text-[var(--ink)]">Linked scenes</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {linkedScenes.map((scene) => (
                <Badge key={scene.id} tone="accent">
                  {scene.title}
                </Badge>
              ))}
            </div>
          </Panel>
          <Panel className="bg-[var(--surface-elevated)] p-3">
            <h3 className="text-[13px] font-semibold text-[var(--ink)]">Affected scenes</h3>
            <div className="mt-3 grid gap-2">
              {affectedSuggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-[var(--ink-muted)]"
                >
                  {suggestion.title}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Panel>
  );
}

export function CharactersView() {
  const navigate = useNavigate();
  const snapshotQuery = useProjectSnapshot();
  const { saveCharacter } = useProjectRuntime();
  const [selectedCharacterId, setSelectedCharacterId, searchText] = useUiStore(useShallow((state) => [
    state.selectedCharacterId,
    state.setSelectedCharacterId,
    state.searchText,
  ]));
  const snapshot = snapshotQuery.data;

  if (!snapshot) {
    return null;
  }

  const currentSnapshot = snapshot;

  const characters = currentSnapshot.characters.filter((character) =>
    [character.name, character.role, character.worldview]
      .join(" ")
      .toLowerCase()
      .includes(searchText.toLowerCase()),
  );
  const selectedCharacter =
    characters.find((character) => character.id === selectedCharacterId) ?? characters[0];

  useEffect(() => {
    if (!selectedCharacterId && characters[0]) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId, setSelectedCharacterId]);

  async function handleAddCharacter() {
    const newCharacter: Character = {
      id: createId("character"),
      projectId: currentSnapshot.project.id,
      name: `Character ${currentSnapshot.characters.length + 1}`,
      role: "",
      personalityTraits: [],
      motivations: "",
      fears: "",
      worldview: "",
      speakingStyle: "",
      vocabularyTendencies: "",
      speechRhythm: "",
      emotionalBaseline: "",
      relationships: [],
      secrets: "",
      arcDirection: "",
      contradictions: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveCharacter(newCharacter);
    setSelectedCharacterId(newCharacter.id);
    await navigate({
      to: "/characters/$characterId",
      params: { characterId: newCharacter.id },
    });
  }

  return (
    <div className="grid h-full min-h-0 gap-[var(--workbench-editor-gap)] xl:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
      <Panel className="min-h-0 overflow-y-auto">
        <SectionHeading
          title="Characters"
          description="Treat character cards as voice and behavior anchors, not detached bios."
          actions={
            <Button onClick={handleAddCharacter}>
              <Plus className="size-4" />
              Add Character
            </Button>
          }
        />
        <div className="mt-5 grid gap-1 border-t border-[var(--border)] pt-4">
          {characters.length > 0 ? (
            characters.map((character) => (
              <button
                key={character.id}
                className={`border-l-2 px-3 py-3 text-left transition ${
                  selectedCharacter?.id === character.id
                    ? "border-[var(--accent)] bg-[var(--selected)]"
                    : "border-transparent hover:bg-[var(--hover)]"
                }`}
                onClick={() => {
                  setSelectedCharacterId(character.id);
                  void navigate({
                    to: "/characters/$characterId",
                    params: { characterId: character.id },
                  });
                }}
              >
                <h3 className="text-[13px] font-medium text-[var(--ink)]">
                  {character.name}
                </h3>
                <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
                  {character.role || "No role set yet."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {character.personalityTraits.slice(0, 3).map((trait) => (
                    <Badge key={trait}>{trait}</Badge>
                  ))}
                </div>
              </button>
            ))
          ) : (
            <EmptyState
              title="No characters yet"
              description="Create the cast before worrying about voice consistency."
              action={<Button onClick={handleAddCharacter}>Create Character</Button>}
            />
          )}
        </div>
      </Panel>

      {selectedCharacter ? (
        <CharacterEditor character={selectedCharacter} />
      ) : (
        <Panel>
          <EmptyState
            title="Choose a character"
            description="Select a character to edit voice, relationships, and arc direction."
          />
        </Panel>
      )}
    </div>
  );
}
