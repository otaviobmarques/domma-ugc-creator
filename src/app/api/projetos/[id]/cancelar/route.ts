import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";

export const POST = rota(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("projetos", id, s);
  await sql`update jobs set estado = 'cancelado' where projeto_id = ${id} and estado in ('na_fila','gerando','aguardando_aprovacao')`;
  await sql`update variacoes set estado = 'roteiro' where projeto_id = ${id} and estado in ('em_producao','em_qa')`;
  await sql`update projetos set estado = 'roteiro_gerado', atualizado_em = now() where id = ${id}`;
  await auditar(s.workspaceId, ator(s), "producao_cancelada", { projetoId: id, dados: { mensagem: `${s.nome} cancelou a produção` } });
  return NextResponse.json({ ok: true });
});
