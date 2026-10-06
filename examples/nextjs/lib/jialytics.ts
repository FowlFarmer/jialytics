import { createJialytics, type Adapter } from 'jialytics';
import { memory } from 'jialytics/memory';
import { mongodb } from 'jialytics/mongodb';
import { postgres } from 'jialytics/postgres';
import { redis } from 'jialytics/redis';
import { Pool } from 'pg';

// Pick a database from the environment; with none set, page views live in memory (fine for a
// look around, gone on restart). In your app, keep just the one you use.
function pickAdapter(): Adapter {
  if (process.env.DATABASE_URL) return postgres({ client: new Pool({ connectionString: process.env.DATABASE_URL }) });
  if (process.env.MONGODB_URI) return mongodb({ uri: process.env.MONGODB_URI });
  if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) return redis();
  return memory();
}

export const jialytics = createJialytics({
  adapter: pickAdapter(),
  readToken: process.env.JIALYTICS_TOKEN,
});
