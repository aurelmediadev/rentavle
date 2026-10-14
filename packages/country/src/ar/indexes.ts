import type { IndexSource } from '../types';

/**
 * Official sources for Argentine rent indexes.
 * - IPC: INDEC, published through the datos.gob.ar series API (monthly levels, base dic-2016).
 * - ICL: BCRA statistics API v4, variable 40 (daily values, base 30/6/2020 = 1).
 * - Casa Propia: no public API; loaded by hand by the Rentavle team.
 */

const DATOS_GOB_AR = 'https://apis.datos.gob.ar/series/api/series/';
const IPC_SERIES_ID = '148.3_INIVELNAL_DICI_M_26';

const BCRA_API = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias';
const ICL_VARIABLE = 40;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/** Number of times the IPC API is queried per fetch (see below). */
const IPC_ATTEMPTS = 5;

const ipc: IndexSource = {
  code: 'AR_IPC',
  automatic: true,
  async fetch(from) {
    // The datos.gob.ar API is served by replicas that are not always in sync: a stale
    // replica omits the latest month and returns nulls for some old ones. Published
    // months never change, so querying several times and merging the non-null values
    // returns complete data; the daily run fills any remaining gap the next day.
    const responses = await Promise.allSettled(
      Array.from({ length: IPC_ATTEMPTS }, (_, attempt) => {
        const params = new URLSearchParams({
          ids: IPC_SERIES_ID,
          start_date: from,
          limit: '1000',
          format: 'json',
          _: `${Date.now()}-${attempt}`,
        });
        return getJson(`${DATOS_GOB_AR}?${params}`) as Promise<{ data?: [string, number | null][] }>;
      }),
    );
    const ok = responses.filter((r) => r.status === 'fulfilled');
    if (ok.length === 0) throw (responses[0] as PromiseRejectedResult).reason;

    const byDate = new Map<string, string>();
    for (const response of ok) {
      for (const [date, value] of response.value.data ?? []) {
        if (value !== null) byDate.set(date, String(value));
      }
    }
    return [...byDate].map(([date, value]) => ({ date, value }));
  },
};

const icl: IndexSource = {
  code: 'AR_ICL',
  automatic: true,
  async fetch(from, to) {
    const readings: { date: string; value: string }[] = [];
    // The API pages results; request until a page comes back short.
    for (let offset = 0; ; offset += 1000) {
      const params = new URLSearchParams({ desde: from, hasta: to, limit: '1000', offset: String(offset) });
      const body = (await getJson(`${BCRA_API}/${ICL_VARIABLE}?${params}`)) as {
        results?: { detalle?: { fecha: string; valor: number }[] }[];
      };
      const page = body.results?.[0]?.detalle ?? [];
      readings.push(...page.map((d) => ({ date: d.fecha, value: String(d.valor) })));
      if (page.length < 1000) break;
    }
    return readings;
  },
};

const casaPropia: IndexSource = {
  code: 'AR_CASA_PROPIA',
  automatic: false,
  async fetch() {
    return [];
  },
};

export const argentinaIndexSources: readonly IndexSource[] = [ipc, icl, casaPropia];
