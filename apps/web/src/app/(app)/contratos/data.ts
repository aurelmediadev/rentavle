import "server-only";
import Decimal from "decimal.js";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { schema, type Transaction } from "@rentavle/db";
import { formatYearMonth, parseYearMonth, planPeriods, updatePeriods } from "@rentavle/domain";
import { asUser, getActiveMembership } from "@/lib/auth";
import { addDays, dateToMonth, monthToDate, todayIn } from "@/lib/dates";
import { trimDecimal } from "@/lib/numbers";
import { type ContractConditions, type ContractInput, FIXED_PCT, NO_UPDATE } from "./contract-input";

const { contracts, contractParties, rentPeriods, contractEvents, clients, properties, propertyOwners, indexSeries, profiles } =
  schema;

export type ContractRow = typeof contracts.$inferSelect;
export type ContractEventType = (typeof schema.contractEventType.enumValues)[number];

const partyColumns = {
  contractId: contractParties.contractId,
  role: contractParties.role,
  sharePct: contractParties.sharePct,
  clientId: clients.id,
  clientNumber: clients.number,
  kind: clients.kind,
  firstName: clients.firstName,
  lastName: clients.lastName,
  companyName: clients.companyName,
};

/** Index series available in the organization's country (for the "Actualización" select). */
export async function listIndexSeries() {
  const { countryCode } = await getActiveMembership();
  return asUser((tx) =>
    tx
      .select({ id: indexSeries.id, code: indexSeries.code, name: indexSeries.name })
      .from(indexSeries)
      .where(eq(indexSeries.countryCode, countryCode))
      .orderBy(asc(indexSeries.code)),
  );
}

export async function listPropertyOptions() {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const rows = await tx
      .select({
        id: properties.id,
        number: properties.number,
        street: properties.street,
        streetNumber: properties.streetNumber,
        unit: properties.unit,
        city: properties.city,
      })
      .from(properties)
      .where(and(eq(properties.organizationId, organizationId), isNull(properties.deletedAt)))
      .orderBy(asc(properties.street), asc(properties.streetNumber));
    const owners = rows.length
      ? await tx
          .select({
            propertyId: propertyOwners.propertyId,
            kind: clients.kind,
            firstName: clients.firstName,
            lastName: clients.lastName,
            companyName: clients.companyName,
          })
          .from(propertyOwners)
          .innerJoin(clients, eq(clients.id, propertyOwners.clientId))
          .where(inArray(propertyOwners.propertyId, rows.map((r) => r.id)))
      : [];
    return rows.map((r) => ({ ...r, owners: owners.filter((o) => o.propertyId === r.id) }));
  });
}

export type ContractListFilter = "active" | "finished" | "all";

export async function listContracts(opts: { query?: string; filter: ContractListFilter }) {
  const { organizationId } = await getActiveMembership();
  const q = opts.query?.trim();
  return asUser(async (tx) => {
    const filters = [eq(contracts.organizationId, organizationId), isNull(contracts.deletedAt)];
    if (opts.filter === "active") filters.push(eq(contracts.status, "active"));
    if (opts.filter === "finished") filters.push(ne(contracts.status, "active"));
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(sql`concat_ws(' ', ${properties.street}, ${properties.streetNumber}, ${properties.unit}, ${properties.city})`, like),
          sql`exists (
            select 1 from ${contractParties} cp join ${clients} c on c.id = cp.client_id
            where cp.contract_id = ${contracts.id}
              and concat_ws(' ', c.first_name, c.last_name, c.company_name) ilike ${like}
          )`,
          sql`${contracts.number}::text = ${q.replace(/^#/, "")}`,
        )!,
      );
    }

    const rows = await tx
      .select({
        contract: contracts,
        property: {
          number: properties.number,
          street: properties.street,
          streetNumber: properties.streetNumber,
          unit: properties.unit,
          city: properties.city,
        },
      })
      .from(contracts)
      .innerJoin(properties, eq(properties.id, contracts.propertyId))
      .where(and(...filters))
      .orderBy(desc(contracts.number))
      .limit(200);

    const ids = rows.map((r) => r.contract.id);
    const [parties, currentAmounts] = ids.length
      ? await Promise.all([
          tx
            .select(partyColumns)
            .from(contractParties)
            .innerJoin(clients, eq(clients.id, contractParties.clientId))
            .where(inArray(contractParties.contractId, ids)),
          // Latest period with an amount = current rent.
          tx
            .selectDistinctOn([rentPeriods.contractId], { contractId: rentPeriods.contractId, amount: rentPeriods.amount })
            .from(rentPeriods)
            .where(and(inArray(rentPeriods.contractId, ids), sql`${rentPeriods.amount} is not null`))
            .orderBy(rentPeriods.contractId, desc(rentPeriods.periodNumber)),
        ])
      : [[], []];

    return rows.map((r) => ({
      ...r,
      tenants: parties.filter((p) => p.contractId === r.contract.id && p.role === "tenant"),
      owners: parties.filter((p) => p.contractId === r.contract.id && p.role === "owner"),
      currentAmount: currentAmounts.find((a) => a.contractId === r.contract.id)?.amount ?? r.contract.initialAmount,
    }));
  });
}

