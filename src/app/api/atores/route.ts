import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, exigirApi, rota } from "@/lib/sessao";
import { salvarUpload } from "@/lib/upload";
import { checarFotoAtor } from "@/lib/agent/foto";
import { imagem, resolver } from "@/lib/providers";

/** POST /atores — pessoa real (foto + termo) ou ator sintético gerado por descrição (RF-02, RF-32). */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const form = await req.formData();
  const tipo = form.get("tipo") === "sintetico" ? "sintetico" : "real";
  const nome = String(form.get("nome") ?? "").trim();
  const descricao = String(form.get("descricao") ?? "").trim();
  if (!nome) return NextResponse.json({ erro: "informe o nome" }, { status: 400 });
  let foto: string | null = null;
  const arquivo = form.get("foto");
  if (arquivo instanceof File && arquivo.size) foto = await salvarUpload(arquivo, s.workspaceId, "atores");
  let prompt: string | null = null;
  if (tipo === "sintetico" && !foto) {
    prompt = `Retrato fotorrealista de uma pessoa fictícia para vídeo UGC: ${descricao}. Foto de celular, luz natural, fundo de casa, olhando para a câmera.`;
    const r = await resolver(s.workspaceId, "imagem");
    const res = await imagem(r.opcaoId).gerarImagemChave({ fotoAtor: null, fotosProduto: [], cena: prompt, formato: "9:16" }, { workspaceId: s.workspaceId, projetoId: "atores", apiKey: r.apiKey });
    foto = res.chave;
  }
  let status = "ativo";
  let aviso: string | null = null;
  if (tipo === "real" && foto) {
    const c = await checarFotoAtor(s.workspaceId, foto);
    if (c.bloquear) {
      status = "bloqueado";
      aviso = `Foto bloqueada: ${c.motivo}`;
    } else if (c.simulado) aviso = c.motivo;
  }
  const [a] = await sql`insert into atores (workspace_id, tipo, nome, descricao, foto_url, prompt_origem, status, voz_id)
    values (${s.workspaceId}, ${tipo}, ${nome}, ${descricao}, ${foto}, ${prompt ?? (form.get("prompt_origem") as string) ?? null}, ${status}, ${(form.get("voz_id") as string) || null}) returning *`;
  await auditar(s.workspaceId, ator(s), "ator_cadastrado", { alvo: a.id, dados: { tipo, status, aviso } });
  return NextResponse.json({ ator: a, aviso });
});
