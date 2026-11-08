import postgres from "postgres";

declare global {
  var __sql: postgres.Sql | undefined;
}

export const sql: postgres.Sql =
  globalThis.__sql ??
  postgres(process.env.DATABASE_URL ?? "postgres://domma:domma@localhost:5432/domma", {
    max: Number(process.env.DB_MAX_CONEXOES ?? 10),
    idle_timeout: 30,
    // Pooler do Supabase em modo transação (porta 6543) não aceita prepared statements.
    prepare: !/:6543\//.test(process.env.DATABASE_URL ?? ""),
    ssl: /supabase\.(co|com)/.test(process.env.DATABASE_URL ?? "") ? "require" : undefined,
    transform: { undefined: null },
    types: {
      // numeric -> number (valores de custo e nota)
      numeric: { to: 1700, from: [1700], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
    },
  });

if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;

export async function auditar(
  workspaceId: string,
  ator: string,
  acao: string,
  opts: { projetoId?: string | null; alvo?: string | null; dados?: unknown } = {},
) {
  await sql`insert into auditoria (workspace_id, projeto_id, ator, acao, alvo, dados)
    values (${workspaceId}, ${opts.projetoId ?? null}, ${ator}, ${acao}, ${opts.alvo ?? null},
            ${sql.json((opts.dados ?? {}) as postgres.JSONValue)})`;
}
