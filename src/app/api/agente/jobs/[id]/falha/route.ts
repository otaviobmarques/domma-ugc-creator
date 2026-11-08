import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { exigirApi, rota } from "@/lib/sessao";
import { jobDoAgente } from "@/lib/agente";
import { devolverMontagemParaNuvem } from "@/lib/pipeline/orquestrador";

/** O PC não conseguiu montar: a montagem volta para a nuvem (a produção não para). */
export const POST = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  const b = (await req.json()) as { agente: string; erro?: string };
  await jobDoAgente(id, s, b.agente);
  await sql`delete from uploads_parciais where job_id = ${id}`;
  await devolverMontagemParaNuvem(id, `erro no PC: ${(b.erro ?? "desconhecido").slice(0, 300)}`);
  return NextResponse.json({ ok: true });
});
