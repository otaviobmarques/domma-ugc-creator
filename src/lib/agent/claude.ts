import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type * as z from "zod/v4";
import { sql } from "../db";
import { obterChave } from "../providers";
import { cambio, PRECOS } from "../providers/catalogo";

export const MODELO = "claude-opus-5-5";

export async function clienteClaude(workspaceId: string) {
  const key = await obterChave(workspaceId, "anthropic");
  return key ? new Anthropic({ apiKey: key, maxRetries: 3 }) : null;
}

/**
 * Uma chamada ao Claude com saída em JSON validada por esquema Zod (guardrail
 * 6.2: resposta fora do esquema é descartada e pedida de novo). Usa fallback
 * do lado do servidor para recusas e registra o custo da chamada.
 */
export async function chamarJSON<S extends z.ZodType>(opts: {
  client: Anthropic;
  workspaceId: string;
  projetoId: string | null;
  etapa: string;
  system: string;
  conteudo: BetaContentBlockParam[];
  schema: S;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<S>> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const resp = await opts.client.beta.messages.parse({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.conteudo }],
    });
    await registrarUso(opts.workspaceId, opts.projetoId, opts.etapa, resp.usage.input_tokens, resp.usage.output_tokens);
    if (resp.stop_reason === "refusal") throw new Error("O modelo recusou o pedido (verifique o briefing).");
    if (resp.stop_reason === "max_tokens") {
      ultimoErro = new Error("resposta cortada por max_tokens");
      continue;
    }
    if (resp.parsed_output) return resp.parsed_output as z.infer<S>;
    ultimoErro = new Error("resposta fora do esquema");
  }
  throw ultimoErro;
}

async function registrarUso(ws: string, projeto: string | null, etapa: string, entrada: number, saida: number) {
  const usd = (entrada * PRECOS.claude.entradaPorMTok + saida * PRECOS.claude.saidaPorMTok) / 1_000_000;
  const c = cambio();
  await sql`insert into custos (workspace_id, projeto_id, etapa, provedor, unidade, quantidade, valor_usd, valor_brl, cambio)
    values (${ws}, ${projeto}, ${etapa}, 'anthropic', 'tokens', ${entrada + saida}, ${usd}, ${usd * c}, ${c})`;
}
