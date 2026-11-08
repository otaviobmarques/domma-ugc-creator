import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { avancar } from "@/lib/pipeline/orquestrador";
import { custoProjeto } from "@/lib/pipeline/guardas";

/** Aprovação humana após o limite de custo (pedir_aprovacao): aumenta o limite e retoma. */
export const POST = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("projetos", id, s);
  const { novo_limite } = (await req.json()) as { novo_limite: number };
  const gasto = await custoProjeto(id);
  if (!(novo_limite > gasto)) return NextResponse.json({ erro: `o novo limite precisa ser maior que o gasto atual (R$ ${gasto.toFixed(2)})` }, { status: 400 });
  await sql`update projetos set limite_custo = ${novo_limite}, estado = 'em_producao' where id = ${id}`;
  await auditar(s.workspaceId, ator(s), "limite_aprovado", { projetoId: id, dados: { mensagem: `${s.nome} aprovou novo limite de R$ ${novo_limite}` } });
  for (const v of await sql`select id from variacoes where projeto_id = ${id} and estado in ('em_producao','em_qa')`) await avancar(v.id);
  return NextResponse.json({ ok: true });
});
