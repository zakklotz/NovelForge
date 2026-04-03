import {
  BookCopy,
  ListOrdered,
  MessageSquareText,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkbenchActivityId } from "@/store/uiStore";

const activityItems: Array<{
  id: WorkbenchActivityId;
  label: string;
  icon: typeof BookCopy;
}> = [
  { id: "explorer", label: "Explorer", icon: BookCopy },
  { id: "story", label: "Story", icon: ListOrdered },
  { id: "suggestions", label: "Suggestions", icon: Sparkles },
  { id: "characters", label: "Characters", icon: Users },
  { id: "ai", label: "AI", icon: MessageSquareText },
];

export function WorkbenchActivityBar({
  activeActivity,
  hasProject,
  onSelectActivity,
  onOpenSettings,
  isSettingsActive,
}: {
  activeActivity: WorkbenchActivityId;
  hasProject: boolean;
  onSelectActivity: (activity: WorkbenchActivityId) => void;
  onOpenSettings: () => void;
  isSettingsActive: boolean;
}) {
  return (
    <aside className="flex h-full w-[var(--workbench-activity-width)] flex-col items-center border-r border-[var(--border)] bg-[var(--sidebar-bg)] py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-elevated)] text-[13px] font-semibold text-[var(--ink)]">
        NF
      </div>

      <nav className="mt-4 flex flex-1 flex-col items-center gap-1">
        {activityItems.map((item) => {
          const Icon = item.icon;
          const disabled = !hasProject;
          const isActive = activeActivity === item.id;

          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              title={item.label}
              disabled={disabled}
              onClick={() => onSelectActivity(item.id)}
              className={cn(
                "relative inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-transparent text-[var(--ink-faint)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                isActive
                  ? "bg-[var(--surface-elevated)] text-[var(--ink)]"
                  : "hover:bg-[var(--hover)] hover:text-[var(--ink)]",
                disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-[var(--ink-faint)]",
              )}
            >
              <span
                className={cn(
                  "absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-transparent",
                  isActive && "bg-[var(--accent)]",
                )}
              />
              <Icon className="size-4" />
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-transparent text-[var(--ink-faint)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
          isSettingsActive
            ? "bg-[var(--surface-elevated)] text-[var(--ink)]"
            : "hover:bg-[var(--hover)] hover:text-[var(--ink)]",
        )}
      >
        <Settings2 className="size-4" />
      </button>
    </aside>
  );
}
