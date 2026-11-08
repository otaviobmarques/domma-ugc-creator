import { NextResponse } from "next/server";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { gerarVariacoes } from "@/lib/pipeline/projeto";

/** POST /projetos/{id}/roteiros — pede ao agente as variações (de novo). */
export const POST = rota(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("projetos", id, s);
  await gerarVariacoes(id, ator(s));
  return NextResponse.json({ ok: true });
});
