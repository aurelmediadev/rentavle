import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { AgencyInfo, DocumentImages, DocumentMeta, ReceiptData, SettlementData } from './types';

const ink = '#1f2328';
const muted = '#6b7280';
const line = '#d1d5db';

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: ink },
  copy: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 32, paddingVertical: 24, position: 'relative' },
  cut: { borderTopWidth: 1, borderTopColor: line, borderStyle: 'dashed' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  agency: { flexDirection: 'row', gap: 10, maxWidth: '62%' },
  logo: { width: 56, height: 56, objectFit: 'contain' },
  agencyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  small: { fontSize: 8, color: muted, lineHeight: 1.35 },
  docBox: { alignItems: 'flex-end' },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  copyLabel: { fontSize: 7, color: muted, letterSpacing: 1, marginTop: 2 },
  rule: { borderBottomWidth: 1, borderBottomColor: line, marginVertical: 8 },
  paragraph: { lineHeight: 1.5, marginBottom: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  table: { borderTopWidth: 1, borderTopColor: line },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line, paddingVertical: 4 },
  head: { fontFamily: 'Helvetica-Bold', color: muted, fontSize: 8 },
  concept: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  amount: { width: 90, textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingVertical: 5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: 10 },
  signature: { width: 150, alignItems: 'center' },
  signatureImage: { height: 40, maxWidth: 150, objectFit: 'contain', marginBottom: 2 },
  signatureLine: { borderTopWidth: 1, borderTopColor: ink, width: 150, paddingTop: 3, textAlign: 'center', fontSize: 8, color: muted },
  watermark: {
    position: 'absolute',
    top: '38%',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 64,
    fontFamily: 'Helvetica-Bold',
    color: '#dc2626',
    opacity: 0.18,
    transform: 'rotate(-20deg)',
  },
});

function money(amount: string, currency: string, locale: string) {
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Intl formats decimal strings exactly; no float conversion.
  return format.format(amount as unknown as number).replace(/ /g, ' ');
}

