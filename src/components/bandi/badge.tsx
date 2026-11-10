import type { ReactNode } from "react";

export type BadgeTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<BadgeTone, string> = {
  accent: "bg-accent text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
  info: "bg-info-soft text-info",
  neutral: "bg-secondary text-muted-foreground",
};

/** 원본 badge.tag: *-soft 배경 + 본색 글자. */
export function Badge({ tone = "accent", dot = false, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${TONE[tone]}`}>
      {dot ? <i className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
