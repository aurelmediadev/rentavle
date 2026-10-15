import Decimal from 'decimal.js';
import { and, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { type Database, schema } from '@rentavle/db';
import { type NoticeSettings, accessFor, addDaysIso, amountUpdateNotice, contractExpiryNotice, debtNotice, parseNoticeSettings } from '@rentavle/domain';
import {
  type CommunicationType,
  DEFAULT_TEMPLATES,
  type Mailer,
  emailHtml,
  renderTemplate,
  senderAddress,
} from '@rentavle/emails';

const { organizations, contracts, contractParties, clients, clientContacts, properties, charges, chargeAllocations, movements, rentPeriods, communications, messageTemplates } =
  schema;

export interface SendCommunicationsOptions {
  now: Date;
  mailer: Mailer;
  organizationId?: string;
  env?: Record<string, string | undefined>;
}

export interface SendCommunicationsResult {
  organizations: number;
  sent: number;
  failed: number;
  /** Already sent before (dedupe key taken). */
  skipped: number;
  retried: number;
}

interface Recipient {
  clientId: string | null;
  name: string;
  emails: string[];
}

interface Notice {
  type: CommunicationType;
  key: string;
  contractId: string;
  recipients: Recipient[];
  variables: Record<string, string>;
}

const MAX_ATTEMPTS = 3;
const NO_EMAIL = 'Sin email cargado';

function todayIn(now: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

const personName = (c: { kind: string; firstName: string | null; lastName: string | null; companyName: string | null }) =>
  c.kind === 'company' ? (c.companyName ?? '') : [c.firstName, c.lastName].filter(Boolean).join(' ');
const address = (p: { street: string | null; streetNumber: string | null; unit: string | null }) =>
  [p.street, p.streetNumber, p.unit].filter(Boolean).join(' ');

function formatters(locale: string) {
  const long = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return {
    money: (amount: string, currency: string) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(
        amount as unknown as number,
      ),
    date: (iso: string) => long.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)),
    month: (iso: string) => month.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)),
    pct: (value: string) => `${number.format(value as unknown as number)} %`,
  };
}

/**
 * Sends the automatic notices that are due today in each organization: payment
 * reminders, late notices, new rent amounts and contract expiries (only those
 * the agency turned on). Idempotent: every notice is recorded with a dedupe key
 * before sending, so running it again never sends twice. Failed sends are
 * retried up to 3 times.
 */
export async function sendCommunications(db: Database, opts: SendCommunicationsOptions): Promise<SendCommunicationsResult> {
  const result: SendCommunicationsResult = { organizations: 0, sent: 0, failed: 0, skipped: 0, retried: 0 };
  const orgs = await db
    .select()
    .from(organizations)
    .where(opts.organizationId ? eq(organizations.id, opts.organizationId) : undefined);

  for (const org of orgs) {
    const settings = parseNoticeSettings((org.settings as { notices?: unknown } | null)?.notices);
    if (!settings.paymentReminder && !settings.lateNotice && !settings.amountUpdate && !settings.contractExpiry) continue;
    // Read-only accounts (trial ended, cancelled) send nothing on their behalf.
    if (!accessFor({ status: org.subscriptionStatus, trialEndsAt: org.trialEndsAt }, opts.now).writable) continue;
    result.organizations++;
    const today = todayIn(opts.now, org.timezone);
    const fmt = formatters(org.locale);
    const notices = await noticesDue(db, org, today, settings, fmt);

    const overrides = await db.select().from(messageTemplates).where(and(eq(messageTemplates.organizationId, org.id), eq(messageTemplates.channel, 'email')));
    const from = senderAddress(org.name, opts.env);

    // First, retry earlier automatic notices that failed to send (not the ones without an email).
    const failed = await db
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, org.id),
          eq(communications.sender, 'automatic'),
          eq(communications.status, 'failed'),
          lt(communications.attempts, MAX_ATTEMPTS),
          gte(communications.createdAt, new Date(opts.now.getTime() - 3 * 86_400_000)),
          sql`${communications.error} is distinct from ${NO_EMAIL}`,
        ),
      );
    for (const c of failed) {
      result.retried++;
      const ok = await deliver(db, opts.mailer, c.id, {
        from,
        replyTo: org.email,
        to: c.toAddress.split(', ').map((email) => ({ email })),
        subject: c.subject ?? '',
        body: c.body,
        agencyName: org.name,
      });
      if (ok) result.sent++;
    }

    for (const notice of notices) {
      const template = overrides.find((t) => t.type === notice.type) ?? DEFAULT_TEMPLATES[notice.type].email;
      for (const recipient of notice.recipients) {
        const variables = { ...notice.variables, INMOBILIARIA: org.name, NOMBRE: recipient.name };
        const subject = renderTemplate(template.subject ?? '', variables);
        const body = renderTemplate(template.body, variables);
        const [row] = await db
          .insert(communications)
          .values({
            organizationId: org.id,
            contractId: notice.contractId,
            clientId: recipient.clientId,
            type: notice.type,
            channel: 'email',
            sender: 'automatic',
            toAddress: recipient.emails.join(', '),
            subject,
            body,
            dedupeKey: `${notice.key}:${recipient.clientId ?? 'agency'}`,
            status: recipient.emails.length ? 'queued' : 'failed',
            error: recipient.emails.length ? null : NO_EMAIL,
          })
          .onConflictDoNothing()
          .returning({ id: communications.id });
        if (!row) {
          result.skipped++;
          continue;
        }
        if (!recipient.emails.length) {
          result.failed++;
          continue;
        }
        const ok = await deliver(db, opts.mailer, row.id, {
          from,
          replyTo: org.email,
          to: recipient.emails.map((email) => ({ email, name: recipient.name })),
          subject,
          body,
          agencyName: org.name,
        });
        if (ok) result.sent++;
        else result.failed++;
      }
    }

  }
  return result;
}

