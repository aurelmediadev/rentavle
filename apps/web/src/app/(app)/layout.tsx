import { Suspense } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarMenuSkeleton, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { GlobalSearch } from "./global-search";
import { OrganizationSwitcher } from "./organization-switcher";
import { UserMenu } from "./user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar
        header={
          <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
            <OrganizationSwitcher />
          </Suspense>
        }
        footer={
          <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
            <UserMenu />
          </Suspense>
        }
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <GlobalSearch />
        </header>
        {/* Pages stream in behind loading.tsx */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
