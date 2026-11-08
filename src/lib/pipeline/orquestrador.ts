/**
 * Orquestração do pipeline (seção 4). Cada etapa é um job independente na fila,
 * com entrada e saída gravadas no banco. O estado de cada variação é derivado
 * dos artefatos já produzidos: `avancar()` olha o que existe e enfileira o que
 * está pronto para rodar — por isso etapas independentes (B-roll e lip-sync)
 * rodam em paralelo e uma refação só zera o que precisa ser refeito.
 */
import { sql, auditar } from "../db";
import { existe, local } from "../storage";
import { loudness, probe } from "../ffmpeg";
import { enfileirarConsulta, enfileirarEtapa } from "../fila";
import { imagem as provImagem, obterChave, resolver, roteamento, tts, video } from "../providers";
import { OPCOES, PRECOS } from "../providers/catalogo";
import { ErroProvedor } from "../providers/types";
import { falaCompleta, type Roteiro } from "../agent/roteiro";
import { avaliarVisual, LIMITES } from "../agent/qa";
import { extrairQuadros, montar } from "./montagem";
import { checarConsentimento, checarCusto, registrarCusto } from "./guardas";
import { notificar } from "../notificar";

const ATIVOS = ["na_fila", "gerando", "aguardando_aprovacao"];
const MAX_TENTATIVAS = 4; // 2 no principal + 2 no alternativo
const NOME_ETAPA: Record<string, string> = {
  narracao: "Narração", imagem: "Imagem-chave", lipsync: "Fala com lip-sync", broll: "B-roll", montagem: "Montagem", qa: "Revisão de qualidade",
};

const log = (ws: string, projetoId: string, mensagem: string, dados: Record<string, unknown> = {}) =>
  auditar(ws, "agente", "decisao", { projetoId, dados: { mensagem, ...dados } });

// ------------------------------------------------------------- planejamento
/** Ferramenta planejar_cenas: roteiro aprovado -> cenas com tipo, duração e prompt. */
export async function planejarCenas(variacaoId: string) {
  const [v] = await sql`select v.*, p.workspace_id from variacoes v join projetos p on p.id = v.projeto_id where v.id = ${variacaoId}`;
  const r = v.roteiro as Roteiro;
  await sql`delete from cenas where variacao_id = ${variacaoId}`;
  let ordem = 1;
  await sql`insert into cenas (workspace_id, variacao_id, ordem, tipo, inicio_s, fim_s, prompt)
    values (${v.workspace_id}, ${variacaoId}, ${ordem++}, 'imagem', 0, 0, ${r.cenario_imagem_chave})`;
  await sql`insert into cenas (workspace_id, variacao_id, ordem, tipo, inicio_s, fim_s, prompt, texto)
    values (${v.workspace_id}, ${variacaoId}, ${ordem++}, 'fala', 0, ${r.duracao_s}, 'pessoa falando para a câmera', ${falaCompleta(r)})`;
  for (const b of r.blocos.filter((b) => b.tipo === "broll")) {
    await sql`insert into cenas (workspace_id, variacao_id, ordem, tipo, inicio_s, fim_s, prompt, texto)
      values (${v.workspace_id}, ${variacaoId}, ${ordem++}, 'broll', ${b.inicio}, ${b.fim}, ${b.prompt_visual || b.cena}, ${b.texto})`;
  }
}

/** POST /projetos/{id}/produzir: aprova roteiros e dispara o pipeline. */
export async function produzir(projetoId: string, ator: string) {
  const [p] = await sql`select * from projetos where id = ${projetoId}`;
  const bloqueio = await checarConsentimento(p.ator_id, p.marca_id);
  if (bloqueio) throw new Error(`Produção bloqueada: ${bloqueio}`);
  const vars = await sql`select id, letra from variacoes where projeto_id = ${projetoId} order by letra`;
  for (const v of vars) {
    await planejarCenas(v.id);
    await sql`update variacoes set estado = 'em_producao', audio_url = null, video_final_url = null, nota_qa = null where id = ${v.id}`;
  }
  await sql`update projetos set estado = 'em_producao', atualizado_em = now() where id = ${projetoId}`;
  await auditar(p.workspace_id, ator, "aprovou_roteiros", { projetoId, dados: { mensagem: `${ator.replace(/^usuario:/, "")} aprovou os roteiros` } });
  for (const v of vars) await avancar(v.id);
}

