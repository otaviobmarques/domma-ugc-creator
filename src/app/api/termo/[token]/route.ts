import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

/** Assinatura eletrônica pelo titular (público, via link). Registra data, IP e hash do documento. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = (await req.json()) as { nome: string; documento: string; aceite: boolean };
  const [t] = await sql`select * from consentimentos where token_assinatura = ${token} and assinado_em is null and revogado_em is null`;
  if (!t) return NextResponse.json({ erro: "link inválido ou já utilizado" }, { status: 404 });
  if (!b.aceite || !b.nome?.trim() || !b.documento?.trim()) return NextResponse.json({ erro: "preencha nome, documento e aceite" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const hash = sha256(`${t.documento_hash}|${b.nome}|${b.documento}|${ip}|${new Date().toISOString()}`);
  await sql`update consentimentos set assinado_em = now(), ip = ${ip}, titular = ${b.nome.trim()}, documento_titular = ${b.documento.trim()},
    documento_hash = ${hash}, token_assinatura = null where id = ${t.id}`;
  await auditar(t.workspace_id, `titular:${b.nome.trim()}`, "termo_assinado", { alvo: t.id, dados: { ip, hash } });
  return NextResponse.json({ ok: true, codigo: hash.slice(0, 12).toUpperCase() });
}