export async function getContractByNumber(number: number) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const [row] = await tx
      .select({ contract: contracts, property: properties, series: { code: indexSeries.code, name: indexSeries.name } })
      .from(contracts)
      .innerJoin(properties, eq(properties.id, contracts.propertyId))
      .leftJoin(indexSeries, eq(indexSeries.id, contracts.indexSeriesId))
      .where(and(eq(contracts.organizationId, organizationId), eq(contracts.number, number)));
    if (!row) return null;

    const [parties, periods, events, renewedTo, renewedFrom] = await Promise.all([
      tx
        .select(partyColumns)
        .from(contractParties)
        .innerJoin(clients, eq(clients.id, contractParties.clientId))
        .where(eq(contractParties.contractId, row.contract.id))
        .orderBy(asc(clients.lastName)),
      tx.select().from(rentPeriods).where(eq(rentPeriods.contractId, row.contract.id)).orderBy(asc(rentPeriods.periodNumber)),
      tx
        .select({
          id: contractEvents.id,
          type: contractEvents.type,
          reason: contractEvents.reason,
          payload: contractEvents.payload,
          createdAt: contractEvents.createdAt,
          firstName: profiles.firstName,
          lastName: profiles.lastName,
        })
        .from(contractEvents)
        .leftJoin(profiles, eq(profiles.id, contractEvents.createdBy))
        .where(eq(contractEvents.contractId, row.contract.id))
        .orderBy(desc(contractEvents.createdAt)),
      tx
        .select({ number: contracts.number })
        .from(contracts)
        .where(eq(contracts.renewedFromContractId, row.contract.id)),
      row.contract.renewedFromContractId
        ? tx.select({ number: contracts.number }).from(contracts).where(eq(contracts.id, row.contract.renewedFromContractId))
        : Promise.resolve([]),
    ]);
    return { ...row, parties, periods, events, renewedTo: renewedTo[0] ?? null, renewedFrom: renewedFrom[0] ?? null };
  });
}

async function logEvent(
  tx: Transaction,
  contract: { id: string; organizationId: string },
  userId: string,
  type: ContractEventType,
  extra: { reason?: string | null; payload?: Record<string, unknown> } = {},
) {
  await tx.insert(contractEvents).values({
    organizationId: contract.organizationId,
    contractId: contract.id,
    type,
    reason: extra.reason ?? null,
    payload: extra.payload ?? {},
    createdBy: userId,
  });
}

/** Marks the property rented while it has an active contract covering today. */
async function syncPropertyStatus(tx: Transaction, propertyId: string, today: string) {
  const [active] = await tx
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        eq(contracts.propertyId, propertyId),
        eq(contracts.status, "active"),
        isNull(contracts.deletedAt),
        sql`${contracts.startDate} <= ${today} and ${contracts.endDate} >= ${today}`,
      ),
    )
    .limit(1);
  await tx
    .update(properties)
    .set({ status: active ? "rented" : "available" })
    .where(and(eq(properties.id, propertyId), ne(properties.status, "unavailable")));
}

export class ContractConflictError extends Error {}

/** Marks debts voided by an early termination, so undoing it can restore them. */
const TERMINATION_VOID_REASON = "Rescisión anticipada del contrato";

