import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { exigirApi, rota } from "@/lib/sessao";
import { registrarAgente } from "@/lib/agente";

/** Sinal de vida do app de desktop (a cada poucos segundos). */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const b = (await req.json().catch(() => ({}))) as { maquina?: string; versao?: string };
  const a = await registrarAgente(s, b.maquina ?? "", b.versao ?? "");
  const [p] = await sql`select count(*)::int as n from jobs where workspace_id = ${s.workspaceId} and executor = 'local' and estado = 'na_fila'`;
  return NextResponse.json({ agente: a.id, usuario: s.nome, workspace: s.workspaceNome, pendentes: p.n });
});
