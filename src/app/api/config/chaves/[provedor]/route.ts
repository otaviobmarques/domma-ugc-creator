import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, exigirApi, rota } from "@/lib/sessao";
import { decifrar } from "@/lib/crypto";
import { testarChave } from "@/lib/testarChave";

/** POST: testar a chave salva. DELETE: remover. */
export const POST = rota(async (_req: Request, { params }: { params: Promise<{ provedor: string }> }) => {
  const s = await exigirApi(["admin"]);
  const { provedor } = await params;
  const [k] = await sql`select chave_cifrada from chaves_api where workspace_id = ${s.workspaceId} and provedor = ${provedor}`;
  if (!k) return NextResponse.json({ erro: "não configurado" }, { status: 404 });
  try {
    const t = await testarChave(provedor, decifrar(k.chave_cifrada));
    await sql`update chaves_api set status = ${t.saldoBaixo ? "saldo_baixo" : "conectado"}, testada_em = now() where workspace_id = ${s.workspaceId} and provedor = ${provedor}`;
    return NextResponse.json({ ok: true, detalhe: t.detalhe });
  } catch (e) {
    await sql`update chaves_api set status = 'chave_invalida', testada_em = now() where workspace_id = ${s.workspaceId} and provedor = ${provedor}`;
    return NextResponse.json({ erro: e instanceof Error ? e.message.slice(0, 200) : "falhou" }, { status: 422 });
  }
});

export const DELETE = rota(async (_req: Request, { params }: { params: Promise<{ provedor: string }> }) => {
  const s = await exigirApi(["admin"]);
  const { provedor } = await params;
  await sql`delete from chaves_api where workspace_id = ${s.workspaceId} and provedor = ${provedor}`;
  await auditar(s.workspaceId, ator(s), "chave_removida", { alvo: provedor });
  return NextResponse.json({ ok: true });
});