export async function insertContract(input: ContractInput) {
  const { organizationId, timezone } = await getActiveMembership();
  const seriesId =
    input.update === NO_UPDATE || input.update === FIXED_PCT
      ? null
      : ((await listIndexSeries()).find((s) => s.code === input.update)?.id ?? null);
  if (input.update !== NO_UPDATE && input.update !== FIXED_PCT && !seriesId) {
    throw new Error(`Unknown index series ${input.update}`);
  }

  const term = { startDate: input.startDate, endDate: input.endDate };
  const firstBilled = parseYearMonth(input.firstBilledMonth);
  const plan = planPeriods(term, input.updateFrequencyMonths ?? null, firstBilled);

  return asUser(async (tx, user) => {
    const owners = await tx
      .select({ clientId: propertyOwners.clientId, pct: propertyOwners.ownershipPct })
      .from(propertyOwners)
      .where(eq(propertyOwners.propertyId, input.propertyId));
    if (owners.length === 0) throw new Error("La propiedad no tiene propietarios");

    let created: { id: string; number: number; organizationId: string };
    try {
      [created] = (await tx
        .insert(contracts)
        .values({
          organizationId,
          propertyId: input.propertyId,
          startDate: input.startDate,
          endDate: input.endDate,
          originalEndDate: input.endDate,
          currency: input.currency,
          initialAmount: input.amount,
          firstBilledMonth: monthToDate(input.firstBilledMonth),
          updateMode: input.update === NO_UPDATE ? "none" : input.update === FIXED_PCT ? "fixed_pct" : "index",
          indexSeriesId: seriesId,
          fixedUpdatePct: input.fixedUpdatePct ?? null,
          updateFrequencyMonths: input.updateFrequencyMonths ?? null,
          feeType: input.feeType,
          feeValue: input.feeValue,
          feesOnLateInterest: input.feesOnLateInterest === "on",
          lateInterestDailyPct: input.lateInterestDailyPct,
          dueDay: input.dueDay,
          lateInterestFrom: input.lateInterestFrom,
          collectionMethod: input.collectionMethod,
          notes: input.notes ?? null,
          renewedFromContractId: input.renewedFromContractId ?? null,
          createdBy: user.id,
        })
        .returning({ id: contracts.id, number: contracts.number, organizationId: contracts.organizationId })) as [
        typeof created,
      ];
    } catch (error) {
      if ((error as { cause?: { constraint_name?: string } }).cause?.constraint_name === "contracts_no_overlap") {
        throw new ContractConflictError("La propiedad ya tiene un contrato activo en esas fechas");
      }
      throw error;
    }

    await tx.insert(contractParties).values([
      ...owners.map((o) => ({ organizationId, contractId: created.id, clientId: o.clientId, role: "owner" as const, sharePct: o.pct })),
      ...input.tenantIds.map((clientId) => ({ organizationId, contractId: created.id, clientId, role: "tenant" as const })),
      ...input.guarantorIds.map((clientId) => ({ organizationId, contractId: created.id, clientId, role: "guarantor" as const })),
    ]);

    await tx.insert(rentPeriods).values(
      plan.map((p) => ({
        organizationId,
        contractId: created.id,
        periodNumber: p.number,
        startMonth: monthToDate(formatYearMonth(p.startMonth)),
        endMonth: monthToDate(formatYearMonth(p.endMonth)),
        status: p.status,
        amount: p.status === "initial" ? input.amount : null,
      })),
    );

    await logEvent(tx, created, user.id, "created", {
      payload: { firstBilledMonth: input.firstBilledMonth, amount: input.amount },
    });

    if (input.renewedFromContractId) {
      const [previous] = await tx
        .update(contracts)
        .set({ status: "renewed", finishedAt: new Date() })
        .where(and(eq(contracts.id, input.renewedFromContractId), eq(contracts.organizationId, organizationId)))
        .returning({ id: contracts.id, organizationId: contracts.organizationId });
      if (previous) await logEvent(tx, previous, user.id, "renewed", { payload: { newContractNumber: created.number } });
    }

    await syncPropertyStatus(tx, input.propertyId, todayIn(timezone));
    return created;
  });
}

/**
 * Re-plans update periods after the end date changes. Periods inside the new
 * term keep their status and amounts; new ones wait for their update; periods
 * past the new end are removed (no debts exist for them yet).
 */
async function replanPeriods(tx: Transaction, contract: ContractRow, newEndDate: string) {
  const planned = updatePeriods({ startDate: contract.startDate, endDate: newEndDate }, contract.updateFrequencyMonths);
  const existing = await tx.select().from(rentPeriods).where(eq(rentPeriods.contractId, contract.id));

  for (const p of planned) {
    const startMonth = monthToDate(formatYearMonth(p.startMonth));
    const endMonth = monthToDate(formatYearMonth(p.endMonth));
    const current = existing.find((e) => e.periodNumber === p.number);
    if (current) {
      if (current.endMonth !== endMonth) {
        await tx.update(rentPeriods).set({ endMonth }).where(eq(rentPeriods.id, current.id));
      }
    } else {
      await tx.insert(rentPeriods).values({
        organizationId: contract.organizationId,
        contractId: contract.id,
        periodNumber: p.number,
        startMonth,
        endMonth,
        status: "pending",
      });
    }
  }
  const obsolete = existing.filter((e) => e.periodNumber > planned.length).map((e) => e.id);
  if (obsolete.length) await tx.delete(rentPeriods).where(inArray(rentPeriods.id, obsolete));
}

