import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { novaChave, salvar, urlAssinada } from "@/lib/storage";
import { reenquadrar } from "@/lib/pipeline/montagem";

/** GET /variacoes/{id}/exportar?formato=9x16|1x1|16x9|srt — arquivo final com URL assinada (RF-44). */
export const GET = rota(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await exigirApi(["admin", "produtor", "revisor"]);
  const { id } = await params;
  await doWorkspace("variacoes", id, s);
  const formato = new URL(req.url).searchParams.get("formato") ?? "9x16";
  const [v] = await sql`select v.*, p.formato, p.qualidade, p.titulo, p.workspace_id from variacoes v join projetos p on p.id = v.projeto_id where v.id = ${id}`;
  if (!v.video_final_url) return NextResponse.json({ erro: "vídeo ainda não montado" }, { status: 409 });
  const base = `${v.titulo}-${v.letra}`.toLowerCase().replace(/[^\w]+/g, "-");
  let chave: string;
  if (formato === "srt") {
    chave = await salvar(novaChave(v.workspace_id, v.projeto_id, "legendas.srt"), Buffer.from(v.legendas_srt ?? "", "utf8"));
  } else {
    const alvo = formato.replace("x", ":");
    chave = alvo === v.formato ? v.video_final_url : await reenquadrar(v.workspace_id, v.projeto_id, v.video_final_url, alvo, v.qualidade);
  }
  await auditar(s.workspaceId, ator(s), "exportacao", { projetoId: v.projeto_id, alvo: id, dados: { formato } });
  const url = urlAssinada(chave, 900)! + `&download=${encodeURIComponent(`${base}-${formato}.${formato === "srt" ? "srt" : "mp4"}`)}`;
  return NextResponse.redirect(new URL(url, req.url), 303);
});
