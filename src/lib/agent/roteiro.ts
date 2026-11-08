import * as z from "zod/v4";
import { chamarJSON, clienteClaude } from "./claude";
import { NOME_ANGULO } from "./nomes";

export const ANGULOS = ["depoimento", "pergunta", "confissao", "antes_depois", "polemica_leve", "oferta"] as const;
export { NOME_ANGULO };

export const BlocoSchema = z.object({
  tipo: z.enum(["gancho", "demonstracao", "broll", "prova", "cta"]),
  inicio: z.number(),
  fim: z.number(),
  cena: z.string().describe("fala_frontal | produto_na_mao | produto_close | uso_do_produto | resultado"),
  enquadramento: z.string().describe("ex.: câmera frontal, atriz segura o produto, close do produto"),
  texto: z.string().describe("texto falado neste bloco; vazio se não houver fala"),
  prompt_visual: z.string().describe("para B-roll: descrição da cena a gerar; vazio nos demais"),
});
export type Bloco = z.infer<typeof BlocoSchema>;

export const RoteiroSchema = z.object({
  variacao: z.string(),
  angulo: z.string(),
  titulo: z.string(),
  duracao_s: z.number(),
  cenario_imagem_chave: z.string().describe("cenário da imagem-chave: onde a pessoa está e como segura o produto"),
  blocos: z.array(BlocoSchema),
  alertas: z.array(z.string()).describe("riscos de linguagem identificados pelo próprio agente"),
});
export type Roteiro = z.infer<typeof RoteiroSchema>;

const LoteSchema = z.object({ variacoes: z.array(RoteiroSchema) });

export interface ContextoBriefing {
  workspaceId: string;
  projetoId: string;
  produto: { nome: string; descricao: string; preco: string | null };
  marca: { nome: string; diretrizes: string; termos_vetados: string[] };
  ator: { nome: string; tipo: "real" | "sintetico"; descricao: string };
  objetivo: string;
  publico: string;
  tom: string;
  duracao_s: number;
  formato: string;
  n_variacoes: number;
}

const SYSTEM = `Você é o roteirista e diretor de um estúdio de vídeos UGC (conteúdo com cara de "gravado por um cliente real")
para anúncios de Meta Ads e TikTok, em português do Brasil.

Escreva roteiros curtos, naturais e falados — frases de quem conversa com a câmera, sem jargão publicitário.
Cada roteiro tem blocos com tempo de início e fim (em segundos, contínuos, começando em 0 e terminando na duração pedida):
- gancho (0 a 3 s): prende a atenção nos primeiros segundos;
- demonstracao: a pessoa mostra e usa o produto;
- broll: cena gerada do produto em uso (sem rosto falando). Preencha prompt_visual com uma descrição visual concreta
  (objeto, ação, luz, ambiente). O texto do broll pode continuar a narração em off ou ficar vazio;
- prova: benefício concreto ou prova social plausível;
- cta: chamada para ação curta.
Inclua pelo menos um bloco de broll de 5 s.

Ritmo de fala: no máximo 2,6 palavras por segundo de fala. Conte as palavras.

Regras que nunca podem ser quebradas:
- Sem promessas de resultado garantido, ganhos garantidos, alegações de saúde sem base ou "100%".
- Sem citar concorrentes pelo nome.
- Nunca use termos vetados pela marca.
- Se o ator for sintético, ele não pode se apresentar como cliente real ("sou cliente de verdade", "depoimento real");
  use falas de experiência sem afirmar que é um cliente verificado.
Liste em "alertas" qualquer trecho que mereça revisão humana (ou deixe vazio).`;

function descreverBriefing(c: ContextoBriefing) {
  return `Produto: ${c.produto.nome}${c.produto.preco ? ` (preço: ${c.produto.preco})` : ""}
Descrição: ${c.produto.descricao || "(sem descrição)"}
Marca: ${c.marca.nome}
Diretrizes da marca: ${c.marca.diretrizes || "(nenhuma)"}
Termos vetados: ${c.marca.termos_vetados.join(", ") || "(nenhum)"}
Ator: ${c.ator.nome} — ${c.ator.tipo === "real" ? "pessoa real com autorização" : "ator sintético"}. ${c.ator.descricao}
Objetivo do vídeo: ${c.objetivo}
Público e tom: ${c.publico} / ${c.tom}
Duração: ${c.duracao_s} s · Formato: ${c.formato}`;
}

