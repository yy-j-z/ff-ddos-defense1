import { pgTable, text, integer, jsonb, timestamp, vector, boolean, real, uuid } from 'drizzle-orm/pg-core';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('pending'),
  scope: jsonb('scope').notNull(),
  pcapPath: text('pcap_path'),
  /** 执行元信息: llm_mode / pcap_status / fallback_count / attack_mode / evidence_incomplete */
  meta: jsonb('meta'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const playbooks = pgTable('playbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  intent: text('intent').notNull(),
  strategy: text('strategy').notNull(),
  yaml: text('yaml').notNull(),
  data: jsonb('data').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  score: integer('score'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  playbookId: uuid('playbook_id').notNull().references(() => playbooks.id, { onDelete: 'cascade' }),
  reachability: real('reachability').notNull(),
  defenderTriggered: boolean('defender_triggered').notNull(),
  defenderLatencyMs: integer('defender_latency_ms'),
  score: integer('score').notNull(),
  metrics: jsonb('metrics').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const agentTraces = pgTable('agent_traces', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  agentName: text('agent_name').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  thinking: text('thinking'),
  durationMs: integer('duration_ms').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ProfileRow = typeof profiles.$inferSelect;
export type PlaybookRow = typeof playbooks.$inferSelect;
export type VerificationRow = typeof verifications.$inferSelect;
export type AgentTraceRow = typeof agentTraces.$inferSelect;
