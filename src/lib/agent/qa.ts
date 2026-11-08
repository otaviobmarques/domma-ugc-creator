import * as z from "zod/v4";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { chamarJSON, clienteClaude } from "./claude";
import { ler, mimeDe } from "../storage";
import type { Roteiro } from "./roteiro";

export const QASchema = z.object({
  criterios: z.object({
    rosto: z.number().describe("0 a 10: consistência do rosto com a foto do ator em todos os quadros"),
    maos: z.number().describe("0 a 10: mãos e dedos naturais (5 dedos, sem deformação)"),
    produto: z.number().describe("0 a 10: produto correto e rótulo legível"),
    sincronia: z.number().describe("0 a 10: boca coerente com a fala (estimar pelos quadros)"),
    legenda: z.number().describe("0 a 10: legenda legível e igual ao texto falado"),
  }),
  defeitos: z.array(
    z.object({
      criterio: z.enum(["rosto", "maos", "produto", "sincronia", "legenda", "outro"]),
      tempo_s: z.number(),
      descricao: z.string(),
      sugestao: z.string(),
    }),
  ),
  resumo: z.string(),
});
export type ResultadoQA = z.infer<typeof QASchema>;

/** Limites da tabela da seção 6.4: abaixo disso, refaz. */
export const LIMITES = { rosto: 7, maos: 6, produto: 7, sincronia: 7, legenda: 9 } as const;

export async function avaliarVisual(p: {
  workspaceId: string;
  projetoId: string;
  quadros: { chave: string; tempo: number }[];
  fotoAtor: string | null;
  fotoProduto: string | null;
  roteiro: Roteiro;
}): Promise<{ qa: ResultadoQA; simulado: boolean }> {
  const client = await clienteClaude(p.workspaceId);
  if (!client) {
    return {
      simulado: true,
      qa: {
        criterios: { rosto: 8.5, maos: 8, produto: 8.2, sincronia: 8, legenda: 9.5 },
        defeitos: [],
        resumo: "Avaliação visual simulada (sem chave do Claude). Só as checagens automáticas são reais.",
      },
    };
  }
  const img = async (chave: string): Promise<BetaContentBlockParam> => ({
    type: "image",
    source: { type: "base64", media_type: mimeDe(chave) as "image/png" | "image/jpeg", data: (await ler(chave)).toString("base64") },
  });
  const conteudo: BetaContentBlockParam[] = [];
  if (p.fotoAtor) conteudo.push({ type: "text", text: "Foto original do ator:" }, await img(p.fotoAtor));
  if (p.fotoProduto) conteudo.push({ type: "text", text: "Foto original do produto:" }, await img(p.fotoProduto));
  for (const q of p.quadros) conteudo.push({ type: "text", text: `Quadro em ${q.tempo.toFixed(1)} s:` }, await img(q.chave));
  conteudo.push({
    type: "text",
    text: `Roteiro do vídeo (JSON):\n${JSON.stringify(p.roteiro)}\n\nAvalie o vídeo pelos quadros. Dê nota de 0 a 10 por critério e liste cada defeito com o tempo exato (do quadro onde aparece) e uma sugestão de correção. Seja rigoroso com rosto diferente da foto, mãos deformadas e rótulo ilegível.`,
  });
  const qa = await chamarJSON({
    client,
    workspaceId: p.workspaceId,
    projetoId: p.projetoId,
    etapa: "qa",
    system: "Você é o revisor de qualidade de um estúdio de vídeos UGC gerados por IA. Responda em português do Brasil.",
    conteudo,
    schema: QASchema,
    effort: "medium",
  });
  return { qa, simulado: false };
}

export const AjusteSchema = z.object({
  resumo: z.string().describe("o que será feito, em uma frase para o operador"),
  refazer_roteiro: z.boolean(),
  instrucao_roteiro: z.string().describe("instrução para reescrever o roteiro; vazio se não precisar"),
  refazer_narracao: z.boolean(),
  refazer_imagem: z.boolean(),
  refazer_lipsync: z.boolean(),
  refazer_broll: z.boolean(),
  musica: z.enum(["manter", "calma", "animada", "sem_musica"]),
});
export type DecisaoAjuste = z.infer<typeof AjusteSchema>;

/** RF-42: o agente interpreta o pedido de ajuste e decide o que refazer. */
export async function interpretarAjuste(p: { workspaceId: string; projetoId: string; pedido: string; roteiro: Roteiro; defeitos: unknown }): Promise<DecisaoAjuste> {
  const client = await clienteClaude(p.workspaceId);
  if (!client) {
    const t = p.pedido.toLowerCase();
    const roteiro = /(gancho|texto|fala|frase|cta|roteiro|encurt|mais curto)/.test(t);
    return {
      resumo: `(simulado) ${roteiro ? "Reescrever o roteiro e refazer narração e fala" : "Remontar o vídeo"}${/m[uú]sica/.test(t) ? " e trocar a música" : ""}.`,
      refazer_roteiro: roteiro,
      instrucao_roteiro: roteiro ? p.pedido : "",
      refazer_narracao: roteiro,
      refazer_imagem: /(imagem|rosto|m[aã]o|produto|r[oó]tulo)/.test(t),
      refazer_lipsync: roteiro || /(boca|sincronia|lip)/.test(t),
      refazer_broll: /(b-?roll|cena do produto)/.test(t),
      musica: /m[uú]sica.*(calm[oa]|tranquil[oa]|suave)/.test(t) ? "calma" : /m[uú]sica.*anima/.test(t) ? "animada" : /sem m[uú]sica/.test(t) ? "sem_musica" : "manter",
    };
  }
  return chamarJSON({
    client,
    workspaceId: p.workspaceId,
    projetoId: p.projetoId,
    etapa: "ajuste",
    system:
      "Você coordena a produção de vídeos UGC. Dado um pedido de ajuste, decida o MÍNIMO a refazer para atender o pedido, " +
      "lembrando as dependências: mudar o texto falado exige refazer roteiro, narração e lip-sync; mudar rosto/produto na pessoa " +
      "exige refazer imagem-chave e lip-sync; música e legendas só exigem remontagem (sem custo de geração).",
    conteudo: [{ type: "text", text: `Pedido: ${p.pedido}\n\nRoteiro atual: ${JSON.stringify(p.roteiro)}\n\nDefeitos do QA: ${JSON.stringify(p.defeitos)}` }],
    schema: AjusteSchema,
    effort: "low",
  });
}
