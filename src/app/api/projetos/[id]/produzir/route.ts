import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { produzir } from "@/lib/pipeline/orquestrador";

/** POST /projetos/{id}/produzir — aprova roteiros e dispara o pipeline. */
export const POST = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("projetos", id, s);
  const b = (await req.json().catch(() => ({}))) as { voz_id?: string; voz_ritmo?: string };
  if (b.voz_ritmo || b.voz_id) await sql`update projetos set voz_id = coalesce(${b.voz_id ?? null}, voz_id), voz_ritmo = coalesce(${b.voz_ritmo ?? null}, voz_ritmo) where id = ${id}`;
  await sql`update projetos set estado = 'roteiro_aprovado' where id = ${id}`;
  await produzir(id, ator(s));
  return NextResponse.json({ ok: true });
});
