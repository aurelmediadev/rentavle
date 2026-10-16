import type { ReactNode } from "react";

/** Layout for legal texts. While `draft`, a notice says it still needs legal review. */
export function LegalPage({ title, updated, draft, children }: { title: string; updated: string; draft?: boolean; children: ReactNode }) {
  return (
    <article className="mx-auto grid max-w-3xl gap-6 px-4 py-16 sm:px-6 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_ul]:grid [&_ul]:gap-1">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">Última actualización: {updated}</p>
        {draft && (
          <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Borrador: este texto todavía no fue revisado por un abogado y puede cambiar antes del lanzamiento.
          </p>
        )}
      </header>
      {children}
    </article>
  );
}
