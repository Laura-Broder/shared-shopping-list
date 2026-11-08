import { departments, units, normalize, parseGroceries } from './parser.ts';
import { html, css, client } from './assets.generated.ts';
import { aiConfigured, AnalysisError, type AIConfig } from './ai.ts';
import { analyzeRequest } from './ai-requests.ts';

export interface Statement {
  bind(...values: unknown[]): Statement;
  all(): Promise<{ results: any[]; meta: { changes: number } }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<Array<{ results: any[]; meta: { changes: number } }>>;
}
export interface Env extends AIConfig {
  DB: Database;
  AUTH_MODE?: string;
  OWNER_ACCESS_KEY?: string;
  PARTNER_ACCESS_KEY?: string;
}
const security = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...security, 'Content-Type': 'application/json; charset=utf-8' },
  });
const now = () => new Date().toISOString();
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function authorize(request: Request, env: Env): string | null {
  if (env.AUTH_MODE === 'links') {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (
      env.OWNER_ACCESS_KEY &&
      env.OWNER_ACCESS_KEY.length >= 32 &&
      equal(token, env.OWNER_ACCESS_KEY)
    )
      return 'owner';
    if (
      env.PARTNER_ACCESS_KEY &&
      env.PARTNER_ACCESS_KEY.length >= 32 &&
      equal(token, env.PARTNER_ACCESS_KEY)
    )
      return 'partner';
    return null;
  }
  // These headers are validated and supplied by the private Sites gateway.
  return request.headers.get('oai-authenticated-user-id');
}
async function list(env: Env) {
  const r = await env.DB.prepare(
    'SELECT id,name,quantity,unit,department,checked,revision,updated_at FROM items WHERE archived=0 ORDER BY updated_at,id',
  ).all();
  return r.results;
}
function safeBody(input: any): boolean {
  return input && typeof input === 'object' && !Array.isArray(input);
}
function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (
      request.method === 'GET' &&
      ['/', '/app.css', '/app.js', '/icon.svg', '/manifest.webmanifest'].includes(url.pathname)
    ) {
      if (url.pathname === '/manifest.webmanifest')
        return new Response(
          JSON.stringify({
            name: 'עגלה — הרשימה שלנו',
            short_name: 'עגלה',
            lang: 'he',
            dir: 'rtl',
            start_url: '/',
            display: 'standalone',
            background_color: '#f7f6ef',
            theme_color: '#254f42',
            icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
          }),
          { headers: { ...security, 'Content-Type': 'application/manifest+json' } },
        );
      const icon =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#254f42"/><path d="M16 20h6l5 23h22l5-17H24M31 49h.1M46 49h.1" stroke="#f8f5e8" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const content =
        url.pathname === '/'
          ? html
          : url.pathname === '/app.css'
            ? css
            : url.pathname === '/app.js'
              ? client
              : icon;
      return new Response(content, {
        headers: {
          ...security,
          'Content-Type':
            url.pathname === '/'
              ? 'text/html; charset=utf-8'
              : url.pathname === '/app.css'
                ? 'text/css; charset=utf-8'
                : url.pathname === '/app.js'
                  ? 'text/javascript; charset=utf-8'
                  : 'image/svg+xml',
        },
      });
    }
    if (!url.pathname.startsWith('/api/')) return json({ error: 'העמוד לא נמצא.' }, 404);
    const user = authorize(request, env);
    if (!user)
      return json(
        {
          error: 'נדרש קישור גישה אישי או כניסה לחשבון המורשה.',
          authMode: env.AUTH_MODE === 'links' ? 'links' : 'sites',
        },
        401,
      );
    if (!env.DB) return json({ error: 'מסד הנתונים עדיין לא הוגדר.' }, 503);
    if (request.method === 'GET' && url.pathname === '/api/items')
      return json({
        items: await list(env),
        authMode: env.AUTH_MODE === 'links' ? 'links' : 'sites',
        aiEnabled: aiConfigured(env),
      });
    if (request.method === 'GET' && url.pathname === '/api/access') {
      if (env.AUTH_MODE !== 'links' || user !== 'owner')
        return json({ error: 'אין הרשאה לפעולה הזו.' }, 403);
      if (!env.PARTNER_ACCESS_KEY || env.PARTNER_ACCESS_KEY.length < 32)
        return json({ error: 'קישור הגישה השני עדיין לא הוגדר.' }, 503);
      return json({ url: url.origin + '/#key=' + encodeURIComponent(env.PARTNER_ACCESS_KEY) });
    }
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method))
      return json({ error: 'הפעולה אינה נתמכת.' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'הבקשה לא אושרה.' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json'))
      return json({ error: 'פורמט הבקשה אינו תקין.' }, 415);
    const raw = await request.text();
    if (raw.length > 16000) return json({ error: 'הבקשה ארוכה מדי.' }, 413);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'הבקשה אינה תקינה.' }, 400);
    }
    if (!safeBody(body)) return json({ error: 'הבקשה אינה תקינה.' }, 400);
    if (request.method === 'POST' && url.pathname === '/api/items') {
      if (typeof body.operationId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.operationId))
        return json({ error: 'מזהה הבקשה חסר.' }, 400);
      if (typeof body.text !== 'string') return json({ error: 'יש להזין מוצרים.' }, 400);
      if (body.mode !== undefined && !['basic', 'ai'].includes(body.mode))
        return json({ error: 'מצב הפענוח אינו תקין.' }, 400);
      const smart = body.mode === 'ai';
      let parsed: ReturnType<typeof parseGroceries>;
      if (smart) {
        const analysis = await analyzeRequest(env.DB, env, user, body.operationId, body.text);
        if (analysis.kind !== 'add')
          return json(
            {
              error: analysis.message || 'אפשר לנסח בצורה מדויקת יותר מה להוסיף?',
              clarification: true,
            },
            422,
          );
        parsed = { items: analysis.items, warnings: [] };
      } else parsed = parseGroceries(body.text);
      if (!parsed.items.length)
        return json({ error: parsed.warnings.join('\n') || 'לא נמצאו מוצרים להוספה.' }, 400);
      const count = await env.DB.prepare(
        'SELECT count(*) AS total FROM items WHERE archived=0',
      ).all();
      if (count.results[0].total + parsed.items.length > 500)
        return json({ error: 'הרשימה מוגבלת ל־500 מוצרים. אפשר לנקות מוצרים שנקנו.' }, 400);
      const marker = crypto.randomUUID();
      const operation = user + ':' + body.operationId;
      const statements = [
        env.DB.prepare('INSERT OR IGNORE INTO operations(id,marker) VALUES(?,?)').bind(
          operation,
          marker,
        ),
      ];
      for (const item of parsed.items) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO items(id,item_key,name,quantity,unit,department,checked,archived,updated_at)
       SELECT ?,?,?,?,?,?,0,0,? WHERE EXISTS(SELECT 1 FROM operations WHERE id=? AND marker=?)
       ON CONFLICT(item_key) DO UPDATE SET
       quantity=CASE WHEN items.archived=1 OR items.checked=1 THEN excluded.quantity WHEN ?=1 THEN min(10000,items.quantity+excluded.quantity) ELSE items.quantity END,
       checked=0,archived=0,revision=items.revision+1,updated_at=excluded.updated_at`,
          ).bind(
            crypto.randomUUID(),
            normalize(item.name) + '|' + item.unit,
            item.name,
            item.quantity,
            item.unit,
            item.department,
            now(),
            operation,
            marker,
            item.explicit ? 1 : 0,
          ),
        );
      }
      await env.DB.batch(statements);
      return json({
        items: await list(env),
        added: parsed.items.length,
        warnings: parsed.warnings,
        analysis: smart ? 'ai' : 'basic',
      });
    }
    const match = url.pathname.match(/^\/api\/items\/([a-f0-9-]{36})$/);
    if (match && request.method === 'PATCH') {
      if (!validRevision(body.revision)) return json({ error: 'גרסת המוצר חסרה.' }, 400);
      const assignments: string[] = [];
      const values: unknown[] = [];
      if (body.checked !== undefined) {
        if (typeof body.checked !== 'boolean') return json({ error: 'הסימון אינו תקין.' }, 400);
        assignments.push('checked=?');
        values.push(body.checked ? 1 : 0);
      }
      const edits = ['name', 'quantity', 'unit', 'department'];
      if (edits.some((k) => body[k] !== undefined)) {
        if (
          typeof body.name !== 'string' ||
          !body.name.trim() ||
          body.name.trim().length > 100 ||
          typeof body.quantity !== 'number' ||
          !Number.isFinite(body.quantity) ||
          body.quantity <= 0 ||
          body.quantity > 10000 ||
          !units.includes(body.unit) ||
          !departments.includes(body.department)
        )
          return json({ error: 'בדקו את שם המוצר, הכמות והמחלקה.' }, 400);
        assignments.push('name=?', 'quantity=?', 'unit=?', 'department=?', 'item_key=?');
        values.push(
          body.name.trim(),
          body.quantity,
          body.unit,
          body.department,
          normalize(body.name) + '|' + body.unit,
        );
      }
      if (!assignments.length) return json({ error: 'לא נבחר שינוי.' }, 400);
      const r = await env.DB.prepare(
        `UPDATE items SET ${assignments.join(',')},revision=revision+1,updated_at=? WHERE id=? AND revision=? AND archived=0 RETURNING id,revision`,
      )
        .bind(...values, now(), match[1], body.revision)
        .all();
      if (!r.results.length)
        return json({ error: 'המוצר השתנה בטלפון השני. הרשימה תתעדכן; נסו שוב.' }, 409);
      return json({ items: await list(env) });
    }
    if (match && request.method === 'DELETE') {
      if (!validRevision(body.revision)) return json({ error: 'גרסת המוצר חסרה.' }, 400);
      const r = await env.DB.prepare(
        'UPDATE items SET archived=1,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND archived=0 RETURNING id,revision',
      )
        .bind(now(), match[1], body.revision)
        .all();
      if (!r.results.length) return json({ error: 'המוצר השתנה בטלפון השני. נסו שוב.' }, 409);
      return json({ items: await list(env), undo: r.results });
    }
    if (request.method === 'POST' && ['/api/clear', '/api/restore'].includes(url.pathname)) {
      if (
        !Array.isArray(body.items) ||
        !body.items.length ||
        body.items.length > 500 ||
        body.items.some(
          (x: any) =>
            !safeBody(x) ||
            typeof x.id !== 'string' ||
            !/^[a-f0-9-]{36}$/.test(x.id) ||
            !validRevision(x.revision),
        )
      )
        return json({ error: 'לא נבחרו מוצרים תקינים.' }, 400);
      const restore = url.pathname === '/api/restore';
      // D1 Free permits 50 queries per request and 100 bound parameters per query.
      // Match the revision of every item while keeping even a 500-item cleanup bounded.
      const statements: Statement[] = [];
      for (let offset = 0; offset < body.items.length; offset += 49) {
        const chunk = body.items.slice(offset, offset + 49) as Array<{
          id: string;
          revision: number;
        }>;
        const condition = chunk.map(() => '(id=? AND revision=?)').join(' OR ');
        const values = chunk.flatMap((item) => [item.id, item.revision]);
        statements.push(
          env.DB.prepare(
            `UPDATE items SET archived=${restore ? 0 : 1},revision=revision+1,updated_at=? WHERE archived=${restore ? 1 : 0}${restore ? '' : ' AND checked=1'} AND (${condition}) RETURNING id,revision`,
          ).bind(now(), ...values),
        );
      }
      const r = await env.DB.batch(statements);
      const changed = r.flatMap((x) => x.results);
      return json({
        items: await list(env),
        undo: restore ? [] : changed,
        changed: changed.length,
        skipped: body.items.length - changed.length,
      });
    }
    return json({ error: 'הפעולה לא נמצאה.' }, 404);
  } catch (error) {
    if (error instanceof AnalysisError) return json({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed'))
      return json({ error: 'כבר יש ברשימה מוצר בשם וביחידת המידה האלה.' }, 409);
    if (message.startsWith('אפשר להזין') || message.startsWith('אפשר להוסיף'))
      return json({ error: message }, 400);
    console.error('Shopping-list request failed', {
      path: url.pathname,
      name: error instanceof Error ? error.name : 'Error',
    });
    return json({ error: 'לא הצלחנו לשמור כרגע. נסו שוב בעוד רגע.' }, 500);
  }
}
export default { fetch: handle };
