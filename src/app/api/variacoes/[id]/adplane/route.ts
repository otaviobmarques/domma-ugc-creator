import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { obterChave } from "@/lib/providers";
import { urlAssinada } from "@/lib/storage";

/**
 * RF-45: envia o vídeo aprovado ao Adplane. O contrato do Adplane (integração interna via MCP/REST)
 * ainda não está definido: configure ADPLANE_URL e a chave "adplane" em Configurações.
 */
export const POST = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor"]);
  const { id } = await params;
  await doWorkspace("variacoes", id, s);
  const { campanha } = (await req.json().catch(() => ({}))) as { campanha?: string };
  const [v] = await sql`select v.*, p.titulo, m.nome as marca from variacoes v join projetos p on p.id = v.projeto_id join marcas m on m.id = p.marca_id where v.id = ${id}`;
  if (v.estado !== "aprovado") return NextResponse.json({ erro: "aprove a variação antes de enviar" }, { status: 409 });
  const token = await obterChave(s.workspaceId, "adplane");
  const url = process.env.ADPLANE_URL;
  if (!token || !url) return NextResponse.json({ erro: "Adplane não configurado (chave em Configurações e ADPLANE_URL no ambiente)" }, { status: 412 });
  const absoluto = new URL(urlAssinada(v.video_final_url, 7 * 86400)!, process.env.APP_URL).toString();
  const r = await fetch(`${url.replace(/\/$/, "")}/criativos`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ titulo: `${v.titulo} — ${v.letra}`, marca: v.marca, campanha, video_url: absoluto, gerado_por_ia: true }),
  });
  if (!r.ok) return NextResponse.json({ erro: `Adplane respondeu ${r.status}` }, { status: 502 });
  await sql`update projetos set estado = 'entregue' where id = ${v.projeto_id}`;
  await auditar(s.workspaceId, ator(s), "enviado_adplane", { projetoId: v.projeto_id, alvo: id, dados: { mensagem: `${s.nome} enviou a variação ${v.letra} ao Adplane`, campanha } });
  return NextResponse.json({ ok: true });
});
