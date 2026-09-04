import Image from "next/image";
import { APP_TITLE, LOGO_URL } from "@/lib/branding";

// Logo slot for dark surfaces (sidebar, sign-in hero). Renders the deployer's
// NEXT_PUBLIC_LOGO_URL when set, otherwise the app title as a wordmark.
export function BrandMark({ size = "sidebar" }: { size?: "sidebar" | "hero" }) {
  const heightClass = size === "hero" ? "h-14" : "h-[38px]";
  if (LOGO_URL) {
    return (
      <Image
        src={LOGO_URL}
        alt={APP_TITLE}
        width={size === "hero" ? 125 : 95}
        height={size === "hero" ? 72 : 55}
        className={`${heightClass} w-auto`}
        unoptimized
        priority
      />
    );
  }
  return (
    <span
      className={`flex ${heightClass} items-center font-black tracking-tight text-white ${
        size === "hero" ? "text-2xl" : "text-lg"
      }`}
    >
      {APP_TITLE}
    </span>
  );
}
