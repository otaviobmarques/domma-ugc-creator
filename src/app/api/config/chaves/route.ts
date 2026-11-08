import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, exigirApi, rota } from "@/lib/sessao";
import { cifrar } from "@/lib/crypto";
import { testarChave } from "@/lib/testarChave";
import { PROVEDORES } from "@/lib/providers/catalogo";
import { garantirBucket } from "@/lib/storage";

/** Adicionar/trocar chave: testa antes de salvar, cifra e guarda só os 4 últimos caracteres visíveis. Só administradores. */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin"]);
  const b = (await req.json()) as { provedor: string; nome: string; chave: string; limite_mensal_usd?: number | null };
  if (!PROVEDORES.some((p) => p.id === b.provedor)) return NextResponse.json({ erro: "provedor desconhecido" }, { status: 400 });
  const chave = (b.chave ?? "").trim();
  if (!chave) return NextResponse.json({ erro: "cole a chave" }, { status: 400 });
  let teste;
  try {
    teste = await testarChave(b.provedor, chave);
  } catch (e) {
    await auditar(s.workspaceId, ator(s), "chave_teste_falhou", { alvo: b.provedor });
    return NextResponse.json({ erro: `Teste falhou: ${e instanceof Error ? e.message.slice(0, 200) : e}` }, { status: 422 });
  }
  await sql`insert into chaves_api (workspace_id, provedor, nome, chave_cifrada, ultimos4, status, limite_mensal_usd, testada_em)
    values (${s.workspaceId}, ${b.provedor}, ${b.nome || b.provedor}, ${cifrar(chave)}, ${chave.slice(-4)}, ${teste.saldoBaixo ? "saldo_baixo" : "conectado"}, ${b.limite_mensal_usd ?? null}, now())
    on conflict (workspace_id, provedor) do update set nome = excluded.nome, chave_cifrada = excluded.chave_cifrada, ultimos4 = excluded.ultimos4,
      status = excluded.status, limite_mensal_usd = excluded.limite_mensal_usd, testada_em = now()`;
  if (b.provedor === "supabase") await garantirBucket().catch(() => false);
  await auditar(s.workspaceId, ator(s), "chave_salva", { alvo: b.provedor, dados: { ultimos4: chave.slice(-4), detalhe: teste.detalhe } });
  return NextResponse.json({ ok: true, detalhe: teste.detalhe });
});
