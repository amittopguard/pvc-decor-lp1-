import React from "react";
import { cn } from "@/lib/utils";

const cellBase =
  "w-full bg-transparent px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:bg-white " +
  "focus:ring-2 focus:ring-orange-500/60 rounded-none placeholder:text-slate-300";

export function NumberCell({ value, onChange, onPasteRows, align = "right", ...rest }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^-?\d*[.,]?\d*$/.test(v)) onChange(v.replace(",", "."));
      }}
      onFocus={(e) => e.target.select()}
      onPaste={(e) => {
        const text = e.clipboardData?.getData("text") || "";
        if (onPasteRows && /[\t\n]/.test(text)) {
          e.preventDefault();
          onPasteRows(text);
        }
      }}
      className={cn(cellBase, align === "right" ? "text-right tabular-nums" : "text-left")}
      {...rest}
    />
  );
}

export function TextCell({ value, onChange, onPasteRows, ...rest }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        const text = e.clipboardData?.getData("text") || "";
        if (onPasteRows && /[\t\n]/.test(text)) {
          e.preventDefault();
          onPasteRows(text);
        }
      }}
      className={cn(cellBase, "text-left")}
      {...rest}
    />
  );
}

export function CheckCell({ checked, onChange, title }) {
  return (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onChange(e.target.checked)}
      title={title}
      className="h-4 w-4 cursor-pointer accent-orange-600 align-middle"
    />
  );
}

export function IconButton({ children, className, ...rest }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center text-slate-400 dark:text-slate-500 transition-colors",
        "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/60",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ToolButton({ children, variant = "default", className, ...rest }) {
  const styles = {
    default:
      "border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800",
    primary: "border border-orange-600 bg-orange-600 text-white hover:bg-orange-700 hover:border-orange-700",
    ghost: "border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
  };
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-orange-500/60 disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Panel({ title, subtitle, actions, children, className }) {
  return (
    <section className={cn("border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
