import { NextResponse } from "next/server";
import { sql, auditar } from "@/lib/db";
import { ator, doWorkspace, exigirApi, rota } from "@/lib/sessao";
import { baixarImagem, extrairProduto, salvarUpload } from "@/lib/upload";

/** POST /produtos/importar — por link da loja ou por upload de fotos (até 10). */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const form = await req.formData();
  const marcaId = String(form.get("marca_id") ?? "");
  await doWorkspace("marcas", marcaId, s);
  const url = String(form.get("url") ?? "").trim();
  const fotos = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
  let dados = { nome: String(form.get("nome") ?? ""), descricao: String(form.get("descricao") ?? ""), preco: (form.get("preco") as string) || null, imagens: [] as string[] };
  let importadas = 0;
  if (url) {
    const ext = await extrairProduto(url);
    dados = { nome: dados.nome || ext.nome, descricao: dados.descricao || ext.descricao, preco: dados.preco || ext.preco, imagens: [] };
    for (const i of ext.imagens) {
      const c = await baixarImagem(i, s.workspaceId).catch(() => null);
      if (c) dados.imagens.push(c);
    }
    importadas = dados.imagens.length;
  }
  for (const f of fotos) dados.imagens.push(await salvarUpload(f, s.workspaceId, "produtos"));
  if (!dados.nome) return NextResponse.json({ erro: "informe o nome do produto ou um link válido" }, { status: 400 });
  const [p] = await sql`insert into produtos (workspace_id, marca_id, nome, descricao, preco, url_origem, imagens)
    values (${s.workspaceId}, ${marcaId}, ${dados.nome}, ${dados.descricao}, ${dados.preco}, ${url || null}, ${dados.imagens}) returning *`;
  await auditar(s.workspaceId, ator(s), "produto_importado", { alvo: p.id, dados: { url, importadas } });
  return NextResponse.json({ produto: p, importadas });
});
