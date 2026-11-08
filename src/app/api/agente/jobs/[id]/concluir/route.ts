import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ErroHttp, exigirApi, rota } from "@/lib/sessao";
import { jobDoAgente } from "@/lib/agente";
import { novaChave, salvar } from "@/lib/storage";
import { avancar, registrarMontagem } from "@/lib/pipeline/orquestrador";

export const maxDuration = 60;

/** O PC terminou a montagem: junta as partes, publica o vídeo e segue o pipeline (QA na nuvem). */
export const POST = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  const b = (await req.json()) as { agente: string; partes: number; srt: string; duracao: number };
  const job = await jobDoAgente(id, s, b.agente);
  const partes = await sql`select n, dados from uploads_parciais where job_id = ${id} order by n`;
  if (partes.length !== b.partes || partes.some((p, i) => p.n !== i)) throw new ErroHttp(422, `recebidas ${partes.length} de ${b.partes} partes`);
  const video = Buffer.concat(partes.map((p) => p.dados as Buffer));
  const chave = await salvar(novaChave(job.workspace_id, job.projeto_id, "final-pc.mp4"), video);
  const srtChave = await salvar(novaChave(job.workspace_id, job.projeto_id, "legendas.srt"), Buffer.from(b.srt ?? "", "utf8"));
  const [a] = await sql`select maquina from agentes_locais where id = ${b.agente}`;
  await registrarMontagem(id, { chave, srt: b.srt ?? "", srtChave, duracao: Number(b.duracao) || 0 }, `pc:${a?.maquina ?? "local"}`);
  await sql`delete from uploads_parciais where job_id = ${id}`;
  await avancar(job.variacao_id);
  return NextResponse.json({ ok: true, bytes: video.length });
});
