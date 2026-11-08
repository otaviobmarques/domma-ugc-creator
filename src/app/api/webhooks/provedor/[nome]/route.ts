import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verificarAssinatura } from "@/lib/crypto";
import { enfileirarConsulta } from "@/lib/fila";

/**
 * POST /webhooks/provedor/{nome}?job=<assinado> — retorno assíncrono dos provedores.
 * O id do job vai assinado (HMAC) na URL de callback; sem assinatura válida, recusa.
 * O webhook só antecipa a consulta: o resultado é sempre buscado e validado pelo worker.
 */
export async function POST(req: Request) {
  const jobAssinado = new URL(req.url).searchParams.get("job") ?? "";
  const jobId = verificarAssinatura(jobAssinado);
  if (!jobId) return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  const [j] = await sql`select estado from jobs where id = ${jobId}`;
  if (j?.estado === "gerando") await enfileirarConsulta(jobId, 0);
  return NextResponse.json({ ok: true });
}
