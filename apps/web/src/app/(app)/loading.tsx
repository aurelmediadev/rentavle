import { PageLoading } from "@/components/page-loading";

// Each segment under the app needs its own loading boundary: client navigations
// between sibling pages re-render below the mounted parent (docs: instant navigation).
export default function Loading() {
  return <PageLoading />;
}
