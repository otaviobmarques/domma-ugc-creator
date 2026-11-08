import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { estimarProjeto, gerarVariacoes } from "@/lib/pipeline/projeto";
import { situacaoConsentimento } from "@/lib/pipeline/guardas";

/** POST /projetos — cria a partir do briefing, devolve custo estimado e já pede os roteiros. */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const b = (await req.json()) as {
    produto_id: string; ator_id: string; objetivo: string; publico: string; tom: string; duracao_s: number;
    formato: string; qualidade: string; n_variacoes: number; titulo?: string; limite_custo?: number; salvar_rascunho?: boolean;
  };
  await doWorkspace("produtos", b.produto_id, s);
  await doWorkspace("atores", b.ator_id, s);
  const [prod] = await sql`select marca_id, nome from produtos where id = ${b.produto_id}`;
  const c = await situacaoConsentimento(b.ator_id);
  if (!["valido", "vencendo", "sintetico"].includes(c.estado)) {
    return NextResponse.json({ erro: "Foto de pessoa real só entra em produção com termo de uso de imagem assinado e vigente." }, { status: 422 });
  }
  const duracao = Math.min(60, Math.max(10, Number(b.duracao_s) || 30));
  const n = Math.min(6, Math.max(1, Number(b.n_variacoes) || 3));
  const est = await estimarProjeto(s.workspaceId, { duracao_s: duracao, qualidade: b.qualidade, n_variacoes: n });
  const limite = b.limite_custo ?? Math.max(50, Math.ceil(est.max * 1.5));
  const titulo = b.titulo?.trim() || `${prod.nome}: ${b.objetivo}`;
  const [p] = await sql`insert into projetos (workspace_id, marca_id, produto_id, ator_id, titulo, objetivo, publico, tom, duracao_s, formato, qualidade,
      n_variacoes, limite_custo, custo_estimado_min, custo_estimado_max, criado_por)
    values (${s.workspaceId}, ${prod.marca_id}, ${b.produto_id}, ${b.ator_id}, ${titulo}, ${b.objetivo}, ${b.publico ?? ""}, ${b.tom ?? ""}, ${duracao},
      ${b.formato ?? "9:16"}, ${b.qualidade ?? "720p"}, ${n}, ${limite}, ${est.min}, ${est.max}, ${s.usuarioId}) returning id`;
  await auditar(s.workspaceId, ator(s), "projeto_criado", { projetoId: p.id, dados: { mensagem: `${s.nome} criou o briefing`, estimativa: est } });
  if (!b.salvar_rascunho) await gerarVariacoes(p.id, ator(s));
  return NextResponse.json({ id: p.id, estimativa: est });
});
