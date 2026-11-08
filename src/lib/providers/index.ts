import { sql } from "../db";
import { decifrar } from "../crypto";
import { OPCOES, ROTEAMENTO_PADRAO, type EtapaRoteavel } from "./catalogo";
import { imagemSimulador, ttsSimulador, videoSimulador } from "./simulador";
import {
  elevenlabs, falKlingAvatar, falKlingAvatarPro, falKlingI2V, falNanoBanana, falOmnihuman, falSeedance, openaiImagem,
} from "./reais";
import type { ProvedorImagem, ProvedorTTS, ProvedorVideo } from "./types";

const TTS: Record<string, ProvedorTTS> = { elevenlabs, simulador: ttsSimulador };
const IMAGEM: Record<string, ProvedorImagem> = { "fal-nano-banana": falNanoBanana, "openai-image": openaiImagem, simulador: imagemSimulador };
const VIDEO: Record<string, ProvedorVideo> = {
  "fal-kling-avatar": falKlingAvatar,
  "fal-kling-avatar-pro": falKlingAvatarPro,
  "fal-omnihuman": falOmnihuman,
  "fal-seedance": falSeedance,
  "fal-kling-i2v": falKlingI2V,
  simulador: videoSimulador,
};

export const simuladorPermitido = () => process.env.PERMITIR_SIMULADOR !== "false";

export async function obterChave(workspaceId: string, provedor: string): Promise<string | null> {
  const [row] = await sql`select chave_cifrada from chaves_api where workspace_id = ${workspaceId} and provedor = ${provedor}`;
  if (row) return decifrar(row.chave_cifrada);
  // Para o Claude, aceita também a variável de ambiente.
  if (provedor === "anthropic" && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  return null;
}

export async function roteamento(workspaceId: string) {
  const [ws] = await sql`select config_provedores from workspaces where id = ${workspaceId}`;
  const cfg = (ws?.config_provedores ?? {}) as Partial<typeof ROTEAMENTO_PADRAO>;
  return { ...ROTEAMENTO_PADRAO, ...cfg };
}

export interface Resolvido {
  opcaoId: string;
  apiKey: string | null;
  simulado: boolean;
  motivo: string;
}

/**
 * Escolhe o provedor da etapa. A partir da 3ª tentativa (o principal falhou
 * duas vezes), usa o alternativo. Sem chave, cai no simulador se permitido.
 */
export async function resolver(workspaceId: string, etapa: EtapaRoteavel, tentativa = 1, forcar?: string): Promise<Resolvido> {
  const r = (await roteamento(workspaceId))[etapa];
  const desejado = forcar ?? (tentativa >= 3 ? r.alternativo : r.principal);
  const candidatos = [desejado, desejado === r.principal ? r.alternativo : r.principal];
  for (const id of candidatos) {
    const op = OPCOES[etapa].find((o) => o.id === id);
    if (!op) continue;
    if (!op.chave) return { opcaoId: id, apiKey: null, simulado: id === "simulador", motivo: "sem chave necessária" };
    const k = await obterChave(workspaceId, op.chave);
    if (k) return { opcaoId: id, apiKey: k, simulado: false, motivo: id === desejado ? "provedor configurado" : `${desejado} sem chave; usando ${id}` };
  }
  if (simuladorPermitido()) return { opcaoId: "simulador", apiKey: null, simulado: true, motivo: "nenhuma chave configurada; usando simulador" };
  throw new Error(`Nenhum provedor com chave configurada para a etapa ${etapa}`);
}

export const tts = (id: string) => TTS[id] ?? ttsSimulador;
export const imagem = (id: string) => IMAGEM[id] ?? imagemSimulador;
export const video = (id: string) => VIDEO[id] ?? videoSimulador;
