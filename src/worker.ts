/**
 * Worker do pipeline. Roda separado do painel:  npm run worker
 * Na versão Web roda em containers (Railway); na versão Local, dentro do app.
 */
import "dotenv/config";
import { fila, FILA_CONSULTA, FILA_ETAPA } from "./lib/fila";
import { consultarJob, executarEtapa } from "./lib/pipeline/orquestrador";

const CONCORRENCIA = Number(process.env.WORKER_CONCORRENCIA ?? 4);

async function main() {
  const boss = await fila();
  await boss.work<{ jobId: string }>(FILA_ETAPA, { localConcurrency: CONCORRENCIA, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const j of jobs) await executarEtapa(j.data.jobId);
  });
  await boss.work<{ jobId: string }>(FILA_CONSULTA, { localConcurrency: CONCORRENCIA * 2, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const j of jobs) await consultarJob(j.data.jobId);
  });
  console.log(`[worker] pronto (concorrência ${CONCORRENCIA})`);
  const sair = async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGINT", sair);
  process.on("SIGTERM", sair);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
