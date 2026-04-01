import type { DomainEvent, ProjectSnapshot, Suggestion } from "@novelforge/domain";

export interface AnalysisInput {
  event: DomainEvent;
  snapshot: ProjectSnapshot;
}

export interface AnalysisOutput {
  suggestions: Suggestion[];
}

export interface AiSuggestionProvider {
  generateSuggestions(input: AnalysisInput): Promise<Suggestion[]>;
}
