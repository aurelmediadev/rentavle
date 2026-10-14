import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shown while a session-dependent page streams in. */
export function PageLoading() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
