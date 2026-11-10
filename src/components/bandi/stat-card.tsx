import { Icon, type IconName } from "./icons";

const ICON_TONE = {
  default: "bg-accent text-accent-foreground",
  danger: "bg-destructive-soft text-destructive",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
} as const;

/** 원본 statCard.tag: 라벨/값/증감 타일. */
export function StatCard({ label, value, unit, delta, tone, icon, iconTone = "default", featured = false, testId }: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  tone?: "success" | "danger";
  icon?: IconName;
  iconTone?: keyof typeof ICON_TONE;
  featured?: boolean;
  testId?: string;
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className={`rounded-lg border p-3.5 md:p-4 ${featured ? "border-primary/40 bg-accent/60" : "bg-card"}`}>
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground md:gap-2">
        {icon ? (
          <span className={`flex size-6 shrink-0 items-center justify-center rounded-md md:size-7 ${ICON_TONE[iconTone]}`}>
            <Icon name={icon} className="size-3.5 md:size-4" />
          </span>
        ) : null}
        {label}
      </span>
      <strong className={`mt-2 block text-xl font-black tracking-tight tabular-nums md:text-2xl ${featured ? "text-accent-foreground" : toneClass}`}>
        <span data-testid={testId}>{value}</span>
        {unit ? <small className="text-sm font-bold text-muted-foreground">{unit}</small> : null}
      </strong>
      {delta ? <span className="mt-0.5 block text-xs font-bold text-muted-foreground">{delta}</span> : null}
    </div>
  );
}