async function deliver(
  db: Database,
  mailer: Mailer,
  communicationId: string,
  m: { from: { email: string; name?: string }; replyTo: string | null; to: { email: string; name?: string }[]; subject: string; body: string; agencyName: string },
): Promise<boolean> {
  try {
    const { id } = await mailer.send({
      from: m.from,
      replyTo: m.replyTo,
      to: m.to,
      subject: m.subject,
      text: m.body,
      html: emailHtml({ agencyName: m.agencyName, body: m.body }),
      tags: { communication: communicationId },
    });
    await db
      .update(communications)
      .set({ status: 'sent', providerMessageId: id, sentAt: new Date(), error: null, attempts: sql`${communications.attempts} + 1` })
      .where(eq(communications.id, communicationId));
    return true;
  } catch (error) {
    await db
      .update(communications)
      .set({ status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'Error al enviar', attempts: sql`${communications.attempts} + 1` })
      .where(eq(communications.id, communicationId));
    return false;
  }
}

async function contractRecipients(db: Database, contractIds: string[], roles: ('tenant' | 'owner')[]) {
  if (contractIds.length === 0) return new Map<string, Recipient[]>();
  const parties = await db
    .select({ contractId: contractParties.contractId, client: clients })
    .from(contractParties)
    .innerJoin(clients, eq(clients.id, contractParties.clientId))
    .where(and(inArray(contractParties.contractId, contractIds), inArray(contractParties.role, roles)));
  const contacts = parties.length
    ? await db
        .select()
        .from(clientContacts)
        .where(and(inArray(clientContacts.clientId, [...new Set(parties.map((p) => p.client.id))]), eq(clientContacts.type, 'email')))
    : [];
  const byContract = new Map<string, Recipient[]>();
  for (const p of parties) {
    const emails = contacts
      .filter((c) => c.clientId === p.client.id)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((c) => c.value.trim());
    byContract.set(p.contractId, [...(byContract.get(p.contractId) ?? []), { clientId: p.client.id, name: personName(p.client), emails }]);
  }
  return byContract;
}