async function loadContract(tx: Transaction, organizationId: string, contractId: string) {
  const [contract] = await tx
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)));
  if (!contract) throw new Error("Contrato inexistente");
  return contract;
}

export type EndDateChange = "extend" | "terminate";

/** Prórroga (later end date) or rescisión anticipada (earlier end date). */
export async function changeEndDate(contractId: string, kind: EndDateChange, newEndDate: string, reason: string | null) {
  const { organizationId, timezone } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const contract = await loadContract(tx, organizationId, contractId);
    if (contract.status !== "active") throw new ContractConflictError("El contrato no está activo");

    if (kind === "extend" && newEndDate <= contract.endDate) {
      throw new ContractConflictError("La nueva fecha de fin tiene que ser posterior a la actual");
    }
    if (kind === "terminate") {
      if (newEndDate >= contract.endDate) throw new ContractConflictError("La rescisión tiene que ser antes del fin actual");
      if (dateToMonth(newEndDate) < dateToMonth(contract.firstBilledMonth)) {
        throw new ContractConflictError("No puede terminar antes del primer mes registrado");
      }
    }

    try {
      // An extension moves the agreed end too; an early termination only the effective end,
      // so it can be undone back to the agreed date.
      await tx
        .update(contracts)
        .set(kind === "extend" ? { endDate: newEndDate, originalEndDate: newEndDate } : { endDate: newEndDate })
        .where(eq(contracts.id, contract.id));
    } catch (error) {
      if ((error as { cause?: { constraint_name?: string } }).cause?.constraint_name === "contracts_no_overlap") {
        throw new ContractConflictError("Se superpone con otro contrato activo de la propiedad");
      }
      throw error;
    }
    await replanPeriods(tx, contract, newEndDate);
    if (kind === "terminate") {
      // Debts after the new end that nobody paid are no longer owed.
      await tx
        .update(schema.charges)
        .set({ status: "void", voidedAt: new Date(), voidReason: TERMINATION_VOID_REASON })
        .where(
          and(
            eq(schema.charges.contractId, contract.id),
            eq(schema.charges.status, "pending"),
            sql`${schema.charges.periodMonth} > date_trunc('month', ${newEndDate}::date)`,
          ),
        );
    }
    await logEvent(tx, contract, user.id, kind === "extend" ? "extended" : "early_termination", {
      reason,
      payload: { previousEndDate: contract.endDate, newEndDate },
    });
    await syncPropertyStatus(tx, contract.propertyId, todayIn(timezone));
  });
}

/** Restores the original end date after an early termination. */
export async function cancelTermination(contractId: string) {
  const { organizationId, timezone } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const contract = await loadContract(tx, organizationId, contractId);
    if (contract.status !== "active" || contract.endDate >= contract.originalEndDate) {
      throw new ContractConflictError("El contrato no tiene una rescisión para anular");
    }
    await tx.update(contracts).set({ endDate: contract.originalEndDate }).where(eq(contracts.id, contract.id));
    await replanPeriods(tx, contract, contract.originalEndDate);
    await tx
      .update(schema.charges)
      .set({ status: "pending", voidedAt: null, voidReason: null })
      .where(
        and(
          eq(schema.charges.contractId, contract.id),
          eq(schema.charges.status, "void"),
          eq(schema.charges.voidReason, TERMINATION_VOID_REASON),
        ),
      );
    await logEvent(tx, contract, user.id, "termination_cancelled", {
      payload: { previousEndDate: contract.endDate, newEndDate: contract.originalEndDate },
    });
    await syncPropertyStatus(tx, contract.propertyId, todayIn(timezone));
  });
}

export async function setFinished(contractId: string, finished: boolean, reason: string | null) {
  const { organizationId, timezone } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const contract = await loadContract(tx, organizationId, contractId);
    if (finished && contract.status !== "active") throw new ContractConflictError("El contrato ya no está activo");
    if (!finished && contract.status !== "finished") throw new ContractConflictError("Solo se reabren contratos finalizados");
    try {
      await tx
        .update(contracts)
        .set(finished ? { status: "finished", finishedAt: new Date() } : { status: "active", finishedAt: null })
        .where(eq(contracts.id, contract.id));
    } catch (error) {
      if ((error as { cause?: { constraint_name?: string } }).cause?.constraint_name === "contracts_no_overlap") {
        throw new ContractConflictError("No se puede reabrir: la propiedad ya tiene otro contrato activo en esas fechas");
      }
      throw error;
    }
    await logEvent(tx, contract, user.id, finished ? "finished" : "reopened", { reason });
    await syncPropertyStatus(tx, contract.propertyId, todayIn(timezone));
  });
}

