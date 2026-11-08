import { sql } from "./db";
import { urlAssinada } from "./storage";
import { custoProjeto, situacaoConsentimento } from "./pipeline/guardas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = Record<string, any>;

export async function statusProjeto(projetoId: string, comCustos = true) {
  const [p] = await sql<Q[]>`
    select p.*, m.nome as marca_nome, pr.nome as produto_nome, a.nome as ator_nome, a.tipo as ator_tipo, a.foto_url as ator_foto
    from projetos p join marcas m on m.id = p.marca_id join produtos pr on pr.id = p.produto_id join atores a on a.id = p.ator_id
    where p.id = ${projetoId}`;
  const variacoes = await sql<Q[]>`select * from variacoes where projeto_id = ${projetoId} order by letra`;
  const cenas = await sql<Q[]>`select c.* from cenas c join variacoes v on v.id = c.variacao_id where v.projeto_id = ${projetoId} order by c.ordem`;
  const jobs = await sql<Q[]>`select id, variacao_id, cena_id, etapa, provedor, estado, progresso, tentativa, erro, custo_real, iniciado_em, concluido_em, criado_em
    from jobs where projeto_id = ${projetoId} order by criado_em`;
  const qas = await sql<Q[]>`select distinct on (variacao_id) * from avaliacoes_qa where variacao_id in (select id from variacoes where projeto_id = ${projetoId}) order by variacao_id, criado_em desc`;
  const custoPorEtapa = comCustos
    ? await sql<Q[]>`select etapa, sum(valor_brl)::float as brl, bool_or(unidade like '%simulado%') as simulado from custos where projeto_id = ${projetoId} group by etapa`
    : [];
  const registro = await sql<Q[]>`select ator, acao, dados, criado_em from auditoria where projeto_id = ${projetoId} order by criado_em desc limit 60`;

  // Resumo por etapa (tela 4): quantas variações concluíram cada etapa.
  const etapas = ["narracao", "imagem", "lipsync", "broll", "montagem", "qa"] as const;
  const resumo = etapas.map((e) => {
    const js = jobs.filter((j) => j.etapa === e);
    const porVar = new Map<string, (typeof js)[number]>();
    for (const j of js) porVar.set(`${j.variacao_id}:${j.cena_id ?? ""}`, j);
    const ultimos = [...porVar.values()];
    const concluidos = variacoes.filter((v) => {
      if (e === "narracao") return !!v.audio_url;
      if (e === "imagem") return cenas.some((c) => c.variacao_id === v.id && c.tipo === "imagem" && c.midia_url);
      if (e === "lipsync") return cenas.some((c) => c.variacao_id === v.id && c.tipo === "fala" && c.midia_url);
      if (e === "broll") return cenas.filter((c) => c.variacao_id === v.id && c.tipo === "broll").every((c) => c.midia_url) && cenas.some((c) => c.variacao_id === v.id && c.tipo === "broll");
      if (e === "montagem") return !!v.video_final_url;
      return v.nota_qa != null;
    }).length;
    const ativos = ultimos.filter((j) => ["na_fila", "gerando"].includes(j.estado));
    const gerando = ultimos.filter((j) => j.estado === "gerando");
    const progresso = gerando.length ? Math.round(gerando.reduce((s, j) => s + j.progresso, 0) / gerando.length) : 0;
    const falhas = js.filter((j) => j.estado === "falha").length;
    const provedores = [...new Set(js.map((j) => j.provedor).filter(Boolean))];
    return { etapa: e, concluidos, total: variacoes.length, ativos: ativos.length, gerando: gerando.length, progresso, falhas, provedores };
  });

  return {
    projeto: { ...p, ator_foto: urlAssinada(p.ator_foto), token_aprovacao: comCustos ? p.token_aprovacao : undefined } as Q,
    consentimento: await situacaoConsentimento(p.ator_id),
    variacoes: variacoes.map((v) => ({
      ...v,
      video: urlAssinada(v.video_final_url),
      audio: urlAssinada(v.audio_url),
      qa: qas.find((q) => q.variacao_id === v.id) ?? null,
      cenas: cenas.filter((c) => c.variacao_id === v.id).map((c) => ({ ...c, midia: urlAssinada(c.midia_url) }) as Q),
    }) as Q),
    jobs: comCustos ? jobs : [],
    resumo,
    custo: comCustos ? { total: await custoProjeto(projetoId), porEtapa: custoPorEtapa, limite: Number(p.limite_custo) } : null,
    registro: comCustos ? registro : [],
  };
}
export type StatusProjeto = Awaited<ReturnType<typeof statusProjeto>>;

