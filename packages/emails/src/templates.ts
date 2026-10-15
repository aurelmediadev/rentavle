/**
 * Message templates (docs/02-funcionalidades.md §10). Each agency can override
 * them (message_templates); these are the defaults. Variables are written
 * {{NAME}}; unknown variables render empty.
 */

export const communicationTypes = [
  'receipt',
  'settlement',
  'payment_reminder',
  'late_notice',
  'amount_update',
  'contract_expiry',
] as const;
export type CommunicationType = (typeof communicationTypes)[number];

export type TemplateChannel = 'email' | 'whatsapp';

export interface Template {
  subject: string | null;
  body: string;
}

export const TYPE_LABEL: Record<CommunicationType, string> = {
  receipt: 'Recibo de pago',
  settlement: 'Liquidación al propietario',
  payment_reminder: 'Recordatorio de pago',
  late_notice: 'Aviso de mora',
  amount_update: 'Actualización de monto',
  contract_expiry: 'Vencimiento de contrato',
};

/** Who receives each type, for the settings screen. */
export const TYPE_RECIPIENTS: Record<CommunicationType, string> = {
  receipt: 'Inquilino',
  settlement: 'Propietario',
  payment_reminder: 'Inquilino',
  late_notice: 'Inquilino',
  amount_update: 'Inquilino y propietarios',
  contract_expiry: 'La inmobiliaria',
};

/** Variables each type can use, with a description for the template editor. */
export const TYPE_VARIABLES: Record<CommunicationType, Record<string, string>> = {
  receipt: { NOMBRE: 'Nombre del destinatario', NUMERO: 'Número de recibo', MONTO: 'Total recibido', FECHA: 'Fecha del pago', DIRECCION: 'Propiedad', LINK: 'Link al PDF' },
  settlement: { NOMBRE: 'Nombre del propietario', NUMERO: 'Número de liquidación', MONTO: 'Total pagado', FECHA: 'Fecha', LINK: 'Link al PDF' },
  payment_reminder: { NOMBRE: 'Nombre del inquilino', CONCEPTO: 'Qué se debe', MONTO: 'Saldo a pagar', VENCIMIENTO: 'Fecha de vencimiento', DIRECCION: 'Propiedad' },
  late_notice: { NOMBRE: 'Nombre del inquilino', CONCEPTO: 'Qué se debe', MONTO: 'Saldo adeudado', VENCIMIENTO: 'Fecha de vencimiento', DIAS_MORA: 'Días de atraso', DIRECCION: 'Propiedad' },
  amount_update: { NOMBRE: 'Nombre del destinatario', MES: 'Mes desde el que rige', MONTO_ANTERIOR: 'Monto anterior', NUEVO_MONTO: 'Monto nuevo', VARIACION: 'Variación', DIRECCION: 'Propiedad' },
  contract_expiry: { CONTRATO: 'Número de contrato', DIRECCION: 'Propiedad', INQUILINO: 'Inquilino', VENCIMIENTO: 'Fecha de fin', DIAS: 'Días que faltan' },
};

const SIGNATURE = '\n\nSaludos,\n{{INMOBILIARIA}}';

