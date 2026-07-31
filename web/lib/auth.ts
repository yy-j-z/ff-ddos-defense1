/**
 * 简单单账号鉴权：账号/密码写在环境变量（.env.local）里。
 * 登录成功后下发一个由 secret 派生的确定性 token（httpOnly cookie），
 * middleware 用同样的 secret 重新计算并比对，无需数据库 / session 存储。
 * 所有函数均使用 Web Crypto，可在 Edge(middleware) 与 Node 运行时通用。
 */

export const AUTH_COOKIE = 'ff_auth';

function getCreds() {
  // 兼容两套环境变量名:
  //  - APP_AUTH_*  本地开发 .env.local(.env.local.example 用这套)
  //  - AUTH_*      docker-compose 生产部署(compose 只透传这套)
  // 之前 compose 传 AUTH_PASSWORD,代码却只读 APP_AUTH_PASSWORD → 线上永远用默认口令。
  const username = process.env.APP_AUTH_USERNAME || process.env.AUTH_USERNAME || 'admin';
  const password = process.env.APP_AUTH_PASSWORD || process.env.AUTH_PASSWORD || '1234';
  const secret =
    process.env.APP_AUTH_SECRET || process.env.AUTH_SECRET || 'ff-ddos-defense-dev-secret-change-me';
  return { username, password, secret };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 登录成功后写入 cookie 的确定性 token（绑定当前账号/密码/secret）。 */
export async function sessionToken(): Promise<string> {
  const { username, password, secret } = getCreds();
  return sha256Hex(`${username}:${password}:${secret}`);
}

/** 校验用户提交的账号密码是否匹配配置。 */
export function verifyCredentials(username: unknown, password: unknown): boolean {
  const c = getCreds();
  return username === c.username && password === c.password;
}

/** 校验 cookie 里的 token 是否有效（常量时间比较）。 */
export async function isValidToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const expected = await sessionToken();
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
