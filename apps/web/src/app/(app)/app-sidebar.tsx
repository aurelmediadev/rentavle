"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Building2, Contact, LayoutDashboard, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// New modules are added here as each phase ships (docs/06-roadmap.md).
const sections = [
  {
    label: "Administración",
    items: [
      { href: "/panel", label: "Panel", icon: LayoutDashboard },
      { href: "/propiedades", label: "Propiedades", icon: Building2 },
      { href: "/clientes", label: "Clientes", icon: Contact },
    ],
  },
  {
    label: "Configuración",
    items: [{ href: "/configuracion/usuarios", label: "Usuarios", icon: Users }],
  },
];

export function AppSidebar({ header, footer }: { header: ReactNode; footer: ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>{header}</SidebarHeader>
      <SidebarContent>
        {/* The active item depends on the URL, which dynamic routes only know at request time. */}
        <Suspense fallback={<Navigation activePath={null} />}>
          <ActiveNavigation />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveNavigation() {
  return <Navigation activePath={usePathname()} />;
}

function Navigation({ activePath }: { activePath: string | null }) {
  return sections.map((section) => (
    <SidebarGroup key={section.label}>
      <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={activePath?.startsWith(item.href) ?? false} tooltip={item.label}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
