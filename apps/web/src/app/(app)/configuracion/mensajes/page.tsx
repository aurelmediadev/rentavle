import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { schema } from "@rentavle/db";
import { parseNoticeSettings } from "@rentavle/domain";
import { DEFAULT_TEMPLATES, TYPE_LABEL, TYPE_RECIPIENTS, TYPE_VARIABLES, communicationTypes } from "@rentavle/emails";
import { PageLoading } from "@/components/page-loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asUser, getActiveMembership } from "@/lib/auth";
import { NoticeSettingsForm, TemplateDialog } from "./message-forms";

export const metadata: Metadata = { title: "Mensajes · Rentavle" };

export default function MessagesPage() {
  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mensajes</h1>
        <p className="text-muted-foreground text-sm">Avisos automáticos por email y los textos de cada mensaje.</p>
      </div>
      <Suspense fallback={<PageLoading />}>
        <Messages />
      </Suspense>
    </div>
  );
}

async function Messages() {
  const { organizationId, role } = await getActiveMembership();
  if (role !== "admin") return <p className="text-muted-foreground text-sm">Solo un administrador puede cambiar los mensajes.</p>;
  const { org, templates } = await asUser(async (tx) => {
    const [org] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId));
    const templates = await tx.select().from(schema.messageTemplates).where(eq(schema.messageTemplates.organizationId, organizationId));
    return { org: org!, templates };
  });
  const notices = parseNoticeSettings((org.settings as { notices?: unknown } | null)?.notices);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Avisos automáticos</CardTitle>
          <CardDescription>
            Se envían solos por email una vez por día. Empiezan apagados: activalos cuando los datos de contacto de tus clientes estén al día. Nunca se manda dos veces el mismo aviso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NoticeSettingsForm initial={notices} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Textos</CardTitle>
          <CardDescription>Cada mensaje tiene una versión para email y otra para WhatsApp. Podés cambiarlos y volver al original cuando quieras.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mensaje</TableHead>
                <TableHead className="hidden sm:table-cell">Para</TableHead>
                <TableHead />
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {communicationTypes.map((type) => {
                const own = (channel: "email" | "whatsapp") => templates.find((t) => t.type === type && t.channel === channel);
                const email = own("email") ?? DEFAULT_TEMPLATES[type].email;
                const whatsapp = own("whatsapp") ?? DEFAULT_TEMPLATES[type].whatsapp;
                const customized = Boolean(own("email") || own("whatsapp"));
                return (
                  <TableRow key={type}>
                    <TableCell className="font-medium">{TYPE_LABEL[type]}</TableCell>
                    <TableCell className="hidden sm:table-cell">{TYPE_RECIPIENTS[type]}</TableCell>
                    <TableCell>{customized && <Badge variant="secondary">Personalizado</Badge>}</TableCell>
                    <TableCell>
                      <TemplateDialog
                        type={type}
                        label={TYPE_LABEL[type]}
                        variables={TYPE_VARIABLES[type]}
                        customized={customized}
                        email={{ subject: email.subject ?? "", body: email.body }}
                        whatsapp={{ body: whatsapp.body }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
