import { eq, sql } from 'drizzle-orm';
import { getIndexSource } from '@rentavle/country';
import { type Database, schema } from '@rentavle/db';

const { indexSeries, indexValues } = schema;

/** Re-read this many days back on every run: sources occasionally revise recent values. */
const REVISION_WINDOW_DAYS = 90;
/** First fetch when a series has no values yet. */
const DEFAULT_START = '2016-12-01';

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface FetchIndexesResult {
  series: string;
  fetched: number;
  error?: string;
}

/**
 * Downloads new values of every automatic index series and upserts them.
 * Idempotent: running it twice stores the same rows. Runs with the admin client
 * (index tables are global and not writable by users).
 */
export async function fetchIndexes(db: Database, today: string): Promise<FetchIndexesResult[]> {
  const series = await db.select().from(indexSeries);
  const results: FetchIndexesResult[] = [];

  for (const s of series) {
    const source = getIndexSource(s.code);
    if (!source?.automatic) continue;

    const [last] = await db
      .select({ date: sql<string | null>`max(${indexValues.date})` })
      .from(indexValues)
      .where(eq(indexValues.seriesId, s.id));
    // Monthly series are small (~12 values a year): always re-read them whole so any
    // gap left by a bad answer gets filled. Daily series are read incrementally.
    const from =
      s.frequency === 'monthly' || !last?.date ? DEFAULT_START : addDays(last.date, -REVISION_WINDOW_DAYS);

    try {
      const readings = await source.fetch(from, addDays(today, 60));
      if (readings.length > 0) {
        const now = new Date();
        // Chunked upsert: daily series can return thousands of rows on the first run.
        for (let i = 0; i < readings.length; i += 500) {
          await db
            .insert(indexValues)
            .values(
              readings.slice(i, i + 500).map((r) => ({
                seriesId: s.id,
                date: r.date,
                value: r.value,
                isProvisional: false,
                fetchedAt: now,
              })),
            )
            .onConflictDoUpdate({
              target: [indexValues.seriesId, indexValues.date],
              set: { value: sql`excluded.value`, isProvisional: false, fetchedAt: now },
            });
        }
      }
      results.push({ series: s.code, fetched: readings.length });
    } catch (error) {
      results.push({ series: s.code, fetched: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
