import type { Metadata } from "next";
import { Suspense } from "react";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asUser, getActiveMembership } from "@/lib/auth";
import { InviteForm } from "./invite-form";
import { RemoveMemberButton, RevokeInvitationButton } from "./row-actions";

export const metadata: Metadata = { title: "Usuarios · Rentavle" };

const ROLE_LABEL = { admin: "Administrador", operator: "Operador" } as const;

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });

export default function UsersPage() {
  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground text-sm">Usuarios ilimitados en todos los planes.</p>
      </div>
      <Suspense fallback={<PageLoading />}>
        <Users />
      </Suspense>
    </div>
  );
}

async function Users() {
  const membership = await getActiveMembership();
  const isAdmin = membership.role === "admin";

  const { members, pending, currentUserId } = await asUser(async (tx, user) => {
    const members = await tx
      .select({
        id: schema.memberships.id,
        userId: schema.memberships.userId,
        role: schema.memberships.role,
        firstName: schema.profiles.firstName,
        lastName: schema.profiles.lastName,
      })
      .from(schema.memberships)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.memberships.userId))
      .where(eq(schema.memberships.organizationId, membership.organizationId))
      .orderBy(asc(schema.profiles.firstName));

    const pending = isAdmin
      ? await tx
          .select()
          .from(schema.invitations)
          .where(
            and(
              eq(schema.invitations.organizationId, membership.organizationId),
              isNull(schema.invitations.acceptedAt),
              gt(schema.invitations.expiresAt, new Date()),
            ),
          )
          .orderBy(asc(schema.invitations.createdAt))
      : [];

    return { members, pending, currentUserId: user.id };
  });

  return (
    <>
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invitar</CardTitle>
            <CardDescription>
              Los administradores pueden configurar la cuenta e invitar gente; los operadores trabajan con los datos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Equipo</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                {isAdmin && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    {[m.firstName, m.lastName].filter(Boolean).join(" ") || "Sin nombre"}
                    {m.userId === currentUserId && <span className="text-muted-foreground"> (vos)</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.role === "admin" ? "default" : "secondary"}>{ROLE_LABEL[m.role]}</Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>{m.userId !== currentUserId && <RemoveMemberButton membershipId={m.id} />}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{ROLE_LABEL[inv.role]}</TableCell>
                    <TableCell>{dateFormat.format(inv.expiresAt)}</TableCell>
                    <TableCell>
                      <RevokeInvitationButton invitationId={inv.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
