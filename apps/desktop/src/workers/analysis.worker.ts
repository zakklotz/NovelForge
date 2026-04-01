import { analyzeProjectSnapshot } from "@novelforge/analysis";
import type { DomainEvent, ProjectSnapshot } from "@novelforge/domain";

interface AnalysisWorkerInput {
  event: DomainEvent;
  snapshot: ProjectSnapshot;
}

self.onmessage = (rawEvent: MessageEvent<AnalysisWorkerInput>) => {
  const result = analyzeProjectSnapshot(rawEvent.data);
  self.postMessage({
    event: rawEvent.data.event,
    suggestions: result.suggestions,
  });
};