export async function gerarRoteiros(c: ContextoBriefing): Promise<{ roteiros: Roteiro[]; simulado: boolean }> {
  const angulos = escolherAngulos(c.objetivo, c.n_variacoes);
  const client = await clienteClaude(c.workspaceId);
  if (!client) return { roteiros: angulos.map((a, i) => roteiroSimulado(c, a, letra(i))), simulado: true };
  const lote = await chamarJSON({
    client,
    workspaceId: c.workspaceId,
    projetoId: c.projetoId,
    etapa: "roteiro",
    system: SYSTEM,
    effort: "medium",
    schema: LoteSchema,
    conteudo: [
      {
        type: "text",
        text: `${descreverBriefing(c)}

Escreva ${c.n_variacoes} variações, cada uma com um ângulo de gancho diferente, nesta ordem:
${angulos.map((a, i) => `${letra(i)}: ${NOME_ANGULO[a]} (angulo = "${a}")`).join("\n")}`,
      },
    ],
  });
  return { roteiros: lote.variacoes.slice(0, c.n_variacoes).map((r, i) => normalizar({ ...r, variacao: letra(i) }, c.duracao_s)), simulado: false };
}

/** RF-13: regerar uma variação inteira ou um bloco com instrução em linguagem natural. */
export async function regerar(c: ContextoBriefing, atual: Roteiro, instrucao: string, blocoIndex?: number): Promise<{ roteiro: Roteiro; simulado: boolean }> {
  const client = await clienteClaude(c.workspaceId);
  if (!client) {
    const r = structuredClone(atual);
    if (blocoIndex != null && r.blocos[blocoIndex]) r.blocos[blocoIndex].texto = `${r.blocos[blocoIndex].texto} (ajustado: ${instrucao})`.trim();
    else r.alertas = [...r.alertas, `Ajuste simulado: ${instrucao}`];
    return { roteiro: r, simulado: true };
  }
  const alvo = blocoIndex != null ? `Reescreva SOMENTE o bloco ${blocoIndex} (${atual.blocos[blocoIndex]?.tipo}); mantenha os demais idênticos.` : "Reescreva a variação inteira mantendo o ângulo.";
  const r = await chamarJSON({
    client,
    workspaceId: c.workspaceId,
    projetoId: c.projetoId,
    etapa: "roteiro",
    system: SYSTEM,
    effort: "low",
    schema: RoteiroSchema,
    conteudo: [
      {
        type: "text",
        text: `${descreverBriefing(c)}

Roteiro atual (JSON):
${JSON.stringify(atual)}

${alvo}
Instrução do produtor: ${instrucao}`,
      },
    ],
  });
  return { roteiro: normalizar({ ...r, variacao: atual.variacao }, c.duracao_s), simulado: false };
}

export function letra(i: number) {
  return String.fromCharCode(65 + i);
}

function escolherAngulos(objetivo: string, n: number) {
  const base: string[] = [...ANGULOS];
  const pref = objetivo.toLowerCase().includes("oferta") ? "oferta" : objetivo.toLowerCase().includes("problema") ? "antes_depois" : "depoimento";
  const ordem = [pref, ...base.filter((a) => a !== pref)];
  return ordem.slice(0, n);
}

/** Garante blocos contínuos de 0 até a duração e números finitos. */
export function normalizar(r: Roteiro, duracao: number): Roteiro {
  const blocos = [...r.blocos].sort((a, b) => a.inicio - b.inicio);
  const fimOriginal = blocos.at(-1)?.fim || duracao;
  const k = duracao / fimOriginal;
  let t = 0;
  const out = blocos.map((b, i) => {
    const fim = i === blocos.length - 1 ? duracao : Math.round(b.fim * k * 10) / 10;
    const nb = { ...b, inicio: t, fim: Math.max(fim, t + 1) };
    t = nb.fim;
    return nb;
  });
  return { ...r, duracao_s: duracao, blocos: out };
}

