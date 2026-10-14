import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-lg font-semibold tracking-tight", className)}>
      <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md">
        <KeyRound className="size-4" aria-hidden />
      </span>
      Rentavle
    </span>
  );
}
