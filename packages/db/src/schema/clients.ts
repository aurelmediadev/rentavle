import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { address, createdBy, id, orgNumber, timestamps } from './_shared';
import { organizations } from './organizations';

// RLS policies: supabase/migrations (custom "rls_clients_properties" migration).

export const clientKind = pgEnum('client_kind', ['person', 'company']);
export const contactType = pgEnum('contact_type', ['email', 'phone']);
export const bankAccountOwner = pgEnum('bank_account_owner', ['client', 'organization']);

/** A person or company. Owner/tenant/guarantor is a role in each contract, not a property of the client. */
export const clients = pgTable(
  'clients',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    number: orgNumber(),
    kind: clientKind().notNull().default('person'),
    firstName: text(),
    lastName: text(),
    companyName: text(),
    /** Identity document type (CountryPack.identityDocuments), e.g. DNI. */
    docType: text(),
    docNumber: text(),
    /** Canonical tax id (CUIT, RUT...), digits only. */
    taxId: text(),
    /** CountryPack.taxConditions value. */
    taxCondition: text(),
    nationality: text(),
    birthDate: date(),
    notes: text(),
    ...address,
    createdBy: createdBy(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('clients_organization_number_key').on(t.organizationId, t.number),
    index('clients_organization_doc_idx').on(t.organizationId, t.docNumber),
    check(
      'clients_name_by_kind',
      sql`(${t.kind} = 'person' and coalesce(trim(${t.firstName}), '') <> '' and coalesce(trim(${t.lastName}), '') <> '')
          or (${t.kind} = 'company' and coalesce(trim(${t.companyName}), '') <> '')`,
    ),
  ],
).enableRLS();

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    type: contactType().notNull(),
    value: text().notNull(),
    label: text(),
    isPrimary: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('client_contacts_client_idx').on(t.clientId),
    check('client_contacts_value_not_blank', sql`length(trim(${t.value})) > 0`),
  ],
).enableRLS();

/** Bank accounts of clients (where owners get paid) or of the agency itself. */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ownerType: bankAccountOwner().notNull(),
    clientId: uuid().references(() => clients.id, { onDelete: 'cascade' }),
    bankName: text(),
    holderName: text(),
    accountNumber: text(),
    /** CBU/CVU in Argentina; national account code elsewhere. */
    cbu: text(),
    alias: text(),
    holderTaxId: text(),
    currency: text().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('bank_accounts_client_idx').on(t.clientId),
    check(
      'bank_accounts_owner_matches',
      sql`(${t.ownerType} = 'client') = (${t.clientId} is not null)`,
    ),
    check(
      'bank_accounts_has_identifier',
      sql`coalesce(${t.cbu}, ${t.alias}, ${t.accountNumber}) is not null`,
    ),
  ],
).enableRLS();
