import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:dev@localhost:5432/ff';

// 缓存连接池到 globalThis,避免 Next.js 开发期热重载每次重新求值模块时
// 新建一个 postgres 连接池而不释放旧的,导致连接数耗尽(too many clients)。
const globalForDb = globalThis as unknown as { __ffPgClient?: ReturnType<typeof postgres> };

const client = globalForDb.__ffPgClient ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== 'production') globalForDb.__ffPgClient = client;

export const db = drizzle(client, { schema });
