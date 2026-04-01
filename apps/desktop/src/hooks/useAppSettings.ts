import { useQuery } from "@tanstack/react-query";
import { tauriApi } from "@/lib/tauri";

export function useAppSettings() {
  return useQuery({
    queryKey: ["appSettings"],
    queryFn: () => tauriApi.getAppSettings(),
  });
}
