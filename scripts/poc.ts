/**
 * Fase 0 — prova de conceito sem interface: produto + ator -> vídeo.
 *   npm run poc -- [produto] [ator] [duracao] [variacoes]
 * Precisa do worker rodando (npm run worker). Imprime custo e tempo reais.
 */
import "dotenv/config";
import { sql } from "../src/lib/db";
import { gerarVariacoes, estimarProjeto } from "../src/lib/pipeline/projeto";
import { produzir } from "../src/lib/pipeline/orquestrador";
import { custoProjeto } from "../src/lib/pipeline/guardas";

async function main() {
  const [produtoNome = "Sérum vitamina C", atorNome = "Juliana", dur = "20", n = "1"] = process.argv.slice(2);
  const [ws] = await sql`select id from workspaces order by criado_em limit 1`;
  const [prod] = await sql`select * from produtos where nome = ${produtoNome}`;
  const [ator] = await sql`select * from atores where nome = ${atorNome}`;
  const est = await estimarProjeto(ws.id, { duracao_s: Number(dur), qualidade: "720p", n_variacoes: Number(n) });
  const [p] = await sql`insert into projetos (workspace_id, marca_id, produto_id, ator_id, titulo, objetivo, publico, tom, duracao_s, n_variacoes, custo_estimado_min, custo_estimado_max)
    values (${ws.id}, ${prod.marca_id}, ${prod.id}, ${ator.id}, ${`${prod.nome}: POC`}, 'depoimento', 'mulheres de 25 a 40 anos', 'próximo', ${Number(dur)}, ${Number(n)}, ${est.min}, ${est.max}) returning id`;
  console.log(`projeto ${p.id} — estimado R$ ${est.min}–${est.max}`);
  const t0 = Date.now();
  await gerarVariacoes(p.id, "sistema:poc");
  console.log(`roteiros em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await produzir(p.id, "sistema:poc");
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const jobs = await sql`select etapa, estado, provedor, progresso from jobs where projeto_id = ${p.id} order by criado_em`;
    const [pr] = await sql`select estado from projetos where id = ${p.id}`;
    console.log(pr.estado, jobs.map((j) => `${j.etapa}:${j.estado}${j.estado === "gerando" ? `(${j.progresso}%)` : ""}`).join(" "));
    if (["aguardando_revisao", "pausado_custo", "reprovado"].includes(pr.estado)) break;
    const falhas = await sql`select * from variacoes where projeto_id = ${p.id} and estado = 'falha'`;
    if (falhas.length) { console.log("falha:", falhas.map((f) => f.observacao)); break; }
  }
  const vars = await sql`select letra, nota_qa, video_final_url from variacoes where projeto_id = ${p.id}`;
  console.log(vars);
  console.log(`custo real R$ ${(await custoProjeto(p.id)).toFixed(2)} · tempo total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await sql.end();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
