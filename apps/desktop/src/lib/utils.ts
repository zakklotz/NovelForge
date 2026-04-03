export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function splitLines(value: string) {
  return value
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function splitCommaSeparated(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatRelativeTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Not yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function getAccessibleScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

export function scrollIntoViewWithAccessibleMotion(
  element: { scrollIntoView?: (options?: ScrollIntoViewOptions) => void } | null | undefined,
  options: Omit<ScrollIntoViewOptions, "behavior"> = {},
) {
  if (!element || typeof element.scrollIntoView !== "function") {
    return;
  }

  element.scrollIntoView({
    behavior: getAccessibleScrollBehavior(),
    ...options,
  });
}
