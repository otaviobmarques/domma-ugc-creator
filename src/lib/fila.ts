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
      const boss = new PgBoss(process.env.DATABASE_URL ?? "postgres://domma:domma@localhost:5432/domma");
      boss.on("error", (e: unknown) => console.error("[fila]", e));
      await boss.start();
      for (const nome of [FILA_ETAPA, FILA_CONSULTA]) {
        await boss.createQueue(nome).catch(() => {});
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
