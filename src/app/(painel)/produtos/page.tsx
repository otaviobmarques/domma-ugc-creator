import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { urlAssinada } from "@/lib/storage";
import { Cabecalho } from "@/components/ui";
import { NovoProduto } from "./NovoProduto";

export default async function Produtos() {
  const s = await exigirSessao();
  const marcas = await sql`select id, nome from marcas where workspace_id = ${s.workspaceId} order by nome`;
  const produtos = await sql`select p.*, m.nome as marca from produtos p join marcas m on m.id = p.marca_id where p.workspace_id = ${s.workspaceId} order by p.criado_em desc`;
  return (
    <>
      <Cabecalho kicker="Biblioteca" titulo="Produtos" sub="Importe pelo link da loja ou envie as fotos." />
      {["admin", "produtor"].includes(s.papel) && <NovoProduto marcas={marcas.map((m) => ({ id: m.id, nome: m.nome }))} />}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {produtos.map((p) => (
          <div key={p.id} className="cartao p-3">
            <div className="aspect-square overflow-hidden rounded-lg bg-lavanda">{p.imagens?.[0] && <img src={urlAssinada(p.imagens[0])!} alt={p.nome} className="h-full w-full object-cover" />}</div>
            <div className="mt-2 text-sm font-semibold">{p.nome}</div>
            <div className="text-xs text-cinza">{p.marca}{p.preco ? ` · ${p.preco}` : ""} · {p.imagens?.length ?? 0} foto(s)</div>
            <p className="mt-1 line-clamp-2 text-xs text-cinza">{p.descricao}</p>
          </div>
        ))}
      </div>
    </>
  );
}
