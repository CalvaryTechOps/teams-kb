import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { APP_TITLE, BUILT_BY, LOGO_URL } from "@/lib/branding";
import { getSiteSettings } from "@/lib/site-settings.server";
import { SignInCard } from "./sign-in-card";

// Reachable signed-out (see src/proxy.ts). Copy is admin-editable and read
// server-side with defaults, so this page renders even if the DB is down.
// Dynamic so an admin's edit shows on the next request, not the next build.
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const settings = await getSiteSettings();

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(380px,520px)_1fr]">
      <div className="hidden flex-col justify-between bg-ink p-12 lg:flex">
        {/* Without a logo the heading below already carries the title. */}
        <div className="self-start">{LOGO_URL && <BrandMark size="hero" />}</div>
        <div>
          <h1 className="text-5xl font-black leading-[1.1] tracking-tight text-white">
            {APP_TITLE}
          </h1>
          <p className="mt-4 max-w-[340px] text-lg leading-relaxed text-grey-400">
            {settings["signin.tagline"]}
          </p>
        </div>
        <div className="text-xs text-grey-500">{BUILT_BY}</div>
      </div>
      <div className="flex items-center justify-center bg-grey-50 p-8 lg:p-12">
        <Suspense>
          <SignInCard
            helpText={settings["signin.help_text"]}
            buttonLabel={settings["signin.button_label"]}
            redirectNote={settings["signin.redirect_note"]}
          />
        </Suspense>
      </div>
    </main>
  );
}
