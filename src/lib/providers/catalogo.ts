/**
 * Catálogo de provedores e tabela de preços de referência (USD).
 * Valores de 2026, a confirmar na prova de conceito (seção 10). Editáveis aqui
 * sem mudar o pipeline. Os IDs de modelo dos agregadores podem ser trocados
 * por variável de ambiente.
 */

export type Grupo = "ia" | "voz" | "imagem" | "video" | "integracao";

export interface InfoProvedor {
  id: string;            // id da chave (tabela chaves_api.provedor)
  nome: string;
  descricao: string;
  grupo: Grupo;
  formatoChave: string;  // dica exibida no formulário
}

export const PROVEDORES: InfoProvedor[] = [
  { id: "anthropic", nome: "Anthropic (Claude)", descricao: "Agente, roteiros e revisão de qualidade", grupo: "ia", formatoChave: "sk-ant-..." },
  { id: "elevenlabs", nome: "ElevenLabs", descricao: "Narração e voz clonada", grupo: "voz", formatoChave: "chave xi-api-key" },
  { id: "openai", nome: "OpenAI (GPT Image)", descricao: "Imagem-chave com o produto", grupo: "imagem", formatoChave: "sk-proj-..." },
  { id: "fal", nome: "fal.ai", descricao: "Agregador: Kling Avatar, Seedance, Nano Banana, OmniHuman", grupo: "video", formatoChave: "id:segredo" },
  { id: "domma_chat", nome: "Domma Chat", descricao: "Avisos e aprovação pelo WhatsApp", grupo: "integracao", formatoChave: "token do Domma Chat" },
  { id: "adplane", nome: "Adplane", descricao: "Envio do vídeo para campanhas", grupo: "integracao", formatoChave: "token do Adplane" },
  { id: "supabase", nome: "Supabase Storage", descricao: "Armazenamento dos vídeos (opcional; sem ela, usa o banco)", grupo: "integracao", formatoChave: "sb_secret_... (chave secreta)" },
  { id: "resend", nome: "Resend", descricao: "E-mails de conclusão", grupo: "integracao", formatoChave: "re_..." },
];

/** Opções de execução por etapa. `chave` diz qual chave de API a opção usa. */
export interface OpcaoEtapa {
  id: string;
  nome: string;
  chave: string | null; // null = não precisa de chave (simulador)
  modelo?: string;
}

const env = (k: string, d: string) => process.env[k] || d;

export const OPCOES: Record<"roteiro" | "narracao" | "imagem" | "lipsync" | "broll", OpcaoEtapa[]> = {
  roteiro: [
    { id: "anthropic", nome: "Claude Opus 5.5", chave: "anthropic", modelo: "claude-opus-5-5" },
    { id: "simulador", nome: "Simulador (modelos de texto)", chave: null },
  ],
  narracao: [
    { id: "elevenlabs", nome: "ElevenLabs Multilingual v2", chave: "elevenlabs", modelo: env("ELEVENLABS_MODELO", "eleven_multilingual_v2") },
    { id: "simulador", nome: "Simulador", chave: null },
  ],
  imagem: [
    { id: "fal-nano-banana", nome: "Nano Banana (fal.ai)", chave: "fal", modelo: env("FAL_MODELO_IMAGEM", "fal-ai/nano-banana/edit") },
    { id: "openai-image", nome: "GPT Image (OpenAI)", chave: "openai", modelo: env("OPENAI_MODELO_IMAGEM", "gpt-image-1") },
    { id: "simulador", nome: "Simulador", chave: null },
  ],
  lipsync: [
    { id: "fal-kling-avatar", nome: "Kling Avatar Standard (fal.ai)", chave: "fal", modelo: env("FAL_MODELO_LIPSYNC", "fal-ai/kling-video/v1/standard/ai-avatar") },
    { id: "fal-kling-avatar-pro", nome: "Kling Avatar Pro (fal.ai)", chave: "fal", modelo: env("FAL_MODELO_LIPSYNC_PRO", "fal-ai/kling-video/v1/pro/ai-avatar") },
    { id: "fal-omnihuman", nome: "OmniHuman (fal.ai)", chave: "fal", modelo: env("FAL_MODELO_OMNIHUMAN", "fal-ai/bytedance/omnihuman") },
    { id: "simulador", nome: "Simulador", chave: null },
  ],
  broll: [
    { id: "fal-seedance", nome: "Seedance (fal.ai)", chave: "fal", modelo: env("FAL_MODELO_BROLL", "fal-ai/bytedance/seedance/v1/pro/image-to-video") },
    { id: "fal-kling-i2v", nome: "Kling imagem-para-vídeo (fal.ai)", chave: "fal", modelo: env("FAL_MODELO_BROLL_ALT", "fal-ai/kling-video/v2.1/standard/image-to-video") },
    { id: "simulador", nome: "Simulador", chave: null },
  ],
};

export type EtapaRoteavel = keyof typeof OPCOES;

export const ROTEAMENTO_PADRAO: Record<EtapaRoteavel, { principal: string; alternativo: string }> = {
  roteiro: { principal: "anthropic", alternativo: "simulador" },
  narracao: { principal: "elevenlabs", alternativo: "simulador" },
  imagem: { principal: "fal-nano-banana", alternativo: "openai-image" },
  lipsync: { principal: "fal-kling-avatar", alternativo: "fal-omnihuman" },
  broll: { principal: "fal-seedance", alternativo: "fal-kling-i2v" },
};

/** Preços de referência em USD por unidade. */
export const PRECOS = {
  claude: { entradaPorMTok: 4, saidaPorMTok: 20 },
  elevenlabsPorCaractere: 0.0003,
  imagem: { "fal-nano-banana": 0.039, "openai-image": 0.07, simulador: 0.05 } as Record<string, number>,
  lipsyncPorSegundo: { "fal-kling-avatar": 0.0562, "fal-kling-avatar-pro": 0.115, "fal-omnihuman": 0.16, simulador: 0.1 } as Record<string, number>,
  brollPorSegundo: {
    "fal-seedance": { "480p": 0.1, "720p": 0.232, "1080p": 0.5 },
    "fal-kling-i2v": { "480p": 0.05, "720p": 0.05, "1080p": 0.09 },
    simulador: { "480p": 0.1, "720p": 0.232, "1080p": 0.5 },
  } as Record<string, Record<string, number>>,
  montagemPorVideo: 0.03,
};

export const cambio = () => Number(process.env.CAMBIO_USD_BRL ?? 5.5);

/** Estimativa por variação (RF-04), faixa min–max em USD. */
export function estimarVariacaoUsd(p: { duracaoS: number; qualidade: string; roteamento?: Partial<typeof ROTEAMENTO_PADRAO> }) {
  const r = { ...ROTEAMENTO_PADRAO, ...(p.roteamento ?? {}) };
  const falados = p.duracaoS * 0.8;
  const chars = p.duracaoS * 15;
  const img = PRECOS.imagem[r.imagem.principal] ?? 0.05;
  const lip = PRECOS.lipsyncPorSegundo[r.lipsync.principal] ?? 0.1;
  const broll = PRECOS.brollPorSegundo[r.broll.principal]?.[p.qualidade] ?? 0.232;
  const min = 0.05 + chars * PRECOS.elevenlabsPorCaractere + img + falados * lip + 5 * broll + PRECOS.montagemPorVideo;
  const max = 0.3 + chars * PRECOS.elevenlabsPorCaractere * 2 + img * 3 + falados * lip * 2 + 10 * broll + 0.1;
  return { min, max };
}
