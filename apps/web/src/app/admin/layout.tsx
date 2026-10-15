import Link from "next/link";
import { KeyRound } from "lucide-react";

/** Internal admin panel (Rentavle staff): its own bare layout, outside the agencies' app. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-svh">
      <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4" /> Rentavle · Panel interno
        </Link>
        <Link href="/panel" className="text-muted-foreground text-sm hover:underline">
          Volver a la app
        </Link>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </div>
  );
}
