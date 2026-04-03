import type React from "react";
import type { ProjectSnapshot, Suggestion } from "@novelforge/domain";
import {
  BookCopy,
  ChevronDown,
  FileText,
  MessageSquareText,
  Search,
  Sparkles,
  Theater,
  Users,
} from "lucide-react";
import { Button, EmptyState, Input } from "@/components/ui";
import { formatRelativeTimestamp, cn } from "@/lib/utils";
import type { WorkbenchActivityId } from "@/store/uiStore";

function matchesSearch(searchText: string, ...values: Array<string | null | undefined>) {
  const query = searchText.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function ExplorerSection({
  label,
  children,
}: React.PropsWithChildren<{ label: string }>) {
  return (
    <section className="space-y-1">
      <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function ExplorerItem({
  label,
  meta,
  icon,
  active = false,
  depth = 0,
  onClick,
}: {
  label: string;
  meta?: string;
  icon: React.ReactNode;
  active?: boolean;
  depth?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 border-l-2 px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        active
          ? "border-[var(--accent)] bg-[var(--selected)] text-[var(--ink)]"
          : "border-transparent text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
      )}
      style={{ paddingLeft: `${10 + depth * 16}px` }}
    >
      <span className="mt-0.5 shrink-0 text-[var(--ink-faint)]">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-medium">{label}</span>
        {meta ? (
          <span className="mt-0.5 block truncate text-[10.5px] text-[var(--ink-faint)]">
            {meta}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function SuggestionsGroup({
  suggestions,
  currentRoute,
  onOpenRoute,
}: {
  suggestions: Suggestion[];
  currentRoute: string;
  onOpenRoute: (route: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {suggestions.map((suggestion) => (
        <ExplorerItem
          key={suggestion.id}
          label={`Suggestion: ${suggestion.title}`}
          meta={suggestion.status}
          icon={<Sparkles className="size-3.5" />}
          depth={1}
          active={currentRoute === `/suggestions/${suggestion.id}`}
          onClick={() => onOpenRoute(`/suggestions/${suggestion.id}`)}
        />
      ))}
    </div>
  );
}

export function WorkbenchExplorerPanel({
  snapshot,
  activity,
  currentRoute,
  searchText,
  onSearchTextChange,
  onOpenRoute,
  onRunFullScan,
  isAnalyzing,
  openSuggestionsCount,
}: {
  snapshot: ProjectSnapshot | null;
  activity: WorkbenchActivityId;
  currentRoute: string;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onOpenRoute: (route: string) => void;
  onRunFullScan: () => void;
  isAnalyzing: boolean;
  openSuggestionsCount: number;
}) {
  const chapters = snapshot ? [...snapshot.chapters].sort((a, b) => a.orderIndex - b.orderIndex) : [];
  const chapterScenes = snapshot
    ? chapters.reduce<Record<string, ProjectSnapshot["scenes"]>>((accumulator, chapter) => {
        accumulator[chapter.id] = snapshot.scenes
          .filter((scene) => scene.chapterId === chapter.id)
          .sort((left, right) => left.orderIndex - right.orderIndex);
        return accumulator;
      }, {})
    : {};
  const unassignedScenes = snapshot
    ? [...snapshot.scenes]
        .filter((scene) => scene.chapterId === null)
        .sort((left, right) => left.orderIndex - right.orderIndex)
    : [];
  const characters = snapshot
    ? [...snapshot.characters].sort((left, right) => left.name.localeCompare(right.name))
    : [];
  const suggestions = snapshot
    ? [...snapshot.suggestions].sort((left, right) =>
        left.status === right.status
          ? left.title.localeCompare(right.title)
          : left.status.localeCompare(right.status),
      )
    : [];

  function renderStoryTree(includeStoryLanding: boolean) {
    const visibleChapters = chapters.filter((chapter) => {
      if (matchesSearch(searchText, chapter.title, chapter.summary, chapter.purpose)) {
        return true;
      }

      return (chapterScenes[chapter.id] ?? []).some((scene) =>
        matchesSearch(searchText, scene.title, scene.summary, scene.purpose),
      );
    });

    const visibleUnassignedScenes = unassignedScenes.filter((scene) =>
      matchesSearch(searchText, scene.title, scene.summary, scene.purpose),
    );

    return (
      <>
        {includeStoryLanding ? (
          <ExplorerSection label="Story">
            <ExplorerItem
              label="Story Outline"
              meta={snapshot?.project.genre || "Story brief and spine"}
              icon={<BookCopy className="size-3.5" />}
              active={currentRoute === "/story"}
              onClick={() => onOpenRoute("/story")}
            />
          </ExplorerSection>
        ) : null}

        <ExplorerSection label="Chapters">
          {visibleChapters.length > 0 ? (
            visibleChapters.map((chapter) => {
              const scenes = (chapterScenes[chapter.id] ?? []).filter((scene) =>
                matchesSearch(searchText, scene.title, scene.summary, scene.purpose),
              );

              return (
                <div key={chapter.id} className="space-y-0.5">
                  <ExplorerItem
                    label={`Chapter ${chapter.orderIndex + 1}: ${chapter.title}`}
                    meta={`${scenes.length} scene${scenes.length === 1 ? "" : "s"}`}
                    icon={<ChevronDown className="size-3.5" />}
                    active={currentRoute === `/chapters/${chapter.id}`}
                    onClick={() => onOpenRoute(`/chapters/${chapter.id}`)}
                  />
                  {scenes.map((scene) => (
                    <ExplorerItem
                      key={scene.id}
                      label={`Scene ${scene.orderIndex + 1}: ${scene.title}`}
                      meta={scene.summary || scene.purpose || "No summary yet"}
                      icon={<Theater className="size-3.5" />}
                      depth={1}
                      active={currentRoute === `/scenes/${scene.id}`}
                      onClick={() => onOpenRoute(`/scenes/${scene.id}`)}
                    />
                  ))}
                </div>
              );
            })
          ) : (
            <p className="px-3 text-[12px] text-[var(--ink-faint)]">
              No matching chapters or scenes.
            </p>
          )}

          {visibleUnassignedScenes.length > 0 ? (
            <div className="space-y-0.5 pt-2">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                Unassigned
              </p>
              {visibleUnassignedScenes.map((scene) => (
                <ExplorerItem
                  key={scene.id}
                  label={`Scene ${scene.orderIndex + 1}: ${scene.title}`}
                  meta={scene.summary || scene.purpose || "No summary yet"}
                  icon={<Theater className="size-3.5" />}
                  depth={1}
                  active={currentRoute === `/scenes/${scene.id}`}
                  onClick={() => onOpenRoute(`/scenes/${scene.id}`)}
                />
              ))}
            </div>
          ) : null}
        </ExplorerSection>
      </>
    );
  }

  function renderCharacters() {
    const visibleCharacters = characters.filter((character) =>
      matchesSearch(searchText, character.name, character.role, character.worldview),
    );

    return (
      <ExplorerSection label="Characters">
        {visibleCharacters.length > 0 ? (
          visibleCharacters.map((character) => (
            <ExplorerItem
              key={character.id}
              label={`Character: ${character.name}`}
              meta={character.role || "No role set yet"}
              icon={<Users className="size-3.5" />}
              active={currentRoute === `/characters/${character.id}`}
              onClick={() => onOpenRoute(`/characters/${character.id}`)}
            />
          ))
        ) : (
          <p className="px-3 text-[12px] text-[var(--ink-faint)]">No matching characters.</p>
        )}
      </ExplorerSection>
    );
  }

  function renderSuggestions(includeLanding: boolean) {
    const visibleSuggestions = suggestions.filter((suggestion) =>
      matchesSearch(searchText, suggestion.title, suggestion.rationale, suggestion.proposedAction),
    );
    const openSuggestions = visibleSuggestions.filter((suggestion) => suggestion.status === "open");
    const resolvedSuggestions = visibleSuggestions.filter((suggestion) => suggestion.status !== "open");

    return (
      <>
        {includeLanding ? (
          <ExplorerSection label="Inbox">
            <ExplorerItem
              label="Suggestions Inbox"
              meta={`${openSuggestionsCount} open`}
              icon={<Sparkles className="size-3.5" />}
              active={currentRoute === "/suggestions"}
              onClick={() => onOpenRoute("/suggestions")}
            />
          </ExplorerSection>
        ) : null}

        {openSuggestions.length > 0 ? (
          <ExplorerSection label="Open">
            <SuggestionsGroup
              suggestions={openSuggestions}
              currentRoute={currentRoute}
              onOpenRoute={onOpenRoute}
            />
          </ExplorerSection>
        ) : null}

        {resolvedSuggestions.length > 0 ? (
          <ExplorerSection label="Later">
            <SuggestionsGroup
              suggestions={resolvedSuggestions}
              currentRoute={currentRoute}
              onOpenRoute={onOpenRoute}
            />
          </ExplorerSection>
        ) : null}

        {visibleSuggestions.length === 0 ? (
          <ExplorerSection label="Suggestions">
            <p className="px-3 text-[12px] text-[var(--ink-faint)]">No matching suggestions.</p>
          </ExplorerSection>
        ) : null}
      </>
    );
  }

  function renderAiTools() {
    return (
      <ExplorerSection label="AI Tools">
        <ExplorerItem
          label="Scratchpad"
          meta="Open the full AI workspace"
          icon={<MessageSquareText className="size-3.5" />}
          active={currentRoute === "/scratchpad"}
          onClick={() => onOpenRoute("/scratchpad")}
        />
        <ExplorerItem
          label="AI Settings"
          meta="Provider and model configuration"
          icon={<FileText className="size-3.5" />}
          active={currentRoute === "/settings"}
          onClick={() => onOpenRoute("/settings")}
        />
      </ExplorerSection>
    );
  }

  function renderContent() {
    if (!snapshot) {
      return (
        <EmptyState
          title="Explorer unavailable"
          description="Create or open a project to browse chapters, scenes, characters, and suggestions."
        />
      );
    }

    if (activity === "story") {
      return renderStoryTree(true);
    }

    if (activity === "characters") {
      return renderCharacters();
    }

    if (activity === "suggestions") {
      return renderSuggestions(true);
    }

    if (activity === "ai") {
      return renderAiTools();
    }

    return (
      <>
        {renderStoryTree(true)}
        {renderCharacters()}
        {renderSuggestions(true)}
        {renderAiTools()}
      </>
    );
  }

  const sectionTitle =
    activity === "story"
      ? "Story Explorer"
      : activity === "characters"
        ? "Character Explorer"
        : activity === "suggestions"
          ? "Suggestion Explorer"
          : activity === "ai"
            ? "AI Tools"
            : "Explorer";

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--sidebar-bg)]">
      <div className="border-b border-[var(--border)] px-3.5 py-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
          {sectionTitle}
        </p>
        <h1 className="mt-1.5 text-[14px] font-semibold text-[var(--ink)]">
          {snapshot?.project.title ?? "NovelForge"}
        </h1>
        <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--ink-muted)]">
          {snapshot
            ? snapshot.project.logline ||
              snapshot.project.premise ||
              "Choose a resource in the explorer to open it in the editor."
            : "The workbench opens documents from the explorer into tabs and keeps AI bound to the active tab."}
        </p>
        {snapshot ? (
          <p className="mt-1.5 text-[10.5px] text-[var(--ink-faint)]">
            Last opened {formatRelativeTimestamp(snapshot.project.lastOpenedAt)}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--input-bg)] px-2.5">
          <Search className="size-4 text-[var(--ink-faint)]" />
          <Input
            className="border-none bg-transparent px-0 focus:border-none focus:ring-0 hover:border-transparent"
            placeholder="Quick filter chapters, scenes, and characters"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2.5">{renderContent()}</div>

      {snapshot ? (
        <div className="border-t border-[var(--border)] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                Analysis
              </p>
              <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
                {isAnalyzing
                  ? "Reviewing recent story changes..."
                  : `${openSuggestionsCount} open suggestions`}
              </p>
            </div>
            <Button variant="secondary" onClick={onRunFullScan}>
              Run Scan
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