/** Defaults for a renewal: same property and people, starting the day after the end. */
export async function renewalDefaults(number: number) {
  const result = await getContractByNumber(number);
  if (!result || result.contract.status !== "active") return null;
  const { contract, parties, series } = result;
  const start = addDays(contract.endDate, 1);
  return {
    renewedFromContractId: contract.id,
    renewedFromNumber: contract.number,
    propertyId: contract.propertyId,
    tenantIds: parties.filter((p) => p.role === "tenant").map((p) => p.clientId),
    guarantorIds: parties.filter((p) => p.role === "guarantor").map((p) => p.clientId),
    values: {
      startDate: start,
      currency: contract.currency,
      update: contract.updateMode === "index" ? (series?.code ?? NO_UPDATE) : contract.updateMode === "fixed_pct" ? FIXED_PCT : NO_UPDATE,
      updateFrequencyMonths: contract.updateFrequencyMonths ? String(contract.updateFrequencyMonths) : "",
      fixedUpdatePct: contract.fixedUpdatePct ? trimDecimal(contract.fixedUpdatePct) : "",
      feeType: contract.feeType,
      feeValue: trimDecimal(contract.feeValue),
      lateInterestDailyPct: trimDecimal(contract.lateInterestDailyPct),
      dueDay: String(contract.dueDay),
      lateInterestFrom: contract.lateInterestFrom,
      collectionMethod: contract.collectionMethod,
      ...(contract.feesOnLateInterest ? { feesOnLateInterest: "on" } : {}),
    } as Record<string, string>,
  };
}

/** Contracts of a property, for its detail page. */
export async function listPropertyContracts(propertyId: string) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx) => {
    const rows = await tx
      .select({
        id: contracts.id,
        number: contracts.number,
        status: contracts.status,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        originalEndDate: contracts.originalEndDate,
      })
      .from(contracts)
      .where(and(eq(contracts.organizationId, organizationId), eq(contracts.propertyId, propertyId), isNull(contracts.deletedAt)))
      .orderBy(desc(contracts.startDate));
    const tenants = rows.length
      ? await tx
          .select(partyColumns)
          .from(contractParties)
          .innerJoin(clients, eq(clients.id, contractParties.clientId))
          .where(and(inArray(contractParties.contractId, rows.map((r) => r.id)), eq(contractParties.role, "tenant")))
      : [];
    return rows.map((r) => ({ ...r, tenants: tenants.filter((t) => t.contractId === r.id) }));
  });
}

/**
 * Changes the contract's conditions (fees, late interest, due day, collection
 * method, notes). Fees and late interest are read when collecting and settling,
 * so they apply from the next payment or settlement; the due day applies to new
 * debts. The change is logged in the contract history with before/after.
 */
export async function updateContractConditions(contractId: string, input: ContractConditions) {
  const { organizationId } = await getActiveMembership();
  return asUser(async (tx, user) => {
    const contract = await loadContract(tx, organizationId, contractId);
    const next = {
      feeType: input.feeType,
      feeValue: input.feeValue,
      feesOnLateInterest: input.feesOnLateInterest === "on",
      lateInterestDailyPct: input.lateInterestDailyPct,
      dueDay: input.dueDay,
      lateInterestFrom: input.lateInterestFrom,
      collectionMethod: input.collectionMethod,
      notes: input.notes,
    };
    // Compare numbers by value: "10" and "10.0000" are the same fee.
    const same = (a: unknown, b: unknown) =>
      typeof a === "string" && typeof b === "string" && /^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b) ? new Decimal(a).equals(b) : a === b;
    const changes = Object.fromEntries(
      Object.entries(next)
        .filter(([key, value]) => !same(contract[key as keyof typeof next], value))
        .map(([key, value]) => [key, { from: contract[key as keyof typeof next], to: value }]),
    );
    if (Object.keys(changes).length === 0) return { changed: 0 };
    await tx.update(contracts).set(next).where(eq(contracts.id, contract.id));
    await tx.insert(contractEvents).values({
      organizationId,
      contractId: contract.id,
      type: "updated",
      reason: input.reason,
      payload: { changes },
      createdBy: user.id,
    });
    return { changed: Object.keys(changes).length };
  });
}
