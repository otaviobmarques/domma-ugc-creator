import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { OPCOES, PROVEDORES, ROTEAMENTO_PADRAO } from "@/lib/providers/catalogo";
import { simuladorPermitido } from "@/lib/providers";
import { Configuracoes } from "./Configuracoes";

export default async function PaginaConfig({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const s = await exigirSessao(["admin"]);
  const chaves = await sql`select provedor, nome, ultimos4, status, limite_mensal_usd, testada_em from chaves_api where workspace_id = ${s.workspaceId}`;
  const gasto = await sql`select o.provedor, sum(valor_usd)::float as usd from custos o where workspace_id = ${s.workspaceId} and data >= date_trunc('month', now()) group by o.provedor`;
  const [ws] = await sql`select nome, limite_custo_mensal, config_provedores from workspaces where id = ${s.workspaceId}`;
  const membros = await sql`select u.nome, u.email, m.papel from membros m join usuarios u on u.id = m.usuario_id where m.workspace_id = ${s.workspaceId}`;
  const auditoria = await sql`select ator, acao, alvo, criado_em from auditoria where workspace_id = ${s.workspaceId} and ator <> 'agente' order by criado_em desc limit 80`;
  // gasto por chave: soma os ids de opção que usam aquela chave
  const porChave: Record<string, number> = {};
  for (const g of gasto) {
    const op = Object.values(OPCOES).flat().find((o) => o.id === g.provedor);
    const k = g.provedor === "anthropic" ? "anthropic" : op?.chave;
    if (k) porChave[k] = (porChave[k] ?? 0) + g.usd;
  }
  return (
    <Configuracoes
      aba={(await searchParams).aba ?? "chaves"}
      provedores={PROVEDORES}
      chaves={chaves.map((c) => ({ provedor: c.provedor, nome: c.nome, ultimos4: c.ultimos4, status: c.status, limite: c.limite_mensal_usd, gasto: porChave[c.provedor] ?? 0 }))}
      opcoes={OPCOES}
      roteamento={{ ...ROTEAMENTO_PADRAO, ...(ws.config_provedores ?? {}) }}
      limiteMensal={Number(ws.limite_custo_mensal)}
      workspace={ws.nome}
      simulador={simuladorPermitido()}
      membros={membros.map((m) => ({ nome: m.nome, email: m.email, papel: m.papel }))}
      auditoria={auditoria.map((a) => ({ ator: a.ator, acao: a.acao, alvo: a.alvo, quando: new Date(a.criado_em).toISOString() }))}
    />
  );
}
