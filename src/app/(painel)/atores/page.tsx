import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { urlAssinada } from "@/lib/storage";
import { situacaoConsentimento } from "@/lib/pipeline/guardas";
import { Atores } from "./Atores";

export default async function PaginaAtores({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const s = await exigirSessao();
  const atores = await sql`select * from atores where workspace_id = ${s.workspaceId} and status <> 'arquivado' order by criado_em`;
  const marcas = await sql`select id, nome from marcas where workspace_id = ${s.workspaceId} order by nome`;
  const lista = await Promise.all(atores.map(async (a) => {
    const c = await situacaoConsentimento(a.id);
    const t = "termo" in c ? c.termo : null;
    return {
      id: a.id, nome: a.nome, tipo: a.tipo, descricao: a.descricao, status: a.status, voz: a.voz_clonada, foto: urlAssinada(a.foto_url),
      termo: c.estado, dias: "dias" in c ? c.dias ?? null : null, fim: t ? new Date(t.fim).toISOString().slice(0, 10) : null,
      link: t?.token_assinatura ? `/termo/${t.token_assinatura}` : null, prompt: a.prompt_origem,
    };
  }));
  return <Atores atores={lista} marcas={marcas.map((m) => ({ id: m.id, nome: m.nome }))} abrirNovo={(await searchParams).novo ?? null} podeEditar={["admin", "produtor"].includes(s.papel)} />;
}
