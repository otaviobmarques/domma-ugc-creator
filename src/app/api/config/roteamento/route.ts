import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, exigirApi, rota } from "@/lib/sessao";
import { OPCOES } from "@/lib/providers/catalogo";

/** RF-54: provedor principal e alternativo por etapa. */
export const PUT = rota(async (req: Request) => {
  const s = await exigirApi(["admin"]);
  const b = (await req.json()) as Record<string, { principal: string; alternativo: string }>;
  const limpo: Record<string, { principal: string; alternativo: string }> = {};
  for (const [etapa, v] of Object.entries(b)) {
    const ops = OPCOES[etapa as keyof typeof OPCOES];
    if (!ops) continue;
    if (!ops.some((o) => o.id === v.principal) || !ops.some((o) => o.id === v.alternativo)) return NextResponse.json({ erro: `opção inválida em ${etapa}` }, { status: 400 });
    limpo[etapa] = { principal: v.principal, alternativo: v.alternativo };
  }
  await sql`update workspaces set config_provedores = config_provedores || ${sql.json(limpo)} where id = ${s.workspaceId}`;
  await auditar(s.workspaceId, ator(s), "roteamento_alterado", { dados: limpo });
  return NextResponse.json({ ok: true });
});
