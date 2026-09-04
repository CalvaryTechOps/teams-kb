"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LogOutIcon } from "@/components/icons";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/sign-in");
      }}
      title="Sign out"
      className="rounded-md p-1.5 text-grey-500 hover:bg-white/10 hover:text-white"
    >
      <LogOutIcon size={15} />
      <span className="sr-only">Sign out</span>
    </button>
  );
}
