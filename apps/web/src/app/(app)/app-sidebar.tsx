"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ArrowLeftRight, Banknote, Building2, Contact, FileText, LayoutDashboard, LineChart, MessageSquareText, Store, TrendingUp, Users, Wallet } from "lucide-react";
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
      { href: "/contratos", label: "Contratos", icon: FileText, exact: true },
      { href: "/contratos/actualizaciones", label: "Actualizaciones", icon: TrendingUp },
      { href: "/propiedades", label: "Propiedades", icon: Building2 },
      { href: "/clientes", label: "Clientes", icon: Contact },
      { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
      { href: "/liquidaciones", label: "Liquidaciones", icon: Banknote },
      { href: "/caja", label: "Caja", icon: Wallet },
      { href: "/indices", label: "Índices", icon: LineChart },
    ],
  },
  {
    label: "Configuración",
    items: [
      { href: "/configuracion/inmobiliaria", label: "Inmobiliaria", icon: Store },
      { href: "/configuracion/mensajes", label: "Mensajes", icon: MessageSquareText },
      { href: "/configuracion/usuarios", label: "Usuarios", icon: Users },
    ],
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

interface NavItem {
  href: string;
  /** Contratos stays active on /contratos/12 but not on /contratos/actualizaciones. */
  exact?: boolean;
}

function isActive(item: NavItem, path: string | null) {
  if (!path) return false;
  if (!path.startsWith(item.href)) return false;
  if (!item.exact) return true;
  const rest = path.slice(item.href.length);
  return rest === "" || /^\/(\d+|nuevo)(\/|$)/.test(rest);
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
              <SidebarMenuButton asChild isActive={isActive(item, activePath)} tooltip={item.label}>
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
