import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { ReceiptDocument, SettlementDocument } from './templates';
import type { DocumentData, DocumentImages, DocumentMeta } from './types';

export type * from './types';
export { documentNumber } from './templates';

export interface RenderOptions {
  /** Receipts only: A4 with original and duplicate, or a single half-sheet. */
  format?: 'a4' | 'half';
  images?: DocumentImages;
}

/** Renders an issued document to PDF bytes. */
export async function renderDocument(data: DocumentData, meta: DocumentMeta, options: RenderOptions = {}): Promise<Buffer> {
  const images = options.images ?? {};
  const element =
    data.kind === 'receipt'
      ? createElement(ReceiptDocument, { data, meta, images, format: options.format ?? 'a4' })
      : createElement(SettlementDocument, { data, meta, images });
  // The templates return <Document>, which is what renderToBuffer expects.
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}
