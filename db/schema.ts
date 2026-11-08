import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, check } from 'drizzle-orm/sqlite-core';
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    itemKey: text('item_key').notNull().unique(),
    name: text('name').notNull(),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    department: text('department').notNull(),
    checked: integer('checked').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('items_active').on(table.archived, table.checked),
    check('items_quantity', sql`${table.quantity}>0 AND ${table.quantity}<=10000`),
    check('items_checked', sql`${table.checked} IN (0,1)`),
    check('items_archived', sql`${table.archived} IN (0,1)`),
  ],
);
export const operations = sqliteTable('operations', {
  id: text('id').primaryKey(),
  marker: text('marker').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
export const aiRequests = sqliteTable('ai_requests', {
  id: text('id').primaryKey(),
  textHash: text('text_hash').notNull(),
  status: text('status').notNull(),
  result: text('result'),
  lease: text('lease').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const aiUsage = sqliteTable('ai_usage', {
  period: text('period').primaryKey(),
  used: integer('used').notNull().default(0),
});
