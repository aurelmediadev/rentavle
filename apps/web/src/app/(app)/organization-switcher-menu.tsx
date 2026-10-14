"use client";

import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { switchOrganization } from "./actions";

interface Org {
  id: string;
  name: string;
  role: "admin" | "operator";
}

const ROLE_LABEL = { admin: "Administrador", operator: "Operador" } as const;

export function OrganizationSwitcherMenu({ active, organizations }: { active: Org; organizations: Org[] }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-md">
                <Building2 className="size-4" />
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{active.name}</span>
                <span className="text-muted-foreground truncate text-xs">{ROLE_LABEL[active.role]}</span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel className="text-muted-foreground text-xs">Inmobiliarias</DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem key={org.id} onSelect={() => void switchOrganization(org.id)}>
                <span className="flex-1 truncate">{org.name}</span>
                {org.id === active.id && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/bienvenida">
                <Plus className="size-4" />
                Crear otra inmobiliaria
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
