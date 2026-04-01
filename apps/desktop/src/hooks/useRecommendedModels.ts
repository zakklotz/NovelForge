import { useQuery } from "@tanstack/react-query";
import { tauriApi } from "@/lib/tauri";

export function useRecommendedModels(providerId?: string) {
  return useQuery({
    queryKey: ["recommendedModels", providerId ?? "all"],
    queryFn: () => tauriApi.listRecommendedModels(providerId),
  });
}