export const DEFAULT_TEMPLATES: Record<CommunicationType, Record<TemplateChannel, Template>> = {
  receipt: {
    email: {
      subject: 'Recibo N° {{NUMERO}} - {{INMOBILIARIA}}',
      body: 'Hola {{NOMBRE}}:\n\nTe enviamos el recibo N° {{NUMERO}} por {{MONTO}}, correspondiente al pago del {{FECHA}} ({{DIRECCION}}).\n\nPodés descargarlo acá: {{LINK}}' + SIGNATURE,
    },
    whatsapp: {
      subject: null,
      body: 'Hola {{NOMBRE}}, te enviamos el recibo N° {{NUMERO}} por {{MONTO}} del pago del {{FECHA}}: {{LINK}}\n{{INMOBILIARIA}}',
    },
  },
  settlement: {
    email: {
      subject: 'Liquidación N° {{NUMERO}} - {{INMOBILIARIA}}',
      body: 'Hola {{NOMBRE}}:\n\nTe enviamos la liquidación N° {{NUMERO}} del {{FECHA}}, por un total de {{MONTO}}.\n\nPodés descargarla acá: {{LINK}}' + SIGNATURE,
    },
    whatsapp: {
      subject: null,
      body: 'Hola {{NOMBRE}}, te enviamos la liquidación N° {{NUMERO}} por {{MONTO}}: {{LINK}}\n{{INMOBILIARIA}}',
    },
  },
  payment_reminder: {
    email: {
      subject: 'Recordatorio de pago: vence el {{VENCIMIENTO}}',
      body: 'Hola {{NOMBRE}}:\n\nTe recordamos que el pago de {{CONCEPTO}} ({{DIRECCION}}) vence el {{VENCIMIENTO}}. El saldo a pagar es {{MONTO}}.\n\nSi ya pagaste, ignorá este mensaje.' + SIGNATURE,
    },
    whatsapp: {
      subject: null,
      body: 'Hola {{NOMBRE}}, te recordamos que el pago de {{CONCEPTO}} vence el {{VENCIMIENTO}}. Saldo: {{MONTO}}. Si ya pagaste, ignorá este mensaje.\n{{INMOBILIARIA}}',
    },
  },
  late_notice: {
    email: {
      subject: 'Aviso de deuda vencida el {{VENCIMIENTO}}',
      body: 'Hola {{NOMBRE}}:\n\nEl pago de {{CONCEPTO}} ({{DIRECCION}}) venció el {{VENCIMIENTO}} y lleva {{DIAS_MORA}} días de atraso. El saldo adeudado es {{MONTO}}, más los punitorios que correspondan.\n\nPor favor, regularizá el pago a la brevedad. Si ya pagaste, ignorá este mensaje.' + SIGNATURE,
    },
    whatsapp: {
      subject: null,
      body: 'Hola {{NOMBRE}}, el pago de {{CONCEPTO}} venció el {{VENCIMIENTO}} ({{DIAS_MORA}} días de atraso). Saldo: {{MONTO}} más punitorios. Si ya pagaste, ignorá este mensaje.\n{{INMOBILIARIA}}',
    },
  },
  amount_update: {
    email: {
      subject: 'Nuevo monto del alquiler desde {{MES}}',
      body: 'Hola {{NOMBRE}}:\n\nTe informamos que, según el contrato de {{DIRECCION}}, desde {{MES}} el alquiler pasa de {{MONTO_ANTERIOR}} a {{NUEVO_MONTO}} ({{VARIACION}}).' + SIGNATURE,
    },
    whatsapp: {
      subject: null,
      body: 'Hola {{NOMBRE}}, desde {{MES}} el alquiler de {{DIRECCION}} pasa de {{MONTO_ANTERIOR}} a {{NUEVO_MONTO}} ({{VARIACION}}).\n{{INMOBILIARIA}}',
    },
  },
  contract_expiry: {
    email: {
      subject: 'El contrato #{{CONTRATO}} vence en {{DIAS}} días',
      body: 'El contrato #{{CONTRATO}} de {{DIRECCION}} (inquilino: {{INQUILINO}}) termina el {{VENCIMIENTO}}, en {{DIAS}} días.\n\nEs un buen momento para hablar con las partes sobre la renovación.',
    },
    whatsapp: {
      subject: null,
      body: 'El contrato #{{CONTRATO}} de {{DIRECCION}} termina el {{VENCIMIENTO}} ({{DIAS}} días).',
    },
  },
};

/** Replaces {{VARIABLE}} placeholders; unknown ones render empty. */
export function renderTemplate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, name: string) => variables[name] ?? '');
}

/** Variables used in a template that the type doesn't provide (for the editor). */
export function unknownVariables(type: CommunicationType, text: string): string[] {
  const allowed = new Set([...Object.keys(TYPE_VARIABLES[type]), 'INMOBILIARIA']);
  return [...new Set([...text.matchAll(/\{\{\s*([A-Z_]+)\s*\}\}/g)].map((m) => m[1]!))].filter((v) => !allowed.has(v));
}