async function noticesDue(
  db: Database,
  org: typeof organizations.$inferSelect,
  today: string,
  settings: NoticeSettings,
  fmt: ReturnType<typeof formatters>,
): Promise<Notice[]> {
  const notices: Notice[] = [];
  const active = await db
    .select({ contract: contracts, street: properties.street, streetNumber: properties.streetNumber, unit: properties.unit })
    .from(contracts)
    .innerJoin(properties, eq(properties.id, contracts.propertyId))
    .where(and(eq(contracts.organizationId, org.id), eq(contracts.status, 'active'), isNull(contracts.deletedAt)));
  if (active.length === 0) return notices;
  const byId = new Map(active.map((a) => [a.contract.id, a]));
  const ids = [...byId.keys()];
  const tenants = await contractRecipients(db, ids, ['tenant']);

  if (settings.paymentReminder || settings.lateNotice) {
    const debts = await db
      .select({
        id: charges.id,
        contractId: charges.contractId,
        type: charges.type,
        title: charges.title,
        periodMonth: charges.periodMonth,
        dueDate: charges.dueDate,
        amount: charges.amount,
        currency: charges.currency,
        paid: sql<string>`coalesce((
          select sum(a.amount) from ${chargeAllocations} a join ${movements} m on m.id = a.movement_id
          where a.charge_id = "charges"."id" and m.reversed_at is null), 0)`,
      })
      .from(charges)
      .where(
        and(
          inArray(charges.contractId, ids),
          eq(charges.debtor, 'tenant'),
          inArray(charges.status, ['pending', 'partially_paid']),
          eq(charges.isConfirmed, true),
          sql`${charges.amount} > 0`,
          gte(charges.dueDate, addDaysIso(today, -40)),
          lte(charges.dueDate, addDaysIso(today, 40)),
        ),
      )
      .orderBy(charges.periodMonth, charges.createdAt);

    // One notice per contract and due date, listing what is owed.
    const groups = new Map<string, typeof debts>();
    for (const d of debts) groups.set(`${d.contractId}:${d.dueDate}`, [...(groups.get(`${d.contractId}:${d.dueDate}`) ?? []), d]);
    for (const [groupId, group] of groups) {
      const first = group[0]!;
      const outstanding = group.reduce((t, d) => t.plus(d.amount).minus(d.paid), new Decimal(0));
      if (outstanding.lte(0)) continue;
      const notice = debtNotice(today, { id: groupId, dueDate: first.dueDate }, settings);
      if (!notice) continue;
      const place = byId.get(first.contractId)!;
      const concepts = group.map((d) => `${d.type === 'rent' ? 'alquiler' : d.title} de ${fmt.month(d.periodMonth)}`);
      notices.push({
        type: notice.type,
        key: notice.key,
        contractId: first.contractId,
        recipients: tenants.get(first.contractId) ?? [],
        variables: {
          CONCEPTO: concepts.length > 1 ? `${concepts.slice(0, -1).join(', ')} y ${concepts.at(-1)}` : concepts[0]!,
          MONTO: fmt.money(outstanding.toFixed(2), first.currency),
          VENCIMIENTO: fmt.date(first.dueDate),
          DIAS_MORA: notice.type === 'late_notice' ? String(notice.daysLate) : '',
          DIRECCION: address(place),
        },
      });
    }
  }

  if (settings.amountUpdate) {
    const periods = await db
      .select()
      .from(rentPeriods)
      .where(
        and(
          inArray(rentPeriods.contractId, ids),
          inArray(rentPeriods.status, ['calculated', 'manually_adjusted']),
          gte(rentPeriods.startMonth, addDaysIso(today, -10)),
          lte(rentPeriods.startMonth, addDaysIso(today, settings.updateDaysBefore + 1)),
        ),
      );
    const everyone = await contractRecipients(db, [...new Set(periods.map((p) => p.contractId))], ['tenant', 'owner']);
    for (const p of periods) {
      const notice = amountUpdateNotice(today, { id: p.id, startMonth: p.startMonth, confirmed: true }, settings);
      if (!notice || !p.amount || !p.previousAmount) continue;
      const place = byId.get(p.contractId)!;
      notices.push({
        type: 'amount_update',
        key: notice.key,
        contractId: p.contractId,
        recipients: everyone.get(p.contractId) ?? [],
        variables: {
          MES: fmt.month(p.startMonth),
          MONTO_ANTERIOR: fmt.money(p.previousAmount, place.contract.currency),
          NUEVO_MONTO: fmt.money(p.amount, place.contract.currency),
          VARIACION: p.variationPct ? `+${fmt.pct(p.variationPct)}` : '',
          DIRECCION: address(place),
        },
      });
    }
  }

  if (settings.contractExpiry) {
    const agency = await agencyRecipient(db, org);
    for (const { contract, ...place } of active) {
      const notice = contractExpiryNotice(today, { id: contract.id, endDate: contract.endDate }, settings);
      if (!notice) continue;
      notices.push({
        type: 'contract_expiry',
        key: notice.key,
        contractId: contract.id,
        recipients: [agency],
        variables: {
          CONTRATO: String(contract.number),
          DIRECCION: address(place),
          INQUILINO: (tenants.get(contract.id) ?? []).map((t) => t.name).join(', '),
          VENCIMIENTO: fmt.date(contract.endDate),
          DIAS: String(notice.daysLeft),
        },
      });
    }
  }
  return notices;
}

/** The agency's own address, or its administrators' if it has none. */
async function agencyRecipient(db: Database, org: typeof organizations.$inferSelect): Promise<Recipient> {
  if (org.email) return { clientId: null, name: org.name, emails: [org.email] };
  const admins = await db.execute<{ email: string }>(sql`
    select u.email from public.memberships m join auth.users u on u.id = m.user_id
    where m.organization_id = ${org.id} and m.role = 'admin' and u.email is not null
  `);
  return { clientId: null, name: org.name, emails: admins.map((a) => a.email) };
}