function date(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

export function documentNumber(number: number) {
  return String(number).padStart(8, '0');
}

function Header({ agency, images, title, meta, docDate, copyLabel }: {
  agency: AgencyInfo;
  images: DocumentImages;
  title: string;
  meta: DocumentMeta;
  docDate: string;
  copyLabel?: string;
}) {
  const fiscal = [
    agency.legalName && agency.legalName !== agency.name ? agency.legalName : null,
    agency.taxId ? `${agency.taxIdLabel} ${agency.taxId}` : null,
    agency.taxCondition,
  ].filter(Boolean);
  const contact = [agency.address, agency.phone, agency.email].filter(Boolean);
  return (
    <View style={s.header}>
      <View style={s.agency}>
        {images.logo ? <Image src={images.logo} style={s.logo} /> : null}
        <View>
          <Text style={s.agencyName}>{agency.name}</Text>
          {fiscal.length > 0 && <Text style={s.small}>{fiscal.join(' · ')}</Text>}
          {contact.length > 0 && <Text style={s.small}>{contact.join(' · ')}</Text>}
        </View>
      </View>
      <View style={s.docBox}>
        <Text style={s.docTitle}>{title}</Text>
        <Text>N° {documentNumber(meta.number)}</Text>
        <Text style={s.small}>{date(docDate, agency.locale)}</Text>
        {copyLabel ? <Text style={s.copyLabel}>{copyLabel}</Text> : null}
      </View>
    </View>
  );
}

function Signature({ agency, images }: { agency: AgencyInfo; images: DocumentImages }) {
  return (
    <View style={s.signature}>
      {images.signature ? <Image src={images.signature} style={s.signatureImage} /> : null}
      <Text style={s.signatureLine}>{agency.legalName ?? agency.name}</Text>
    </View>
  );
}

function Void({ meta }: { meta: DocumentMeta }) {
  return meta.status === 'void' ? <Text style={s.watermark}>ANULADO</Text> : null;
}

function ReceiptCopy({ data, meta, images, copyLabel }: {
  data: ReceiptData;
  meta: DocumentMeta;
  images: DocumentImages;
  copyLabel: string;
}) {
  const fmt = (v: string) => money(v, data.currency, data.agency.locale);
  return (
    <View style={s.copy}>
      <Header agency={data.agency} images={images} title="RECIBO" meta={meta} docDate={data.date} copyLabel={copyLabel} />
      <Text style={s.paragraph}>
        Recibimos de <Text style={s.bold}>{data.payer.name}</Text>
        {data.payer.taxId ? ` (${data.payer.taxId})` : ''} la suma de <Text style={s.bold}>{data.amountInWords}</Text> (
        {fmt(data.amount)}) en concepto de:
      </Text>
      <View style={s.table}>
        {data.lines.map((l, i) => (
          <View key={i} style={s.row}>
            <Text style={s.concept}>{l.concept}</Text>
            <Text style={s.amount}>{fmt(l.amount)}</Text>
          </View>
        ))}
        {data.credit ? (
          <View style={s.row}>
            <Text style={s.concept}>Saldo a favor para próximos pagos</Text>
            <Text style={s.amount}>{fmt(data.credit)}</Text>
          </View>
        ) : null}
        <View style={s.totalRow}>
          <Text style={[s.concept, s.bold]}>Total recibido</Text>
          <Text style={[s.amount, s.bold]}>{fmt(data.amount)}</Text>
        </View>
      </View>
      <View style={s.footer}>
        <View>
          <Text style={s.small}>Forma de pago: {data.method}</Text>
          {data.property ? (
            <Text style={s.small}>
              Propiedad: {data.property}
              {data.contractNumber ? ` · Contrato #${data.contractNumber}` : ''}
            </Text>
          ) : null}
          {data.notes ? <Text style={s.small}>{data.notes}</Text> : null}
        </View>
        <Signature agency={data.agency} images={images} />
      </View>
      <Void meta={meta} />
    </View>
  );
}

/** A4 with original and duplicate (cut along the dashed line), or one half-sheet. */
export function ReceiptDocument({ data, meta, images, format }: {
  data: ReceiptData;
  meta: DocumentMeta;
  images: DocumentImages;
  format: 'a4' | 'half';
}) {
  return (
    <Document title={`Recibo ${documentNumber(meta.number)}`} author={data.agency.name} creator="Rentavle">
      {format === 'half' ? (
        <Page size="A5" orientation="landscape" style={s.page}>
          <ReceiptCopy data={data} meta={meta} images={images} copyLabel="ORIGINAL" />
        </Page>
      ) : (
        <Page size="A4" style={s.page}>
          <ReceiptCopy data={data} meta={meta} images={images} copyLabel="ORIGINAL" />
          <View style={s.cut} />
          <ReceiptCopy data={data} meta={meta} images={images} copyLabel="DUPLICADO" />
        </Page>
      )}
    </Document>
  );
}

export function SettlementDocument({ data, meta, images }: {
  data: SettlementData;
  meta: DocumentMeta;
  images: DocumentImages;
}) {
  const fmt = (v: string) => money(v, data.currency, data.agency.locale);
  return (
    <Document title={`Liquidación ${documentNumber(meta.number)}`} author={data.agency.name} creator="Rentavle">
      <Page size="A4" style={[s.page, { padding: 8 }]}>
        <View style={s.copy}>
          <Header agency={data.agency} images={images} title="LIQUIDACIÓN" meta={meta} docDate={data.date} />
          <Text style={s.paragraph}>
            Propietario: <Text style={s.bold}>{data.owner.name}</Text>
            {data.owner.taxId ? ` (${data.owner.taxId})` : ''}
          </Text>
          <View style={s.table}>
            <View style={s.row}>
              <Text style={[s.concept, s.head]}>Concepto</Text>
              <Text style={[s.amount, s.head]}>Pago</Text>
              <Text style={[s.amount, s.head]}>Honorarios</Text>
              <Text style={[s.amount, s.head]}>A liquidar</Text>
            </View>
            {data.lines.map((l, i) => (
              <View key={i} style={s.row} wrap={false}>
                <View style={s.concept}>
                  <Text>{l.concept}</Text>
                  <Text style={s.small}>{l.detail}</Text>
                </View>
                <Text style={s.amount}>{fmt(l.gross)}</Text>
                <Text style={s.amount}>{fmt(l.fee)}</Text>
                <Text style={s.amount}>{fmt(l.payout)}</Text>
              </View>
            ))}
            {data.deductions.map((d, i) => (
              <View key={`d${i}`} style={s.row} wrap={false}>
                <Text style={s.concept}>Descuento: {d.concept}</Text>
                <Text style={s.amount} />
                <Text style={s.amount} />
                <Text style={s.amount}>-{fmt(d.amount)}</Text>
              </View>
            ))}
            <View style={s.totalRow}>
              <Text style={[s.concept, s.bold]}>Total pagado al propietario</Text>
              <Text style={[s.amount, s.bold]}>{fmt(data.total)}</Text>
            </View>
          </View>
          <Text style={{ lineHeight: 1.35, marginTop: 8, marginBottom: 6 }}>
            Son {data.amountInWords}. Forma de pago: {data.method}
            {data.account ? ` (${data.account})` : ''}.
          </Text>
          {data.ownerDebts.map((d, i) => (
            <Text key={i} style={s.small}>
              Queda como deuda del propietario: {d.concept} {fmt(d.amount)}.
            </Text>
          ))}
          {data.notes ? <Text style={s.small}>{data.notes}</Text> : null}
          <View style={s.footer}>
            <View style={s.signature}>
              <Text style={s.signatureLine}>Firma del propietario</Text>
            </View>
            <Signature agency={data.agency} images={images} />
          </View>
          <Void meta={meta} />
        </View>
      </Page>
    </Document>
  );
}
