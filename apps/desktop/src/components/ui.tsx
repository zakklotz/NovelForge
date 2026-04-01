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
      "bg-[var(--accent)] text-white shadow-[0_10px_30px_rgba(184,88,63,0.25)] hover:bg-[var(--accent-strong)]",
    secondary:
      "bg-white/70 text-[var(--ink)] ring-1 ring-black/10 hover:bg-white",
    ghost: "bg-transparent text-[var(--ink-muted)] hover:bg-black/5",
    danger: "bg-[var(--danger)] text-white hover:opacity-90",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
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
        "w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[color:rgba(184,88,63,0.16)]",
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
        "min-h-24 w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[color:rgba(184,88,63,0.16)]",
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
        "w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[color:rgba(184,88,63,0.16)]",
        className,
      )}
      {...props}
    />
  );
}

export function Panel({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-white/60 bg-[var(--panel)] p-5 shadow-[0_20px_50px_rgba(38,27,16,0.08)] backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}

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
    <label className={cn("grid gap-2", className)}>
      <span className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          {label}
        </span>
        {hint ? (
          <span className="text-xs text-[var(--ink-faint)]">{hint}</span>
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
    default: "bg-black/5 text-[var(--ink-muted)]",
    accent: "bg-[color:rgba(184,88,63,0.14)] text-[var(--accent-strong)]",
    warning: "bg-[color:rgba(194,151,57,0.16)] text-[var(--warning)]",
    danger: "bg-[color:rgba(174,67,45,0.14)] text-[var(--danger)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-[var(--ink)]">{title}</h2>
        {description ? (
          <p className="max-w-2xl text-sm text-[var(--ink-muted)]">
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
    <div className="rounded-3xl border border-dashed border-black/10 bg-white/50 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
