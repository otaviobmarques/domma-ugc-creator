/**
 * Worker do pipeline. Roda separado do painel:  npm run worker
 * Na versão Web roda em containers (Railway); na versão Local, dentro do app.
 */
import "dotenv/config";
import { fila, FILA_CONSULTA, FILA_ETAPA } from "./lib/fila";
import { consultarJob, devolverMontagemParaNuvem, executarEtapa } from "./lib/pipeline/orquestrador";
import { sql } from "./lib/db";

const CONCORRENCIA = Number(process.env.WORKER_CONCORRENCIA ?? 4);

async function main() {
  const boss = await fila();
  await boss.work<{ jobId: string }>(FILA_ETAPA, { localConcurrency: CONCORRENCIA, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const j of jobs) await executarEtapa(j.data.jobId);
  });
  await boss.work<{ jobId: string }>(FILA_CONSULTA, { localConcurrency: CONCORRENCIA * 2, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const j of jobs) await consultarJob(j.data.jobId);
  });
  // Versão Local: montagens destinadas a um PC que não as pegou (ou travou) voltam para a nuvem.
  setInterval(async () => {
    try {
      const presos = await sql`select id, estado from jobs where executor = 'local' and (
          (estado = 'na_fila' and criado_em < now() - interval '2 minutes') or
          (estado = 'gerando' and iniciado_em < now() - interval '15 minutes'))`;
      for (const j of presos) await devolverMontagemParaNuvem(j.id, j.estado === "na_fila" ? "nenhum PC pegou a montagem" : "o PC não concluiu a montagem");
    } catch (e) {
      console.error("[worker] varredura da Versão Local", e);
    }
  }, 30_000);
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
