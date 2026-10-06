import type { Collection, Document, MongoClient } from 'mongodb';
import { DIMENSIONS, type Adapter, type DayCounts, type Dimension } from '../core/types';

export type MongoOptions =
  | {
      /** A collection to keep page views in, from your own connected client. */
      collection: Collection;
    }
  | {
      /** A connection string; jialytics connects on first use and reuses the client. */
      uri: string;
      /** Database name. Defaults to the one in the URI. */
      db?: string;
      /** Collection name. Default `jialytics_views`. */
      collectionName?: string;
    };

/**
 * MongoDB, one document per page view. Pass a collection you already have, or a URI:
 *
 * ```ts
 * mongodb({ uri: process.env.MONGODB_URI! });
 * ```
 *
 * Give jialytics its own collection: it never deletes anything, but don't share one with data
 * that other code prunes.
 */
export function mongodb(options: MongoOptions): Adapter & { close(): Promise<void> } {
  let collection: Promise<Collection> | null = null;
  let ownClient: MongoClient | null = null;

  const connect = () =>
    (collection ??= (async () => {
      let col: Collection;
      if ('collection' in options) col = options.collection;
      else {
        const { MongoClient } = await import('mongodb');
        ownClient = new MongoClient(options.uri);
        await ownClient.connect();
        col = ownClient.db(options.db).collection(options.collectionName ?? 'jialytics_views');
      }
      await col.createIndex({ day: 1 }).catch(() => undefined);
      return col;
    })().catch((error) => {
      collection = null;
      throw error;
    }));

  return {
    async record(view) {
      const col = await connect();
      await col.insertOne({ ts: view.time, day: view.day, visitor: view.visitor, ...view.values });
    },

    async days(from, to) {
      const col = await connect();
      const match: Document = { day: from === null ? { $lte: to } : { $gte: from, $lte: to } };
      const facets: Record<string, Document[]> = {
        totals: [
          { $group: { _id: '$day', views: { $sum: 1 }, visitors: { $addToSet: '$visitor' } } },
          { $project: { views: 1, visitors: { $size: { $setDifference: ['$visitors', [null]] } } } },
        ],
      };
      for (const dimension of DIMENSIONS) {
        facets[dimension] = [
          { $match: { [dimension]: { $type: 'string' } } },
          { $group: { _id: { day: '$day', key: `$${dimension}` }, n: { $sum: 1 } } },
        ];
      }
      const [result] = await col.aggregate([{ $match: match }, { $facet: facets }]).toArray();
      const byDay = new Map<string, DayCounts>();
      for (const row of result?.totals ?? []) {
        byDay.set(row._id, { day: row._id, views: row.views, visitors: row.visitors, lists: {} });
      }
      for (const dimension of DIMENSIONS) {
        for (const row of result?.[dimension] ?? []) {
          const entry = byDay.get(row._id.day);
          if (entry) (entry.lists[dimension as Dimension] ??= {})[row._id.key] = row.n;
        }
      }
      return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    },

    async visitors(days) {
      if (!days.length) return 0;
      const col = await connect();
      const [result] = await col
        .aggregate([
          { $match: { day: { $in: days }, visitor: { $type: 'string' } } },
          { $group: { _id: '$visitor' } },
          { $count: 'n' },
        ])
        .toArray();
      return result?.n ?? 0;
    },

    async firstDay() {
      const col = await connect();
      const first = await col.findOne({}, { sort: { day: 1 }, projection: { day: 1 } });
      return (first?.day as string | undefined) ?? null;
    },

    /** Close the client jialytics opened from `uri` (a no-op when you passed a collection). */
    async close() {
      await ownClient?.close();
    },
  };
}
