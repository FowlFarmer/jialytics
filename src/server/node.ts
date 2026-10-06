import type { IncomingMessage, ServerResponse } from 'node:http';

type FetchHandler = (request: Request) => Promise<Response>;

/**
 * Wrap the web-standard handler for Node's `http` and Express-style servers.
 *
 * ```ts
 * const { handler } = createJialytics({ adapter });
 * app.all('/api/jialytics', toNodeHandler(handler));
 * ```
 */
export function toNodeHandler(handler: FetchHandler) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const protocol = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? 'http';
    const url = new URL(req.url ?? '/', `${protocol}://${req.headers.host ?? 'localhost'}`);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    let body: string | undefined;
    if (req.method === 'POST') {
      // Express may already have parsed it.
      const parsed = (req as IncomingMessage & { body?: unknown }).body;
      if (parsed !== undefined) body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        body = Buffer.concat(chunks).toString('utf8');
      }
    }
    const response = await handler(new Request(url, { method: req.method, headers, body }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  };
}
