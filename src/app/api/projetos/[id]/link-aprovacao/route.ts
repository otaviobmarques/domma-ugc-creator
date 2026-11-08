import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { tokenAleatorio } from "@/lib/crypto";

/** RF-43: link de aprovação para o cliente (sem login). */
export const POST = rota(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor", "revisor"]);
  const { id } = await params;
  await doWorkspace("projetos", id, s);
  const [p] = await sql`update projetos set token_aprovacao = coalesce(token_aprovacao, ${tokenAleatorio()}) where id = ${id} returning token_aprovacao`;
  await auditar(s.workspaceId, ator(s), "link_aprovacao", { projetoId: id, dados: { mensagem: `${s.nome} gerou o link de aprovação do cliente` } });
  return NextResponse.json({ link: `${process.env.APP_URL ?? ""}/aprovar/${p.token_aprovacao}` });
});
