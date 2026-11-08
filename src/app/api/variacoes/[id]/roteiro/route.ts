import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { normalizar, regerar, RoteiroSchema, verificar } from "@/lib/agent/roteiro";
import { contextoBriefing } from "@/lib/pipeline/projeto";

/** PATCH /variacoes/{id}/roteiro — edição manual ({roteiro}) ou instrução de ajuste ({instrucao, bloco?}). */
export const PATCH = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("variacoes", id, s);
  const b = (await req.json()) as { roteiro?: unknown; instrucao?: string; bloco?: number };
  const [v] = await sql`select v.*, a.tipo as ator_tipo from variacoes v join projetos p on p.id = v.projeto_id join atores a on a.id = p.ator_id where v.id = ${id}`;
  const ctx = await contextoBriefing(v.projeto_id);
  let roteiro;
  if (b.roteiro) {
    const r = RoteiroSchema.safeParse(b.roteiro);
    if (!r.success) return NextResponse.json({ erro: "roteiro inválido" }, { status: 400 });
    roteiro = normalizar(r.data, ctx.duracao_s);
  } else if (b.instrucao) {
    roteiro = (await regerar(ctx, v.roteiro, b.instrucao, b.bloco)).roteiro;
  } else return NextResponse.json({ erro: "nada a fazer" }, { status: 400 });
  const ver = verificar(roteiro, ctx.marca.termos_vetados, v.ator_tipo === "sintetico");
  await sql`update variacoes set roteiro = ${sql.json(roteiro as never)}, verificacao = ${sql.json(ver as never)} where id = ${id}`;
  await auditar(s.workspaceId, ator(s), b.roteiro ? "roteiro_editado" : "roteiro_regerado", {
    projetoId: v.projeto_id,
    dados: { mensagem: `${s.nome} ${b.roteiro ? "editou" : `pediu ajuste ("${b.instrucao}")`} na variação ${v.letra}` },
  });
  return NextResponse.json({ roteiro, verificacao: ver });
});
