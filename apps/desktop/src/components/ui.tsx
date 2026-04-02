import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary:
      "border border-[var(--accent-strong)] bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
    secondary:
      "border border-[var(--border)] bg-[var(--input-bg)] text-[var(--ink)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]",
    ghost:
      "border border-transparent bg-transparent text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
    danger:
      "border border-[color:rgba(244,135,113,0.22)] bg-[var(--danger-surface)] text-[var(--danger)] hover:bg-[color:rgba(244,135,113,0.18)]",
  };

  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center gap-2 rounded-[4px] px-3 text-xs font-medium tracking-[0.01em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-[4px] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 text-[13px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-ring)]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-[4px] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] leading-5 text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-ring)]",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-[4px] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 text-[13px] text-[var(--ink)] outline-none transition hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus-ring)]",
        className,
      )}
      {...props}
    />
  );
}

export const Panel = React.forwardRef<
  HTMLElement,
  React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>
>(function Panel({ className, children, ...props }, ref) {
  return (
    <section
      ref={ref}
      className={cn(
        "rounded-[8px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
});

export function Field({
  label,
  hint,
  className,
  children,
}: React.PropsWithChildren<{
  label: string;
  hint?: string;
  className?: string;
}>) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="flex items-center justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
          {label}
        </span>
        {hint ? (
          <span className="text-[11px] text-[var(--ink-faint)]">{hint}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

export function Badge({
  className,
  tone = "default",
  children,
}: React.PropsWithChildren<{
  className?: string;
  tone?: "default" | "accent" | "warning" | "danger";
}>) {
  const toneClasses = {
    default:
      "border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--ink-muted)]",
    accent:
      "border border-[color:rgba(0,122,204,0.28)] bg-[var(--accent-soft)] text-[color:#4fc1ff]",
    warning:
      "border border-[color:rgba(215,186,125,0.22)] bg-[var(--warning-surface)] text-[var(--warning)]",
    danger:
      "border border-[color:rgba(244,135,113,0.22)] bg-[var(--danger-surface)] text-[var(--danger)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] px-2 py-1 text-[11px] font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2>
        {description ? (
          <p className="max-w-2xl text-[13px] text-[var(--ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--panel)] px-5 py-10 text-center">
      <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-[13px] text-[var(--ink-muted)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function TabButton({
  className,
  active = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-[4px] border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink)]"
          : "border-transparent bg-transparent text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
        className,
      )}
      {...props}
    />
  );
}

export function ListRow({
  className,
  active = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 border-l-2 px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        active
          ? "border-[var(--accent)] bg-[var(--selected)] text-[var(--ink)]"
          : "border-transparent text-[var(--ink-muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
        className,
      )}
      {...props}
    />
  );
}
