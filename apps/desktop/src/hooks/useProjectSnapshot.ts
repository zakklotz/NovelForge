import { useQuery } from "@tanstack/react-query";
import { tauriApi } from "@/lib/tauri";
import { useUiStore } from "@/store/uiStore";

export function useProjectSnapshot() {
  const currentProjectId = useUiStore((state) => state.currentProjectId);

  return useQuery({
    queryKey: ["projectSnapshot", currentProjectId],
    queryFn: () => tauriApi.getProjectSnapshot(),
    enabled: Boolean(currentProjectId),
  });
}
