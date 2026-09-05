import Link from "next/link";
import { requireAdmin } from "@/lib/permissions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-8 flex items-center gap-6 border-b pb-4">
        <h1 className="text-xl font-bold">
          <Link href="/admin">Admin</Link>
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/groups" className="hover:underline">
            Groups
          </Link>
          <Link href="/admin/spaces" className="hover:underline">
            Spaces
          </Link>
          <Link href="/admin/all-staff-requests" className="hover:underline">
            All-staff requests
          </Link>
          <Link href="/admin/deletion-requests" className="hover:underline">
            Deletion requests
          </Link>
          <Link href="/admin/guides" className="hover:underline">
            Guides
          </Link>
          <Link href="/admin/tags" className="hover:underline">
            Tags
          </Link>
          <Link href="/admin/settings" className="hover:underline">
            Settings
          </Link>
          <Link href="/admin/mcp" className="hover:underline">
            MCP
          </Link>
          <Link href="/" className="text-gray-500 hover:underline">
            ← Back to KB
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
