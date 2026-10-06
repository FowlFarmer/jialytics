# jialytics + Next.js

```bash
npm install
npm run dev
```

Open http://localhost:3000, click around, then http://localhost:3000/jialytics.

With no database configured, page views are kept in memory. Set one of these to use a real one:

| Variable | Database |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `MONGODB_URI` | MongoDB |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Upstash / Vercel KV |

Set `JIALYTICS_TOKEN` to lock the dashboard; open it as `/jialytics?token=...`.

## Against a local build of jialytics

Install a packed build rather than linking the folder (a link pulls in a second copy of React):

```bash
cd ../.. && npm run build && npm pack && cd examples/nextjs
npm install ../../jialytics-0.1.0.tgz
```
