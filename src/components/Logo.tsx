import { cn } from "@/lib/utils";

export function DropMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="17" className="fill-primary" />
      <path
        d="M32 11c8.5 10.5 17 18.4 17 28.4A17 17 0 0 1 15 39.4C15 29.4 23.5 21.5 32 11z"
        className="fill-primary-foreground"
      />
      <circle cx="32" cy="39" r="6.5" className="fill-primary" opacity="0.9" />
    </svg>
  );
}

/**
 * DropGlyph — the minimal DROP mark (cream droplet outline + inner dot) used
 * on the boot screen and anywhere a calm, premium brand mark is needed. It
 * inherits `currentColor`, so it adapts to light/dark surfaces.
 */
export function DropGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 288 288"
      className={cn("h-16 w-16", className)}
      aria-hidden="true"
    >
      <path
        d="M144 66c26 32 51 56 51 87a51 51 0 0 1-102 0c0-31 25-55 51-87z"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="144" cy="166" r="13" fill="currentColor" />
    </svg>
  );
}

export function Logo({
  className,
  wordmarkClassName,
  withTagline = false,
}: {
  className?: string;
  wordmarkClassName?: string;
  withTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <DropMark className="h-8 w-8" />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "text-xl font-extrabold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          DROP
        </span>
        {withTagline && (
          <span className="mt-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
            Everything you save. Finally searchable.
          </span>
        )}
      </span>
    </span>
  );
}
