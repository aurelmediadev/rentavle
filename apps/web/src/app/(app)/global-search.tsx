"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { type SearchResult, globalSearch } from "./search-actions";

const GROUPS: SearchResult["group"][] = ["Contratos", "Clientes", "Propiedades", "Movimientos"];

/** Search box in the top bar (Ctrl/⌘ K): contracts, clients, properties and movements. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Results with the query they answer, so "nothing found" never shows for a query still on its way.
  const [answer, setAnswer] = useState<{ query: string; results: SearchResult[] }>({ query: "", results: [] });
  const [, startTransition] = useTransition();
  const latest = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = ++latest.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = query.trim() ? await globalSearch(query) : [];
        // Ignore answers to older queries.
        if (id === latest.current) setAnswer({ query, results: found });
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <Button variant="outline" className="text-muted-foreground w-full max-w-xs justify-start gap-2 font-normal" onClick={() => setOpen(true)}>
        <Search />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="bg-muted hidden rounded px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Buscar" description="Contratos, clientes, propiedades y movimientos">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nombre, dirección, DNI, CUIT, email o número…" value={query} onValueChange={setQuery} />
          <CommandList>
            {query.trim() && answer.query === query && <CommandEmpty>No se encontró nada.</CommandEmpty>}
            {GROUPS.map((group) => {
              const items = answer.results.filter((r) => r.group === group);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={group} heading={group}>
                  {items.map((r) => (
                    <CommandItem key={r.href} value={r.href} onSelect={() => go(r.href)}>
                      <div className="grid">
                        <span>{r.label}</span>
                        {r.detail && <span className="text-muted-foreground text-xs">{r.detail}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
