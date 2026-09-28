"use client";

import { startTransition, useState } from "react";
import { StarIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui";
import { favoriteLabel } from "@/lib/favorites";
import { toggleFavorite } from "@/app/(kb)/actions";

// The star on a guide page (plans/favorites.md): outline when the guide is
// not one of the viewer's favorites, filled when it is. Flips optimistically
// on click and reverts with a small inline error if the server disagrees.
// `aria-pressed` carries the state for assistive tech; the label says what a
// click will do.
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
        className={`${buttonClasses({ variant: "secondary", size: "sm" })} px-2.5 ${
          isFavorite ? "text-accent" : ""
        }`}
      >
        <StarIcon size={14} filled={isFavorite} />
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
