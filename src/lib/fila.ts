import { PgBoss } from "pg-boss";

declare global {
  var __boss: Promise<PgBoss> | undefined;
}

export const FILA_ETAPA = "etapa";
export const FILA_CONSULTA = "consulta";

/** Fila de jobs no próprio Postgres (pg-boss). Trocável por BullMQ + Redis. */
export function fila(): Promise<PgBoss> {
  if (!globalThis.__boss) {
    globalThis.__boss = (async () => {
      const url = process.env.FILA_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://domma:domma@localhost:5432/domma";
      const soEnvio = process.env.FILA_SO_ENVIO === "true"; // painel serverless: só envia jobs
      const boss = new PgBoss({
        connectionString: url,
        max: soEnvio ? 2 : 10,
        supervise: !soEnvio,
        schedule: !soEnvio,
        migrate: !soEnvio,
        ssl: /supabase\.(co|com)/.test(url) ? { rejectUnauthorized: false } : undefined,
      });
      boss.on("error", (e: unknown) => console.error("[fila]", e));
      await boss.start();
      if (!soEnvio) {
        for (const nome of [FILA_ETAPA, FILA_CONSULTA]) await boss.createQueue(nome).catch(() => {});
      }
      return boss;
    })();
  }
  return globalThis.__boss;
}

export async function enfileirarEtapa(jobId: string, atrasoS = 0) {
  const boss = await fila();
  await boss.send(FILA_ETAPA, { jobId }, { startAfter: atrasoS || undefined, retryLimit: 2, retryDelay: 10 });
}

export async function enfileirarConsulta(jobId: string, atrasoS = 5) {
  const boss = await fila();
  await boss.send(FILA_CONSULTA, { jobId }, { startAfter: atrasoS, retryLimit: 3, retryDelay: 10 });
}
