import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handle, type Database, type Env } from '../src/worker.ts';
export const owner = 'owner-testing-access-key-at-least-32-characters';
export const partner = 'partner-testing-access-key-at-least-32-characters';
export function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((x) => x.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  const db: Database = {
    prepare(sql: string) {
      let args: any[] = [];
      const statement = {
        bind(...values: any[]) {
          assert.ok(values.length <= 100, 'D1 parameter limit');
          args = values;
          return statement;
        },
        async all() {
          const results = sqlite.prepare(sql).all(...args);
          const changes = sqlite.prepare('SELECT changes() AS n').get()!.n as number;
          return { results, meta: { changes } };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return statement;
    },
    async batch(statements) {
      assert.ok(statements.length <= 50, 'D1 query limit');
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.all());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const env: Env = {
    DB: db,
    AUTH_MODE: 'links',
    OWNER_ACCESS_KEY: owner,
    PARTNER_ACCESS_KEY: partner,
  };
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    key = owner,
    extra: Record<string, string> = {},
  ) {
    const response = await handle(
      new Request('https://grocery.test' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + key,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...extra,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
      env,
    );
    return { status: response.status, body: (await response.json()) as any };
  }
  const add = (text: string, id = crypto.randomUUID()) =>
    request('/api/items', 'POST', { text, operationId: id });
  return { request, add, env, sqlite };
}