// ------------------------------------------------------- verificação (RF-12)
const PROIBIDAS_GERAIS = [
  "garantido", "garantida", "garantia de resultado", "100%", "cura ", "curar", "curou", "milagre", "milagroso",
  "sem efeitos colaterais", "emagreça", "perca peso", "renda garantida", "fique rico", "comprovado cientificamente",
  "aprovado pela anvisa",
];

export interface Verificacao {
  palavras: number;
  segundos_fala: number;
  palavras_por_s: number;
  excesso_palavras: boolean;
  proibidas: string[];
  vetadas: string[];
  alerta_sintetico: boolean;
  ok: boolean;
}

export function falaCompleta(r: Roteiro) {
  return r.blocos.map((b) => b.texto.trim()).filter(Boolean).join(" ");
}

export function verificar(r: Roteiro, termosVetados: string[], atorSintetico: boolean): Verificacao {
  const fala = falaCompleta(r);
  const baixa = ` ${fala.toLowerCase()} `;
  const palavras = fala.split(/\s+/).filter(Boolean).length;
  const segundosFala = r.blocos.filter((b) => b.texto.trim()).reduce((s, b) => s + (b.fim - b.inicio), 0) || r.duracao_s;
  const pps = palavras / Math.max(1, segundosFala);
  const proibidas = PROIBIDAS_GERAIS.filter((p) => baixa.includes(p));
  const vetadas = termosVetados.filter((t) => t && baixa.includes(t.toLowerCase()));
  const alertaSint = atorSintetico && /(sou cliente (real|de verdade)|depoimento real|cliente verificad)/.test(baixa);
  const excesso = pps > 2.9;
  return {
    palavras,
    segundos_fala: Math.round(segundosFala),
    palavras_por_s: Math.round(pps * 100) / 100,
    excesso_palavras: excesso,
    proibidas,
    vetadas,
    alerta_sintetico: alertaSint,
    ok: !excesso && !proibidas.length && !vetadas.length && !alertaSint,
  };
}

// ------------------------------------------------------- simulador de texto
function roteiroSimulado(c: ContextoBriefing, angulo: string, l: string): Roteiro {
  const p = c.produto.nome;
  const ganchos: Record<string, string> = {
    depoimento: `Gente, eu demorei pra acreditar que ${p} ia fazer diferença.`,
    pergunta: `Você também perde tempo procurando algo que funcione de verdade?`,
    confissao: `Vou confessar: eu era bem cética com ${p}.`,
    antes_depois: `Olha como era antes de eu conhecer ${p}.`,
    polemica_leve: `Ninguém fala disso, mas a maioria escolhe errado.`,
    oferta: `Corre que ${p} tá com condição especial hoje.`,
  };
  const d = c.duracao_s;
  const t1 = 3, t2 = Math.round(d * 0.6), t3 = Math.min(d - 4, t2 + 5);
  return normalizar(
    {
      variacao: l,
      angulo,
      titulo: NOME_ANGULO[angulo],
      duracao_s: d,
      cenario_imagem_chave: "pessoa segurando o produto perto do rosto, em casa, luz natural da manhã",
      blocos: [
        { tipo: "gancho", inicio: 0, fim: t1, cena: "fala_frontal", enquadramento: "câmera frontal", texto: ganchos[angulo], prompt_visual: "" },
        { tipo: "demonstracao", inicio: t1, fim: t2, cena: "produto_na_mao", enquadramento: "segura o produto", texto: `Uso todo dia, é prático e cabe na minha rotina. ${c.produto.descricao.split(".")[0] ?? ""}`.trim(), prompt_visual: "" },
        { tipo: "broll", inicio: t2, fim: t3, cena: "produto_close", enquadramento: "close do produto", texto: "", prompt_visual: `${p} em close sobre uma bancada, luz da manhã, movimento suave de câmera` },
        { tipo: "cta", inicio: t3, fim: d, cena: "fala_frontal", enquadramento: "câmera frontal", texto: "O link tá aqui embaixo, aproveita.", prompt_visual: "" },
      ],
      alertas: ["Roteiro gerado pelo simulador (sem chave do Claude configurada)."],
    },
    d,
  );
}