export async function painel(workspaceId: string) {
  const [k] = await sql`
    select
      (select count(*) from variacoes v join projetos p on p.id = v.projeto_id where p.workspace_id = ${workspaceId}
         and v.estado in ('aprovado') and p.atualizado_em >= date_trunc('month', now()))::int as entregues,
      (select count(*) from variacoes v join projetos p on p.id = v.projeto_id where p.workspace_id = ${workspaceId}
         and v.estado in ('aprovado') and p.atualizado_em >= date_trunc('month', now()) - interval '1 month' and p.atualizado_em < date_trunc('month', now()))::int as entregues_ant,
      (select count(*) from projetos where workspace_id = ${workspaceId} and estado in ('em_producao','em_qa','pausado_custo'))::int as em_producao,
      (select count(*) from projetos where workspace_id = ${workspaceId} and estado = 'aguardando_revisao')::int as aguardando,
      (select coalesce(sum(valor_brl),0)::float from custos where workspace_id = ${workspaceId} and data >= date_trunc('month', now())) as custo_mes,
      (select count(*) from variacoes v join projetos p on p.id = v.projeto_id where p.workspace_id = ${workspaceId} and v.video_final_url is not null)::int as videos`;
  // Aprovação na 1ª versão: variações aprovadas sem nenhum pedido de ajuste.
  const [ap] = await sql`
    select count(*) filter (where not exists (select 1 from revisoes r where r.variacao_id = v.id and r.acao = 'ajuste'))::float / nullif(count(*),0) as taxa
    from variacoes v join projetos p on p.id = v.projeto_id
    where p.workspace_id = ${workspaceId} and v.estado in ('aprovado','reprovado')`;
  const projetos = await sql<Q[]>`
    select p.id, p.titulo, p.formato, p.duracao_s, p.n_variacoes, p.estado, p.atualizado_em, m.nome as marca,
      pr.nome as produto, a.nome as ator, a.foto_url as ator_foto,
      (select coalesce(sum(valor_brl),0)::float from custos c where c.projeto_id = p.id) as custo,
      (select count(distinct (j.variacao_id, j.etapa)) from jobs j where j.projeto_id = p.id and j.estado = 'concluido')::int as etapas_ok,
      (select count(*) from variacoes v where v.projeto_id = p.id and v.estado = 'falha')::int as falhas,
      (select count(*) from variacoes v where v.projeto_id = p.id and v.estado = 'aprovado')::int as aprovadas,
      (select etapa from jobs j where j.projeto_id = p.id and j.estado = 'falha' order by criado_em desc limit 1) as etapa_falha
    from projetos p join marcas m on m.id = p.marca_id join produtos pr on pr.id = p.produto_id join atores a on a.id = p.ator_id
    where p.workspace_id = ${workspaceId}
    order by p.atualizado_em desc limit 30`;
  const [ws] = await sql`select limite_custo_mensal from workspaces where id = ${workspaceId}`;
  const atividade = await sql<Q[]>`
    select au.dados->>'mensagem' as mensagem, au.criado_em, p.titulo, p.id as projeto_id
    from auditoria au left join projetos p on p.id = au.projeto_id
    where au.workspace_id = ${workspaceId} and au.ator = 'agente' and au.dados ? 'mensagem'
    order by au.criado_em desc limit 8`;
  const custoMedio = k.videos ? k.custo_mes / Math.max(1, k.videos) : 0;
  return {
    entregues: Number(k.entregues), entregues_ant: Number(k.entregues_ant), em_producao: Number(k.em_producao), aguardando: Number(k.aguardando),
    custo_mes: Number(k.custo_mes), custo_medio: custoMedio, aprovacao_1a: (ap?.taxa as number | null) ?? null,
    limite_mensal: Number(ws?.limite_custo_mensal ?? 0),
    projetos: projetos.map((p) => ({
      ...p,
      ator_foto: urlAssinada(p.ator_foto),
      // 6 etapas por variação: narração, imagem, lip-sync, B-roll, montagem, QA
      progresso: Math.min(99, Math.round((Number(p.etapas_ok) / Math.max(1, Number(p.n_variacoes) * 6)) * 100)),
    })) as Q[],
    atividade,
  };
}
