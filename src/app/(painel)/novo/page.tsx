import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { urlAssinada } from "@/lib/storage";
import { situacaoConsentimento } from "@/lib/pipeline/guardas";
import { Briefing } from "./Briefing";

export default async function NovoUGC() {
  const s = await exigirSessao(["admin", "produtor"]);
  const atores = await sql`select id, nome, tipo, descricao, foto_url, status from atores where workspace_id = ${s.workspaceId} and status <> 'arquivado' order by tipo, nome`;
  const marcas = await sql`select id, nome from marcas where workspace_id = ${s.workspaceId} order by nome`;
  const produtos = await sql`select id, marca_id, nome, descricao, preco, imagens from produtos where workspace_id = ${s.workspaceId} order by criado_em desc`;
  const comTermo = await Promise.all(
    atores.map(async (a) => {
      const c = await situacaoConsentimento(a.id);
      return { id: a.id, nome: a.nome, tipo: a.tipo, descricao: a.descricao, status: a.status, foto: urlAssinada(a.foto_url), termo: c.estado, fim: "termo" in c && c.termo ? new Date(c.termo.fim).toISOString().slice(0, 10) : null };
    }),
  );
  return (
    <Briefing
      atores={comTermo}
      marcas={marcas.map((m) => ({ id: m.id, nome: m.nome }))}
      produtos={produtos.map((p) => ({ id: p.id, marca_id: p.marca_id, nome: p.nome, descricao: p.descricao, preco: p.preco, foto: urlAssinada(p.imagens?.[0]), n: p.imagens?.length ?? 0 }))}
    />
  );
}
