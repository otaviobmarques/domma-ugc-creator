import { NextResponse } from "next/server";
import { doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { statusProjeto } from "@/lib/consultas";

/** GET /projetos/{id}/status — variações, cenas, jobs, custo e registro do agente. */
export const GET = rota(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi();
  const { id } = await params;
  await doWorkspace("projetos", id, s);
  return NextResponse.json(await statusProjeto(id, s.papel !== "cliente"));
});
