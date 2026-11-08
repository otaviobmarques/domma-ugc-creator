import { sql, auditar } from "../db";
import { gerarRoteiros, verificar, type ContextoBriefing } from "../agent/roteiro";
import { estimarVariacaoUsd, cambio } from "../providers/catalogo";
import { roteamento } from "../providers";

export async function contextoBriefing(projetoId: string): Promise<ContextoBriefing> {
  const [p] = await sql`
    select p.*, pr.nome as produto_nome, pr.descricao as produto_descricao, pr.preco as produto_preco,
           m.nome as marca_nome, m.diretrizes, m.termos_vetados, a.nome as ator_nome, a.tipo as ator_tipo, a.descricao as ator_descricao
    from projetos p join produtos pr on pr.id = p.produto_id join marcas m on m.id = p.marca_id join atores a on a.id = p.ator_id
    where p.id = ${projetoId}`;
  return {
    workspaceId: p.workspace_id,
    projetoId,
    produto: { nome: p.produto_nome, descricao: p.produto_descricao, preco: p.produto_preco },
    marca: { nome: p.marca_nome, diretrizes: p.diretrizes, termos_vetados: p.termos_vetados },
    ator: { nome: p.ator_nome, tipo: p.ator_tipo, descricao: p.ator_descricao },
    objetivo: p.objetivo,
    publico: p.publico,
    tom: p.tom,
    duracao_s: p.duracao_s,
    formato: p.formato,
    n_variacoes: p.n_variacoes,
  };
}

/** RF-04: custo estimado em R$ antes de iniciar. */
export async function estimarProjeto(workspaceId: string, p: { duracao_s: number; qualidade: string; n_variacoes: number }) {
  const r = await roteamento(workspaceId);
  const { min, max } = estimarVariacaoUsd({ duracaoS: p.duracao_s, qualidade: p.qualidade, roteamento: r });
  const c = cambio();
  return { min: Math.round(min * p.n_variacoes * c), max: Math.round(max * p.n_variacoes * c) };
}

/** POST /projetos/{id}/roteiros: pede ao agente as variações. */
export async function gerarVariacoes(projetoId: string, ator: string) {
  const ctx = await contextoBriefing(projetoId);
  const { roteiros, simulado } = await gerarRoteiros(ctx);
  await sql`delete from variacoes where projeto_id = ${projetoId}`;
  for (const r of roteiros) {
    const ver = verificar(r, ctx.marca.termos_vetados, ctx.ator.tipo === "sintetico");
    await sql`insert into variacoes (workspace_id, projeto_id, letra, angulo, roteiro, verificacao)
      values (${ctx.workspaceId}, ${projetoId}, ${r.variacao}, ${r.angulo}, ${sql.json(r as never)}, ${sql.json(ver as never)})`;
  }
  await sql`update projetos set estado = 'roteiro_gerado', atualizado_em = now() where id = ${projetoId}`;
  await auditar(ctx.workspaceId, "agente", "decisao", {
    projetoId,
    dados: { mensagem: `Escrevi ${roteiros.length} variações de roteiro${simulado ? " (simulador, sem chave do Claude)" : ""}.`, pedido_por: ator },
  });
}
