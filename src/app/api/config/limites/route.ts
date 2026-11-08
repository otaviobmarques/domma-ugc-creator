import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, exigirApi, rota } from "@/lib/sessao";

export const PUT = rota(async (req: Request) => {
  const s = await exigirApi(["admin"]);
  const b = (await req.json()) as { limite_custo_mensal: number; chaves?: Record<string, number | null> };
  if (!(b.limite_custo_mensal > 0)) return NextResponse.json({ erro: "limite inválido" }, { status: 400 });
  await sql`update workspaces set limite_custo_mensal = ${b.limite_custo_mensal} where id = ${s.workspaceId}`;
  for (const [prov, lim] of Object.entries(b.chaves ?? {}))
    await sql`update chaves_api set limite_mensal_usd = ${lim} where workspace_id = ${s.workspaceId} and provedor = ${prov}`;
  await auditar(s.workspaceId, ator(s), "limites_alterados", { dados: b });
  return NextResponse.json({ ok: true });
});
