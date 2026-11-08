import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { resolver, tts } from "@/lib/providers";
import { registrarCusto } from "@/lib/pipeline/guardas";
import { urlAssinada } from "@/lib/storage";
import { falaCompleta } from "@/lib/agent/roteiro";

/** RF-14: prévia de áudio da variação com a voz e o ritmo escolhidos. */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const b = (await req.json()) as { variacao_id: string; voz_id?: string; ritmo: "animada" | "natural" | "calma" };
  await doWorkspace("variacoes", b.variacao_id, s);
  const [v] = await sql`select v.roteiro, v.projeto_id, a.voz_id from variacoes v join projetos p on p.id = v.projeto_id join atores a on a.id = p.ator_id where v.id = ${b.variacao_id}`;
  const r = await resolver(s.workspaceId, "narracao");
  const res = await tts(r.opcaoId).gerarNarracao({ texto: falaCompleta(v.roteiro), vozId: b.voz_id || v.voz_id, ritmo: b.ritmo }, { workspaceId: s.workspaceId, projetoId: v.projeto_id, apiKey: r.apiKey });
  await registrarCusto({ workspaceId: s.workspaceId, projetoId: v.projeto_id, jobId: null, etapa: "previa_voz", provedor: r.opcaoId, unidade: res.unidade, quantidade: res.quantidade, usd: res.custoUsd });
  return NextResponse.json({ url: urlAssinada(res.chave), duracao: res.duracaoS, provedor: r.opcaoId });
});