// ------------------------------------------------------------- avanço
export async function avancar(variacaoId: string) {
  const novos: { id: string; atraso: number }[] = [];
  let pausar: { ws: string; projetoId: string } | null = null;
  let bloqueado: { ws: string; projetoId: string; letra: string; motivo: string } | null = null;
  let fechar: { ws: string; projetoId: string } | null = null;

  // Guardrails consultados ANTES da transação: dentro dela, uma segunda conexão
  // do pool poderia esperar para sempre pela primeira (pool de 1 no serverless).
  const [base] = await sql`select v.letra, p.id as projeto_id, p.workspace_id, p.ator_id, p.marca_id
    from variacoes v join projetos p on p.id = v.projeto_id where v.id = ${variacaoId}`;
  if (!base) return;
  const motivoBloqueio = await checarConsentimento(base.ator_id, base.marca_id);
  const situacaoCusto = motivoBloqueio ? "ok" : await checarCusto(base.projeto_id);

  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${variacaoId}))`;
    const [v] = await tx`
      select v.*, p.workspace_id, p.estado as estado_projeto, p.ator_id, p.marca_id, p.produto_id
      from variacoes v join projetos p on p.id = v.projeto_id where v.id = ${variacaoId}`;
    if (!v || !["em_producao", "em_qa"].includes(v.estado) || v.estado_projeto === "pausado_custo") return;
    const cenas = await tx`select * from cenas where variacao_id = ${variacaoId} order by ordem`;
    const jobs = await tx`select * from jobs where variacao_id = ${variacaoId} order by criado_em`;
    const [prod] = await tx`select imagens, imagem_recortada_url from produtos where id = ${v.produto_id}`;

    const ativo = (etapa: string, cenaId?: string) => jobs.some((j) => j.etapa === etapa && (!cenaId || j.cena_id === cenaId) && ATIVOS.includes(j.estado));
    const falhasSeguidas = (etapa: string, cenaId?: string) => {
      let n = 0;
      for (const j of jobs.filter((j) => j.etapa === etapa && (!cenaId || j.cena_id === cenaId))) n = j.estado === "falha" ? n + 1 : j.estado === "concluido" ? 0 : n;
      return n;
    };

    const img = cenas.find((c) => c.tipo === "imagem");
    const fala = cenas.find((c) => c.tipo === "fala");
    const brolls = cenas.filter((c) => c.tipo === "broll");
    const baseBroll = prod?.imagem_recortada_url ?? prod?.imagens?.[0] ?? img?.midia_url ?? null;

    const pendentes: { etapa: string; cenaId: string | null }[] = [];
    if (!v.audio_url && !ativo("narracao")) pendentes.push({ etapa: "narracao", cenaId: null });
    if (img && !img.midia_url && !ativo("imagem", img.id)) pendentes.push({ etapa: "imagem", cenaId: img.id });
    for (const b of brolls) if (!b.midia_url && !ativo("broll", b.id) && baseBroll) pendentes.push({ etapa: "broll", cenaId: b.id });
    if (fala && !fala.midia_url && !ativo("lipsync", fala.id) && v.audio_url && img?.midia_url) pendentes.push({ etapa: "lipsync", cenaId: fala.id });
    if (fala?.midia_url && brolls.every((b) => b.midia_url) && !v.video_final_url && !ativo("montagem")) pendentes.push({ etapa: "montagem", cenaId: null });
    if (v.video_final_url && v.nota_qa == null && !ativo("qa")) pendentes.push({ etapa: "qa", cenaId: null });
    if (!pendentes.length) return;

    // Guardrails antes de criar qualquer job.
    if (motivoBloqueio) {
      await tx`update variacoes set estado = 'falha', observacao = ${"Bloqueado: " + motivoBloqueio} where id = ${variacaoId}`;
      bloqueado = { ws: v.workspace_id, projetoId: v.projeto_id, letra: v.letra, motivo: motivoBloqueio };
      return;
    }
    const geraCusto = pendentes.some((p) => !["montagem", "qa"].includes(p.etapa));
    if (geraCusto && situacaoCusto === "pausar") {
      await tx`update projetos set estado = 'pausado_custo' where id = ${v.projeto_id}`;
      pausar = { ws: v.workspace_id, projetoId: v.projeto_id };
      return;
    }

    for (const p of pendentes) {
      const falhas = falhasSeguidas(p.etapa, p.cenaId ?? undefined);
      if (falhas >= MAX_TENTATIVAS) {
        // Se havia uma versão montada antes da refação, ela volta para revisão humana.
        const temAnterior = !!v.video_anterior_url;
        const obs = `${NOME_ETAPA[p.etapa]} falhou ${falhas} vezes na refação${temAnterior ? "; mantida a versão anterior para revisão" : "; escalado ao operador"}`;
        await tx`update variacoes set
            estado = ${temAnterior ? "aguardando_revisao" : "falha"}, observacao = ${obs},
            video_final_url = coalesce(video_final_url, video_anterior_url),
            nota_qa = coalesce(nota_qa, (select nota from avaliacoes_qa a where a.variacao_id = variacoes.id order by criado_em desc limit 1))
          where id = ${variacaoId}`;
        if (temAnterior) fechar = { ws: v.workspace_id, projetoId: v.projeto_id };
        const mensagem = `Variação ${v.letra}: ${NOME_ETAPA[p.etapa]} falhou ${falhas}× (principal e alternativo).${temAnterior ? " Mantive a versão anterior e pedi revisão humana." : " Escalei para o operador."}`;
        await tx`insert into auditoria (workspace_id, projeto_id, ator, acao, dados) values (${v.workspace_id}, ${v.projeto_id}, 'agente', 'decisao', ${tx.json({ mensagem })})`;
        return;
      }
      const [j] = await tx`insert into jobs (workspace_id, projeto_id, variacao_id, cena_id, etapa, tentativa)
        values (${v.workspace_id}, ${v.projeto_id}, ${variacaoId}, ${p.cenaId}, ${p.etapa}, ${falhas + 1}) returning id`;
      novos.push({ id: j.id, atraso: falhas ? 5 * falhas : 0 });
    }
  });

  if (fechar) {
    const f = fechar as { ws: string; projetoId: string };
    await fecharSeTerminou(f.projetoId, f.ws);
  }
  if (bloqueado) {
    const b = bloqueado as { ws: string; projetoId: string; letra: string; motivo: string };
    await auditar(b.ws, "sistema", "bloqueio_consentimento", { projetoId: b.projetoId, dados: { mensagem: `Produção da variação ${b.letra} parada: ${b.motivo}` } });
  }
  if (pausar) {
    const { ws, projetoId } = pausar as { ws: string; projetoId: string };
    const [ja] = await sql`select 1 from auditoria where projeto_id = ${projetoId} and acao = 'pausa_custo' and criado_em > now() - interval '10 minutes'`;
    if (!ja) {
      await auditar(ws, "agente", "pausa_custo", { projetoId, dados: { mensagem: "Limite de custo do projeto atingido. Parei e pedi aprovação para continuar." } });
      await notificar(ws, projetoId, "Produção pausada", "O projeto atingiu o limite de custo e precisa de aprovação para continuar.");
    }
  }
  for (const n of novos) await enfileirarEtapa(n.id, n.atraso);
}

// ------------------------------------------------------------- execução
interface Contexto {
  job: Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any
  p: Record<string, any>;    // eslint-disable-line @typescript-eslint/no-explicit-any
  v: Record<string, any>;    // eslint-disable-line @typescript-eslint/no-explicit-any
  cena: Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  roteiro: Roteiro;
}

async function carregar(jobId: string): Promise<Contexto | null> {
  const [job] = await sql`select * from jobs where id = ${jobId}`;
  if (!job) return null;
  const [p] = await sql`
    select p.*, a.tipo as ator_tipo, a.foto_url as ator_foto, a.voz_id as ator_voz,
           pr.imagens as produto_imagens, pr.imagem_recortada_url as produto_recortada,
           m.logo_url as marca_logo, m.musicas_permitidas
    from projetos p join atores a on a.id = p.ator_id join produtos pr on pr.id = p.produto_id join marcas m on m.id = p.marca_id
    where p.id = ${job.projeto_id}`;
  const [v] = await sql`select * from variacoes where id = ${job.variacao_id}`;
  const [cena] = job.cena_id ? await sql`select * from cenas where id = ${job.cena_id}` : [null];
  return { job, p, v, cena, roteiro: v.roteiro as Roteiro };
}

async function concluir(jobId: string, saida: unknown, provedor?: string) {
  await sql`update jobs set estado = 'concluido', progresso = 100, saida = ${sql.json(saida as never)}, provedor = coalesce(${provedor ?? null}, provedor), concluido_em = now() where id = ${jobId}`;
}

async function falhar(c: Contexto, erro: unknown) {
  const msg = erro instanceof Error ? erro.message : String(erro);
  await sql`update jobs set estado = 'falha', erro = ${msg.slice(0, 2000)}, concluido_em = now() where id = ${c.job.id}`;
  if (erro instanceof ErroProvedor && erro.codigo === "chave_invalida" && c.job.provedor) {
    const op = Object.values(OPCOES).flat().find((o) => o.id === c.job.provedor);
    if (op?.chave) await sql`update chaves_api set status = 'chave_invalida' where workspace_id = ${c.p.workspace_id} and provedor = ${op.chave}`;
  }
  if (erro instanceof ErroProvedor && erro.codigo === "saldo" && c.job.provedor) {
    const op = Object.values(OPCOES).flat().find((o) => o.id === c.job.provedor);
    if (op?.chave) await sql`update chaves_api set status = 'saldo_baixo' where workspace_id = ${c.p.workspace_id} and provedor = ${op.chave}`;
  }
  const prox = c.job.tentativa + 1;
  await log(c.p.workspace_id, c.p.id, `Variação ${c.v.letra}: ${NOME_ETAPA[c.job.etapa]} falhou no ${c.job.provedor ?? "provedor"} (${msg.slice(0, 160)}).` +
    (prox <= MAX_TENTATIVAS ? ` Nova tentativa ${prox}/${MAX_TENTATIVAS}${prox >= 3 ? " no provedor alternativo" : ""}.` : ""));
  await avancar(c.v.id);
}

export async function executarEtapa(jobId: string) {
  const c = await carregar(jobId);
  if (!c || c.job.estado !== "na_fila") return;
  const { job, p, v } = c;
  const bloqueio = await checarConsentimento(p.ator_id, p.marca_id);
  if (bloqueio) {
    await sql`update jobs set estado = 'cancelado', erro = ${bloqueio} where id = ${jobId}`;
    await avancar(v.id); // registra o bloqueio na variação
    return;
  }
  await sql`update jobs set estado = 'gerando', progresso = 5, iniciado_em = now() where id = ${jobId}`;
  const ctxBase = { workspaceId: p.workspace_id, projetoId: p.id };

  try {
    switch (job.etapa) {
      case "narracao": {
        const r = await resolver(p.workspace_id, "narracao", job.tentativa);
        await sql`update jobs set provedor = ${r.opcaoId} where id = ${jobId}`;
        const texto = falaCompleta(c.roteiro);
        const res = await tts(r.opcaoId).gerarNarracao({ texto, vozId: p.voz_id ?? p.ator_voz, ritmo: p.voz_ritmo }, { ...ctxBase, apiKey: r.apiKey });
        await registrarCusto({ ...ctxBase, jobId, etapa: "narracao", provedor: r.opcaoId, unidade: res.unidade, quantidade: res.quantidade, usd: res.custoUsd });
        await sql`update variacoes set audio_url = ${res.chave} where id = ${v.id}`;
        await concluir(jobId, { audio: res.chave, duracao: res.duracaoS, motivo: r.motivo }, r.opcaoId);
        await log(p.workspace_id, p.id, `Narração da variação ${v.letra} pronta (${r.opcaoId}, ${res.duracaoS?.toFixed(1)} s).`);
        break;
      }
      case "imagem": {
        const r = await resolver(p.workspace_id, "imagem", job.tentativa, c.cena?.forcar_provedor ?? undefined);
        await sql`update jobs set provedor = ${r.opcaoId} where id = ${jobId}`;
        const fotoProduto = p.produto_recortada ?? p.produto_imagens?.[0] ?? null;
        const res = await provImagem(r.opcaoId).gerarImagemChave(
          { fotoAtor: p.ator_foto, fotosProduto: fotoProduto ? [fotoProduto] : [], cena: c.cena?.prompt ?? c.roteiro.cenario_imagem_chave, formato: p.formato },
          { ...ctxBase, apiKey: r.apiKey },
        );
        await registrarCusto({ ...ctxBase, jobId, etapa: "imagem", provedor: r.opcaoId, unidade: res.unidade, quantidade: res.quantidade, usd: res.custoUsd });
        await sql`update cenas set midia_url = ${res.chave} where id = ${job.cena_id}`;
        await concluir(jobId, { imagem: res.chave }, r.opcaoId);
        await log(p.workspace_id, p.id, `Imagem-chave da variação ${v.letra} pronta (${r.opcaoId}).`);
        break;
      }
      case "lipsync":
      case "broll": {
        const etapa = job.etapa as "lipsync" | "broll";
        const r = await resolver(p.workspace_id, etapa, job.tentativa, c.cena?.forcar_provedor ?? undefined);
        const impl = video(r.opcaoId);
        const ctx = { ...ctxBase, apiKey: r.apiKey };
        let ref: { jobExternoId: string };
        if (etapa === "lipsync") {
          const [img] = await sql`select midia_url from cenas where variacao_id = ${v.id} and tipo = 'imagem'`;
          const { duracao } = await probe(await local(v.audio_url));
          ref = await impl.gerarFala!({ imagem: img.midia_url, audio: v.audio_url, resolucao: p.qualidade, duracaoS: duracao, formato: p.formato }, ctx);
        } else {
          const [img] = await sql`select midia_url from cenas where variacao_id = ${v.id} and tipo = 'imagem'`;
          const base = p.produto_recortada ?? p.produto_imagens?.[0] ?? img?.midia_url;
          const dur = Math.max(5, Number(c.cena!.fim_s) - Number(c.cena!.inicio_s));
          ref = await impl.gerarBroll!({ imagem: base, prompt: c.cena!.prompt, duracaoS: dur, resolucao: p.qualidade, formato: p.formato }, ctx);
        }
        await sql`update jobs set provedor = ${r.opcaoId}, job_externo_id = ${ref.jobExternoId}, progresso = 10,
          entrada = ${sql.json({ motivo: r.motivo } as never)} where id = ${jobId}`;
        await enfileirarConsulta(jobId, r.simulado ? 2 : 10);
        if (job.tentativa >= 3) await log(p.workspace_id, p.id, `Variação ${v.letra}: ${NOME_ETAPA[etapa]} no provedor alternativo (${r.opcaoId}).`);
        break;
      }
      case "montagem": {
        await executarMontagem(c);
        break;
      }
      case "qa": {
        await executarQA(c);
        break;
      }
    }
    if (!["lipsync", "broll"].includes(job.etapa)) await avancar(v.id);
  } catch (e) {
    console.error(`[job ${jobId}]`, e);
    await falhar({ ...c, job: { ...c.job, provedor: (await sql`select provedor from jobs where id = ${jobId}`)[0]?.provedor } }, e);
  }
}

export async function consultarJob(jobId: string) {
  const c = await carregar(jobId);
  if (!c || c.job.estado !== "gerando" || !c.job.job_externo_id) return;
  const { job, p, v } = c;
  const op = OPCOES[job.etapa as "lipsync" | "broll"].find((o) => o.id === job.provedor);
  const apiKey = op?.chave ? await obterChave(p.workspace_id, op.chave) : null;
  try {
    const st = await video(job.provedor).consultar(job.job_externo_id, { workspaceId: p.workspace_id, projetoId: p.id, apiKey });
    if (st.status === "gerando") {
      const minutos = (Date.now() - new Date(job.iniciado_em).getTime()) / 60000;
      if (minutos > 20) throw new ErroProvedor("tempo limite de 20 min excedido", "temporario");
      await sql`update jobs set progresso = ${Math.max(job.progresso, st.progresso)} where id = ${jobId}`;
      await enfileirarConsulta(jobId, job.provedor === "simulador" ? 2 : 10);
      return;
    }
    if (st.status === "falha") throw new ErroProvedor(st.erro, "desconhecido");
    await registrarCusto({ workspaceId: p.workspace_id, projetoId: p.id, jobId, etapa: job.etapa, provedor: job.provedor, unidade: st.uso.unidade, quantidade: st.uso.quantidade, usd: st.uso.custoUsd });
    await sql`update cenas set midia_url = ${st.chave} where id = ${job.cena_id}`;
    await concluir(jobId, { video: st.chave, duracao: st.duracaoS });
    await log(p.workspace_id, p.id, `${NOME_ETAPA[job.etapa]} da variação ${v.letra} pronto (${job.provedor}, ${st.duracaoS.toFixed(1)} s).`);
    await avancar(v.id);
  } catch (e) {
    await falhar(c, e);
  }
}

// ------------------------------------------------------------- montagem e QA
async function executarMontagem(c: Contexto) {
  const { job, p, v } = c;
  const cenas = await sql`select * from cenas where variacao_id = ${v.id} order by ordem`;
  const fala = cenas.find((x) => x.tipo === "fala")!;
  let musica: string | null = null;
  const musicas = (p.musicas_permitidas as string[]) ?? [];
  if (v.musica !== "sem_musica" && musicas.length) {
    musica = v.musica === "calma" ? musicas.find((m) => /calm|suave|lofi/i.test(m)) ?? musicas[0] : v.musica === "animada" ? musicas.find((m) => /anim|upbeat|pop/i.test(m)) ?? musicas[0] : musicas[0];
  }
  const res = await montar({
    workspaceId: p.workspace_id,
    projetoId: p.id,
    formato: p.formato,
    qualidade: p.qualidade,
    roteiro: c.roteiro,
    fala: fala.midia_url,
    brolls: cenas.filter((x) => x.tipo === "broll").map((b) => ({ chave: b.midia_url, inicio: Number(b.inicio_s), fim: Number(b.fim_s) })),
    logo: p.marca_logo,
    musica,
    marcaIA: true,
  });
  await registrarCusto({ workspaceId: p.workspace_id, projetoId: p.id, jobId: job.id, etapa: "montagem", provedor: "interno", unidade: "vídeo", quantidade: 1, usd: PRECOS.montagemPorVideo });
  await sql`update variacoes set video_final_url = ${res.chave}, legendas_srt = ${res.srt}, nota_qa = null where id = ${v.id}`;
  await concluir(job.id, { video: res.chave, srt: res.srtChave, duracao: res.duracao }, "ffmpeg");
  await log(p.workspace_id, p.id, `Montagem da variação ${v.letra} pronta (${res.duracao.toFixed(1)} s, legendas e selo "gerado por IA").`);
}

async function executarQA(c: Contexto) {
  const { job, p, v } = c;
  await sql`update variacoes set estado = 'em_qa' where id = ${v.id}`;
  const arquivo = await local(v.video_final_url);
  const info = await probe(arquivo);
  const lufs = await loudness(arquivo).catch(() => null);
  const quadros = await extrairQuadros(p.workspace_id, p.id, v.video_final_url, 8);
  const fotoProduto = p.produto_recortada ?? p.produto_imagens?.[0] ?? null;
  const visual = await avaliarVisual({
    workspaceId: p.workspace_id,
    projetoId: p.id,
    quadros,
    fotoAtor: p.ator_foto && (await existe(p.ator_foto)) ? p.ator_foto : null,
    fotoProduto: fotoProduto && (await existe(fotoProduto)) ? fotoProduto : null,
    roteiro: c.roteiro,
  });

  // Checagens automáticas complementares (seção 6.4)
  const esperado = p.formato === "9:16" ? 9 / 16 : p.formato === "1:1" ? 1 : 16 / 9;
  const prop = info.largura && info.altura ? info.largura / info.altura : 0;
  const palavrasSrt = (v.legendas_srt as string).split("\n").filter((l) => l && !/^\d+$/.test(l) && !l.includes("-->")).join(" ").split(/\s+/).filter(Boolean);
  const palavrasFala = falaCompleta(c.roteiro).split(/\s+/).filter(Boolean);
  const checagens = {
    duracao: { valor: info.duracao, alvo: p.duracao_s, ok: Math.abs(info.duracao - p.duracao_s) / p.duracao_s <= 0.25 },
    loudness: { valor: lufs, alvo: -14, ok: lufs == null || Math.abs(lufs + 14) <= 3 },
    resolucao: { valor: `${info.largura}x${info.altura}`, ok: !!info.altura && info.altura >= 480 },
    proporcao: { valor: prop.toFixed(3), alvo: esperado.toFixed(3), ok: Math.abs(prop - esperado) < 0.02 },
    legenda_vs_fala: { valor: `${palavrasSrt.length}/${palavrasFala.length} palavras`, ok: palavrasSrt.join(" ") === palavrasFala.join(" ") },
  };
  const crit = { ...visual.qa.criterios };
  if (!checagens.legenda_vs_fala.ok) crit.legenda = Math.min(crit.legenda, 5);
  const nota = Math.round(((crit.rosto + crit.maos + crit.produto + crit.sincronia + crit.legenda) / 5) * 10) / 10;

  // Decisão pela tabela de critérios
  const cenas = await sql`select * from cenas where variacao_id = ${v.id} order by ordem`;
  const img = cenas.find((x) => x.tipo === "imagem")!;
  const fala = cenas.find((x) => x.tipo === "fala")!;
  const k = info.duracao / c.roteiro.duracao_s;
  const refazer = new Map<string, { cena: Record<string, unknown>; motivo: string; forcar?: string }>();
  const pode = (cena: Record<string, unknown>) => Number(cena.tentativas) < 2;
  const escalados: string[] = [];
  const marcar = (cena: Record<string, any>, motivo: string, forcar?: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (pode(cena)) refazer.set(cena.id, { cena, motivo, forcar });
    else escalados.push(motivo);
  };
  if (crit.rosto < LIMITES.rosto) { marcar(img, "rosto diferente do ator"); marcar(fala, "rosto diferente do ator"); }
  if (crit.produto < LIMITES.produto) { marcar(img, "produto/rótulo"); marcar(fala, "produto/rótulo"); }
  if (crit.maos < LIMITES.maos) {
    const d = visual.qa.defeitos.find((x) => x.criterio === "maos");
    const t = d?.tempo_s ?? 0;
    const broll = cenas.find((x) => x.tipo === "broll" && t >= Number(x.inicio_s) * k && t <= Number(x.fim_s) * k);
    if (broll) marcar(broll, `mãos no B-roll em ${t.toFixed(0)} s`);
    else { marcar(img, `mãos em ${t.toFixed(0)} s`); marcar(fala, `mãos em ${t.toFixed(0)} s`); }
  }
  if (crit.sincronia < LIMITES.sincronia) {
    const alt = (await roteamento(p.workspace_id)).lipsync.alternativo;
    marcar(fala, "sincronia labial", fala.tentativas >= 1 ? alt : undefined);
  }
  const soRemontar = crit.legenda < LIMITES.legenda && refazer.size === 0;

  const decisao = refazer.size ? "refazer" : soRemontar ? "remontar" : escalados.length ? "escalado" : "aprovado_qa";
  await sql`insert into avaliacoes_qa (workspace_id, variacao_id, criterios, defeitos, checagens, nota, decisao)
    values (${p.workspace_id}, ${v.id}, ${sql.json(crit)}, ${sql.json(visual.qa.defeitos as never)}, ${sql.json({ ...checagens, resumo: visual.qa.resumo, simulado: visual.simulado } as never)}, ${nota}, ${decisao})`;
  await concluir(job.id, { nota, decisao, criterios: crit }, visual.simulado ? "simulador" : "anthropic");

  if (refazer.size) {
    const ids = [...refazer.keys()];
    for (const [id, r] of refazer) {
      await sql`update cenas set midia_url = null, tentativas = tentativas + 1, forcar_provedor = ${r.forcar ?? null} where id = ${id}`;
    }
    await sql`update variacoes set video_anterior_url = video_final_url, video_final_url = null, nota_qa = null, estado = 'em_producao' where id = ${v.id}`;
    const nomes = [...refazer.values()].map((r) => `${(r.cena as { tipo: string }).tipo} (${r.motivo})`);
    await log(p.workspace_id, p.id, `QA da variação ${v.letra}: nota ${nota}. Refazendo só ${nomes.join(", ")}.`, { cenas: ids });
  } else if (soRemontar) {
    await sql`update variacoes set video_anterior_url = video_final_url, video_final_url = null, nota_qa = null, estado = 'em_producao' where id = ${v.id}`;
    await log(p.workspace_id, p.id, `QA da variação ${v.letra}: legendas abaixo do limite. Remontando (sem custo de geração).`);
  } else {
    const obs = escalados.length ? `Limite de refações atingido (${escalados.join(", ")}); revisar manualmente.` : null;
    await sql`update variacoes set nota_qa = ${nota}, estado = 'aguardando_revisao', observacao = ${obs} where id = ${v.id}`;
    await log(p.workspace_id, p.id, `QA da variação ${v.letra}: nota ${nota}/10${visual.simulado ? " (visual simulado)" : ""}.${obs ? " " + obs : ""}`);
    await fecharSeTerminou(p.id, p.workspace_id);
  }
}

export async function fecharSeTerminou(projetoId: string, ws: string) {
  const vars = await sql`select estado from variacoes where projeto_id = ${projetoId}`;
  const prontas = vars.every((x) => ["aguardando_revisao", "aprovado", "reprovado", "falha"].includes(x.estado));
  if (!prontas) return;
  const [p] = await sql`update projetos set estado = 'aguardando_revisao', atualizado_em = now() where id = ${projetoId} and estado in ('em_producao','em_qa','ajuste') returning titulo`;
  if (p) await notificar(ws, projetoId, `Vídeos prontos: ${p.titulo}`, `${vars.length} variação(ões) prontas para revisão.`);
}
