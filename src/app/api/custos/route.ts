import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { exigirApi, rota } from "@/lib/sessao";

/** GET /custos?de=&ate=&marca=&formato=csv — relatório de custos (RF-50). */
export const GET = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const u = new URL(req.url).searchParams;
  const de = u.get("de") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const ate = u.get("ate") || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const marca = u.get("marca") || null;
  const linhas = await sql`
    select c.data, c.etapa, c.provedor, c.unidade, c.quantidade, c.valor_usd, c.valor_brl, p.titulo as projeto, m.nome as marca
    from custos c left join projetos p on p.id = c.projeto_id left join marcas m on m.id = p.marca_id
    where c.workspace_id = ${s.workspaceId} and c.data >= ${de} and c.data < ${ate} and (${marca}::uuid is null or p.marca_id = ${marca}::uuid)
    order by c.data desc`;
  if (u.get("formato") === "csv") {
    const csv = ["data;marca;projeto;etapa;provedor;unidade;quantidade;usd;brl",
      ...linhas.map((l) => [new Date(l.data).toISOString(), l.marca, l.projeto, l.etapa, l.provedor, l.unidade, l.quantidade, Number(l.valor_usd).toFixed(4), Number(l.valor_brl).toFixed(2)].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
    return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="custos-${de}-${ate}.csv"` } });
  }
  return NextResponse.json({ de, ate, linhas });
});
