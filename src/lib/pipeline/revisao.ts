import { sql, auditar } from "../db";
import { interpretarAjuste } from "../agent/qa";
import { regerar, verificar, type Roteiro } from "../agent/roteiro";
import { avancar, fecharSeTerminou, planejarCenas } from "./orquestrador";
import { contextoBriefing } from "./projeto";

/** RF-42: pedido de ajuste em linguagem natural; o agente decide o que refazer. */
export async function pedirAjuste(variacaoId: string, pedido: string, autor: string) {
  const [v] = await sql`select v.*, p.workspace_id from variacoes v join projetos p on p.id = v.projeto_id where v.id = ${variacaoId}`;
  const [qa] = await sql`select defeitos from avaliacoes_qa where variacao_id = ${variacaoId} order by criado_em desc limit 1`;
  await sql`insert into revisoes (workspace_id, variacao_id, autor, acao, comentario) values (${v.workspace_id}, ${variacaoId}, ${autor}, 'ajuste', ${pedido})`;
  const d = await interpretarAjuste({ workspaceId: v.workspace_id, projetoId: v.projeto_id, pedido, roteiro: v.roteiro, defeitos: qa?.defeitos ?? [] });
  await auditar(v.workspace_id, "agente", "decisao", { projetoId: v.projeto_id, dados: { mensagem: `Ajuste na variação ${v.letra}: ${d.resumo}`, decisao: d } });

  if (d.refazer_roteiro) {
    const ctx = await contextoBriefing(v.projeto_id);
    const { roteiro } = await regerar(ctx, v.roteiro as Roteiro, d.instrucao_roteiro || pedido);
    const [a] = await sql`select tipo from atores a join projetos p on p.ator_id = a.id where p.id = ${v.projeto_id}`;
    await sql`update variacoes set roteiro = ${sql.json(roteiro as never)}, verificacao = ${sql.json(verificar(roteiro, ctx.marca.termos_vetados, a.tipo === "sintetico") as never)} where id = ${variacaoId}`;
    await planejarCenas(variacaoId); // cenas novas: tudo que depende do texto é refeito
  }
  const cenas = await sql`select id, tipo from cenas where variacao_id = ${variacaoId}`;
  const zerar = (tipo: string) => cenas.filter((c) => c.tipo === tipo).map((c) => c.id as string);
  const ids = [
    ...(d.refazer_imagem ? [...zerar("imagem"), ...zerar("fala")] : []),
    ...(d.refazer_lipsync ? zerar("fala") : []),
    ...(d.refazer_broll ? zerar("broll") : []),
  ];
  if (ids.length) await sql`update cenas set midia_url = null where id in ${sql(ids)}`;
  await sql`update variacoes set
      estado = 'em_producao', nota_qa = null, video_final_url = null,
      audio_url = case when ${d.refazer_narracao || d.refazer_roteiro} then null else audio_url end,
      musica = ${d.musica === "manter" ? v.musica : d.musica}
    where id = ${variacaoId}`;
  await sql`update projetos set estado = 'em_producao', atualizado_em = now() where id = ${v.projeto_id}`;
  await avancar(variacaoId);
  return d;
}

/** "Refazer só o trecho 0:16–0:20": refaz a cena que cobre o tempo indicado. */
export async function refazerTrecho(variacaoId: string, tempoS: number, autor: string) {
  const [v] = await sql`select v.*, p.workspace_id, p.duracao_s from variacoes v join projetos p on p.id = v.projeto_id where v.id = ${variacaoId}`;
  const cenas = await sql`select * from cenas where variacao_id = ${variacaoId} order by ordem`;
  const t = tempoS; // tempos do roteiro ≈ tempos do vídeo
  const broll = cenas.find((c) => c.tipo === "broll" && t >= Number(c.inicio_s) && t <= Number(c.fim_s));
  const alvo = broll ? [broll.id] : cenas.filter((c) => c.tipo === "imagem" || c.tipo === "fala").map((c) => c.id);
  await sql`update cenas set midia_url = null where id in ${sql(alvo)}`;
  await sql`update variacoes set estado = 'em_producao', nota_qa = null, video_final_url = null where id = ${variacaoId}`;
  await sql`update projetos set estado = 'em_producao' where id = ${v.projeto_id}`;
  await auditar(v.workspace_id, autor, "refazer_trecho", { projetoId: v.projeto_id, dados: { mensagem: `Refazer trecho em ${t.toFixed(0)} s da variação ${v.letra} (${broll ? "B-roll" : "imagem-chave e fala"})` } });
  await avancar(variacaoId);
}

export async function decidir(variacaoId: string, acao: "aprovar" | "reprovar", autor: string, comentario?: string) {
  const [v] = await sql`select v.*, p.workspace_id from variacoes v join projetos p on p.id = v.projeto_id where v.id = ${variacaoId}`;
  await sql`insert into revisoes (workspace_id, variacao_id, autor, acao, comentario) values (${v.workspace_id}, ${variacaoId}, ${autor}, ${acao}, ${comentario ?? null})`;
  await sql`update variacoes set estado = ${acao === "aprovar" ? "aprovado" : "reprovado"} where id = ${variacaoId}`;
  await auditar(v.workspace_id, autor, acao === "aprovar" ? "aprovou_variacao" : "reprovou_variacao", {
    projetoId: v.projeto_id,
    dados: { mensagem: `${autor.replace(/^(usuario|cliente):/, "")} ${acao === "aprovar" ? "aprovou" : "reprovou"} a variação ${v.letra}${comentario ? `: "${comentario}"` : ""}` },
  });
  const vars = await sql`select estado from variacoes where projeto_id = ${v.projeto_id}`;
  if (vars.every((x) => ["aprovado", "reprovado", "falha"].includes(x.estado))) {
    const algum = vars.some((x) => x.estado === "aprovado");
    await sql`update projetos set estado = ${algum ? "aprovado" : "reprovado"}, atualizado_em = now() where id = ${v.projeto_id}`;
  } else {
    await fecharSeTerminou(v.projeto_id, v.workspace_id);
  }
}
