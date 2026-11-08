import { NextResponse } from "next/server";
import { exigirApi, rota } from "@/lib/sessao";
import { estimarProjeto } from "@/lib/pipeline/projeto";

export const GET = rota(async (req: Request) => {
  const s = await exigirApi();
  const u = new URL(req.url).searchParams;
  const est = await estimarProjeto(s.workspaceId, { duracao_s: Number(u.get("duracao") ?? 30), qualidade: u.get("qualidade") ?? "720p", n_variacoes: Number(u.get("n") ?? 3) });
  return NextResponse.json(est);
});
