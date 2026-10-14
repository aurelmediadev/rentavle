import { eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { asUser } from "@/lib/auth";
import { UserMenuView } from "./user-menu-view";

export async function UserMenu() {
  const { email, profile } = await asUser(async (tx, user) => {
    const [row] = await tx.select().from(schema.profiles).where(eq(schema.profiles.id, user.id));
    return { email: user.email, profile: row };
  });
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || email;
  return <UserMenuView name={name} email={email} />;
}
