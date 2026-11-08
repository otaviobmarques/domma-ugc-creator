import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decidir, pedirAjuste } from "@/lib/pipeline/revisao";

/** Cliente final (sem login, via link): escolhe uma variação, comenta, aprova ou pede ajuste. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [p] = await sql`select id from projetos where token_aprovacao = ${token}`;
  if (!p) return NextResponse.json({ erro: "link inválido" }, { status: 404 });
  const b = (await req.json()) as { variacao_id: string; acao: "aprovar" | "ajuste"; comentario?: string; nome?: string };
  const [v] = await sql`select id from variacoes where id = ${b.variacao_id} and projeto_id = ${p.id} and video_final_url is not null`;
  if (!v) return NextResponse.json({ erro: "variação inválida" }, { status: 400 });
  const autor = `cliente:${(b.nome ?? "cliente").slice(0, 60)}`;
  if (b.acao === "aprovar") {
    await sql`update variacoes set escolhida_cliente = (id = ${v.id}) where projeto_id = ${p.id}`;
    await decidir(v.id, "aprovar", autor, b.comentario);
  } else {
    if (!b.comentario?.trim()) return NextResponse.json({ erro: "escreva o que mudar" }, { status: 400 });
    await pedirAjuste(v.id, b.comentario, autor);
  }
  return NextResponse.json({ ok: true });
}
