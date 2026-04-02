import { Sparkles } from "lucide-react";
import { Badge, Button, EmptyState, Panel, SectionHeading } from "@/components/ui";
import { useProjectSnapshot } from "@/hooks/useProjectSnapshot";
import { useProjectRuntime } from "@/hooks/useProjectRuntime";

export function SuggestionsView() {
  const snapshotQuery = useProjectSnapshot();
  const { queueAnalysis, updateSuggestion } = useProjectRuntime();
  const snapshot = snapshotQuery.data;

  if (!snapshot) {
    return null;
  }

  const suggestions = [...snapshot.suggestions].sort((a, b) =>
    a.status === b.status ? a.title.localeCompare(b.title) : a.status.localeCompare(b.status),
  );

  return (
    <Panel className="h-full min-h-0">
      <SectionHeading
        title="Suggestions Inbox"
        description="Review structural or continuity implications after moving scenes, changing chapters, or updating character cards."
        actions={
          <Button
            onClick={() =>
              queueAnalysis({
                id: crypto.randomUUID(),
                projectId: snapshot.project.id,
                occurredAt: new Date().toISOString(),
                type: "analysis.manualRequested",
              })
            }
          >
            <Sparkles className="size-4" />
            Run Full Scan
          </Button>
        }
      />
      <div className="mt-5 grid gap-1 border-t border-[var(--border)] pt-4">
        {suggestions.length > 0 ? (
          suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="border-l-2 border-transparent bg-[var(--panel)] px-4 py-3 transition hover:bg-[var(--surface-elevated)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
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
                    <Badge tone="accent">{suggestion.type}</Badge>
                    <Badge>{suggestion.status}</Badge>
                  </div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                    {suggestion.title}
                  </h3>
                  <p className="max-w-3xl text-[13px] text-[var(--ink-muted)]">
                    {suggestion.rationale}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      updateSuggestion({
                        projectId: snapshot.project.id,
                        suggestionId: suggestion.id,
                        status: "applied",
                      })
                    }
                  >
                    Mark Resolved
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      updateSuggestion({
                        projectId: snapshot.project.id,
                        suggestionId: suggestion.id,
                        status: "dismissed",
                      })
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
              {suggestion.evidenceRefs.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestion.evidenceRefs.map((evidence) => (
                    <Badge key={`${suggestion.id}-${evidence.id}`}>
                      {evidence.label || evidence.id}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 rounded-[4px] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[13px] text-[var(--ink-muted)]">
                {suggestion.proposedAction}
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No suggestions yet"
            description="Move scenes, update characters, or run a full scan to surface continuity and structure checks."
          />
        )}
      </div>
    </Panel>
  );
}
