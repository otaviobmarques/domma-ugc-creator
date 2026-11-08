import { NextResponse } from "next/server";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { decidir, pedirAjuste, refazerTrecho } from "@/lib/pipeline/revisao";

/** POST /variacoes/{id}/revisao — aprovar, pedir ajuste (linguagem natural), reprovar ou refazer trecho. */
export const POST = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor", "revisor"]);
  const { id } = await params;
  await doWorkspace("variacoes", id, s);
  const b = (await req.json()) as { acao: "aprovar" | "reprovar" | "ajuste" | "trecho"; comentario?: string; tempo_s?: number };
  if (b.acao === "ajuste") {
    if (!b.comentario?.trim()) return NextResponse.json({ erro: "diga o que mudar" }, { status: 400 });
    return NextResponse.json({ decisao: await pedirAjuste(id, b.comentario, ator(s)) });
  }
  if (b.acao === "trecho") {
    await refazerTrecho(id, Number(b.tempo_s ?? 0), ator(s));
    return NextResponse.json({ ok: true });
  }
  await decidir(id, b.acao, ator(s), b.comentario);
  return NextResponse.json({ ok: true });
});
