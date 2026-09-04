import Link from "next/link";
import { useId, type ComponentProps, type ReactNode } from "react";

// Small styled primitives matching the app's design system: cyan primary
// actions, quiet secondary buttons, hairline-bordered badges. Sentence case
// labels everywhere; verb-first CTAs.

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 disabled:pointer-events-none";

const buttonVariants = {
  primary: "bg-cyan-400 text-ink hover:bg-cyan-600 hover:text-white",
  secondary:
    "border border-grey-300 bg-white text-grey-800 hover:bg-grey-50",
  ghost: "text-grey-600 hover:bg-grey-100",
  danger: "bg-danger text-white hover:bg-danger/90",
} as const;

const buttonSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
} as const;

type ButtonStyleProps = {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
};

export function buttonClasses({
  variant = "primary",
  size = "md",
}: ButtonStyleProps = {}) {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]}`;
}

export function Button({
  variant,
  size,
  className = "",
  ...props
}: ComponentProps<"button"> & ButtonStyleProps) {
  return (
    <button
      {...props}
      className={`${buttonClasses({ variant, size })} ${className}`}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  className = "",
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return (
    <Link
      {...props}
      className={`${buttonClasses({ variant, size })} ${className}`}
    />
  );
}

// Light-surface tones for the default pill, plus the ink-sidebar variants
// used when `onDark` is set (same idea as Avatar's onDark). "muted" is the
// quiet no-background tone for empty counts.
const badgeTones = {
  brand: {
    light: "bg-cyan-100 text-cyan-700",
    dark: "bg-cyan-400/20 text-cyan-400",
  },
  neutral: {
    light: "bg-grey-100 text-grey-600",
    dark: "bg-white/10 text-grey-300",
  },
  muted: { light: "text-grey-500", dark: "text-grey-500" },
  warning: {
    light: "bg-warning-100 text-warning",
    dark: "bg-warning/20 text-warning",
  },
  success: {
    light: "bg-success-100 text-success",
    dark: "bg-success/20 text-success",
  },
} as const;

const badgeSizes = {
  md: "h-[22px] px-2.5 text-xs",
  sm: "h-[18px] px-1.5 text-[11px] tabular-nums",
} as const;

export function Badge({
  tone = "neutral",
  size = "md",
  onDark = false,
  className = "",
  children,
}: {
  tone?: keyof typeof badgeTones;
  size?: keyof typeof badgeSizes;
  onDark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${badgeSizes[size]} ${
        badgeTones[tone][onDark ? "dark" : "light"]
      } ${className}`}
    >
      {children}
    </span>
  );
}

/** Initials avatar — cyan-on-ink in dark contexts, grey in light ones. */
export function Avatar({
  name,
  onDark = false,
  size = 30,
}: {
  name: string;
  onDark?: boolean;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        onDark ? "bg-cyan-400 text-ink" : "bg-grey-100 text-ink"
      }`}
    >
      {initials || "?"}
    </span>
  );
}

/** Uppercase micro-label used for section headings ("Departments", "Tags"). */
export function MicroLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[11px] font-medium uppercase tracking-[.09em] text-grey-500 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Pill toggle: a track with a round knob that slides right when on. Cyan on
 * the ink sidebar (`onDark`), cyan-on-grey in light contexts. The text is the
 * accessible name and is clickable; the button carries `role="switch"` so
 * screen readers announce on/off, and Space/Enter toggle via the native
 * button. Pass `className` for layout (e.g. a full-width justify-between row).
 */
export function Switch({
  checked,
  onChange,
  label,
  onDark = false,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onDark?: boolean;
  className?: string;
}) {
  const id = useId();
  const track = checked
    ? onDark
      ? "bg-cyan-400/40"
      : "bg-cyan-100"
    : onDark
      ? "bg-white/15"
      : "bg-grey-200";
  const knob = checked
    ? onDark
      ? "translate-x-4 bg-cyan-400"
      : "translate-x-4 bg-cyan-600"
    : onDark
      ? "bg-grey-400"
      : "bg-grey-0 shadow-xs";
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center gap-2 ${className}`}
    >
      <span
        id={id}
        className={`text-[12px] font-medium ${onDark ? "text-grey-400" : "text-grey-600"}`}
      >
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:shadow-focus ${track}`}
      >
        <span
          aria-hidden
          className={`absolute left-0.5 top-0.5 size-4 rounded-full transition-transform ${knob}`}
        />
      </button>
    </label>
  );
}
