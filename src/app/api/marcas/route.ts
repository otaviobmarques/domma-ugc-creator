import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, exigirApi, rota } from "@/lib/sessao";
import { salvarUpload } from "@/lib/upload";

/** Cria ou atualiza marca (cliente): diretrizes, termos vetados, logo e músicas permitidas. */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const f = await req.formData();
  const id = (f.get("id") as string) || null;
  const nome = String(f.get("nome") ?? "").trim();
  if (!nome) return NextResponse.json({ erro: "informe o nome" }, { status: 400 });
  const vetados = String(f.get("termos_vetados") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const logo = f.get("logo");
  const logoChave = logo instanceof File && logo.size ? await salvarUpload(logo, s.workspaceId, "marcas") : null;
  const musicas: string[] = [];
  for (const m of f.getAll("musicas")) if (m instanceof File && m.size) musicas.push(await salvarUpload(m, s.workspaceId, "musicas"));
  let r;
  if (id) {
    [r] = await sql`update marcas set nome = ${nome}, diretrizes = ${String(f.get("diretrizes") ?? "")}, termos_vetados = ${vetados},
      logo_url = coalesce(${logoChave}, logo_url), musicas_permitidas = musicas_permitidas || ${musicas}::text[]
      where id = ${id} and workspace_id = ${s.workspaceId} returning *`;
  } else {
    [r] = await sql`insert into marcas (workspace_id, nome, diretrizes, termos_vetados, logo_url, musicas_permitidas)
      values (${s.workspaceId}, ${nome}, ${String(f.get("diretrizes") ?? "")}, ${vetados}, ${logoChave}, ${musicas}) returning *`;
  }
  await auditar(s.workspaceId, ator(s), id ? "marca_editada" : "marca_criada", { alvo: r.id });
  return NextResponse.json({ marca: r });
});
