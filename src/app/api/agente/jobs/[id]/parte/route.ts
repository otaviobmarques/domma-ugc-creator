import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ErroHttp, exigirApi, rota } from "@/lib/sessao";
import { jobDoAgente } from "@/lib/agente";

const MAX = 3.5 * 1024 * 1024;

/** PUT /api/agente/jobs/{id}/parte?n=0&agente=... — recebe um pedaço do vídeo montado no PC. */
export const PUT = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  const u = new URL(req.url).searchParams;
  await jobDoAgente(id, s, u.get("agente") ?? "");
  const n = Number(u.get("n"));
  if (!Number.isInteger(n) || n < 0 || n > 200) throw new ErroHttp(400, "parte inválida");
  const dados = Buffer.from(await req.arrayBuffer());
  if (!dados.length || dados.length > MAX) throw new ErroHttp(413, "parte vazia ou grande demais");
  await sql`insert into uploads_parciais (job_id, n, dados) values (${id}, ${n}, ${dados})
    on conflict (job_id, n) do update set dados = excluded.dados`;
  await sql`update jobs set progresso = least(95, progresso + 5) where id = ${id}`;
  return NextResponse.json({ ok: true, bytes: dados.length });
});
