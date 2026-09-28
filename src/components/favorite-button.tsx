"use client";

import { startTransition, useState } from "react";
import { StarIcon } from "@/components/icons";
import { favoriteLabel } from "@/lib/favorites";
import { toggleFavorite } from "@/app/(kb)/actions";

// The star on a guide page (plans/favorites.md): outline when the guide is
// not one of the viewer's favorites, filled when it is. Flips optimistically
// on click and reverts with a small inline error if the server disagrees.
// `aria-pressed` carries the state for assistive tech; the label says what a
// click will do. Deliberately quieter than the "Copy link" button beside it:
// a bare icon that only gains a wash on hover.
export function FavoriteButton({
  guideId,
  initialIsFavorite,
  className = "",
}: {
  guideId: string;
  initialIsFavorite: boolean;
  className?: string;
}) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [error, setError] = useState<string | null>(null);
  const label = favoriteLabel(isFavorite);

  const onClick = () => {
    const next = !isFavorite;
    setIsFavorite(next);
    setError(null);
    startTransition(async () => {
      try {
        await toggleFavorite(guideId, next);
      } catch {
        setIsFavorite(!next);
        setError(
          next ? "Couldn't add this guide to your favorites." : "Couldn't remove this favorite.",
        );
      }
    });
  };

  return (
    <div className={`relative shrink-0 print:hidden ${className}`}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isFavorite}
        aria-label={label}
        title={label}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus ${
          isFavorite ? "text-accent" : "text-fg-muted hover:text-fg"
        }`}
      >
        <StarIcon size={16} filled={isFavorite} />
      </button>
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full mt-1.5 w-max max-w-[280px] text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
