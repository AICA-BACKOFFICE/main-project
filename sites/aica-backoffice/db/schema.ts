import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const records = sqliteTable('cms_records', {
  collection: text('collection').notNull(),
  key: text('key').notNull(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [primaryKey({columns:[t.collection,t.key]}), index('cms_records_collection').on(t.collection)]);

export const pageFiles = sqliteTable('cms_page_files', {
  path: text('path').primaryKey(),
  html: text('html').notNull(),
  hash: text('hash').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const pageDrafts = sqliteTable('cms_page_drafts', {
  page: text('page').primaryKey(),
  html: text('html').notNull(),
  baseHash: text('base_hash').notNull(),
  savedAt: text('saved_at').notNull(),
});

export const pageBackups = sqliteTable('cms_page_backups', {
  id: integer('id').primaryKey({autoIncrement:true}),
  page: text('page').notNull(),
  name: text('name').notNull(),
  html: text('html').notNull(),
  savedAt: text('saved_at').notNull(),
}, t=>[index('cms_backups_page').on(t.page,t.id)]);

export const settings=sqliteTable('cms_settings',{
  key:text('key').primaryKey(),value:text('value').notNull(),
});
