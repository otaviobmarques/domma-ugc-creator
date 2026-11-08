import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { sha256, tokenAleatorio } from "@/lib/crypto";
import { textoTermo } from "@/lib/termo";

/** POST /atores/{id}/consentimento — cria o termo e devolve o link de assinatura eletrônica. */
export const POST = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("atores", id, s);
  const b = (await req.json()) as { titular: string; finalidade: string; marcas: string[]; canais: string[]; inicio: string; fim: string; usa_voz: boolean };
  if (!b.titular || !b.inicio || !b.fim || !b.marcas?.length) return NextResponse.json({ erro: "preencha titular, marcas e prazo" }, { status: 400 });
  const token = tokenAleatorio();
  const marcas = await sql`select nome from marcas where id in ${sql(b.marcas)} and workspace_id = ${s.workspaceId}`;
  const texto = textoTermo({ titular: b.titular, finalidade: b.finalidade, marcas: marcas.map((m) => m.nome), canais: b.canais, inicio: b.inicio, fim: b.fim, usaVoz: b.usa_voz });
  const [t] = await sql`insert into consentimentos (workspace_id, ator_id, titular, finalidade, marcas_permitidas, canais, usa_voz, inicio, fim, token_assinatura, documento_hash)
    values (${s.workspaceId}, ${id}, ${b.titular}, ${b.finalidade}, ${b.marcas}, ${b.canais ?? []}, ${b.usa_voz ?? true}, ${b.inicio}, ${b.fim}, ${token}, ${sha256(texto)}) returning id`;
  await auditar(s.workspaceId, ator(s), "termo_enviado", { alvo: t.id, dados: { ator_id: id, titular: b.titular } });
  return NextResponse.json({ link: `${process.env.APP_URL ?? ""}/termo/${token}` });
});
