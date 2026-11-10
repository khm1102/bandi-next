import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "dark" | "danger";
type Size = "default" | "compact";

const BASE = "inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const SIZE: Record<Size, string> = {
  default: "min-h-11 px-4 text-sm",
  compact: "min-h-11 px-3 text-xs md:min-h-9",
};
const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-strong hover:text-white",
  outline: "border bg-card text-foreground hover:bg-secondary",
  dark: "bg-sidebar text-white hover:bg-sidebar-accent",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

/** 원본 button.tag: variant(primary|outline|dark|danger) × size(default|compact). */
export function buttonClass(variant: Variant = "primary", size: Size = "default", extra = ""): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${extra}`.trim();
}

export function Button({
  href,
  variant = "primary",
  size = "default",
  className = "",
  children,
  ...rest
}: {
  href?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = buttonClass(variant, size, className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...rest} className={cls}>
      {children}
    </button>
  );
}
