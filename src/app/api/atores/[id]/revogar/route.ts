import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";

/** RF-31: revogação bloqueia novas produções na hora. */
export const POST = rota(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("atores", id, s);
  const r = await sql`update consentimentos set revogado_em = now() where ator_id = ${id} and revogado_em is null returning id`;
  await auditar(s.workspaceId, ator(s), "termo_revogado", { alvo: id, dados: { termos: r.length } });
  return NextResponse.json({ ok: true, revogados: r.length });
});
