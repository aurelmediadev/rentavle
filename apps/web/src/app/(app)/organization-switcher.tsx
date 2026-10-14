import { getActiveMembership, getMemberships } from "@/lib/auth";
import { OrganizationSwitcherMenu } from "./organization-switcher-menu";

export async function OrganizationSwitcher() {
  const [active, memberships] = await Promise.all([getActiveMembership(), getMemberships()]);
  return (
    <OrganizationSwitcherMenu
      active={{ id: active.organizationId, name: active.organizationName, role: active.role }}
      organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organizationName, role: m.role }))}
    />
  );
}
