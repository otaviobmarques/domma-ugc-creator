/**
 * Adaptadores reais. Cada um traduz o contrato único (types.ts) para a API do
 * provedor. Endpoints e IDs de modelo a confirmar na prova de conceito —
 * os IDs vêm de catalogo.ts (sobrescrevíveis por variável de ambiente).
 */
import { dataUri, mimeDe, novaChave, salvar } from "../storage";
import { probe } from "../ffmpeg";
import { caminhoLocal } from "../storage";
import { OPCOES, PRECOS } from "./catalogo";
import { ErroProvedor, type ProvedorImagem, type ProvedorTTS, type ProvedorVideo, type StatusExterno } from "./types";

async function falhaHttp(r: Response, provedor: string): Promise<never> {
  const corpo = (await r.text()).slice(0, 500);
  const codigo =
    r.status === 401 || r.status === 403 ? "chave_invalida" : r.status === 402 ? "saldo" : r.status === 429 ? "limite" : r.status >= 500 ? "temporario" : "entrada";
  throw new ErroProvedor(`${provedor} respondeu ${r.status}: ${corpo}`, codigo);
}

function exigirChave(k: string | null, p: string): string {
  if (!k) throw new ErroProvedor(`${p}: chave de API não configurada`, "chave_invalida");
  return k;
}

async function baixar(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new ErroProvedor(`falha ao baixar resultado (${r.status})`, "temporario");
  return Buffer.from(await r.arrayBuffer());
}

// ---------------------------------------------------------------- ElevenLabs
const VELOCIDADE = { animada: 1.1, natural: 1.0, calma: 0.9 } as const;

export const elevenlabs: ProvedorTTS = {
  id: "elevenlabs",
  async gerarNarracao({ texto, vozId, ritmo }, ctx) {
    const key = exigirChave(ctx.apiKey, "ElevenLabs");
    const voz = vozId || process.env.ELEVENLABS_VOZ_PADRAO || "21m00Tcm4TlvDq8ikWAM";
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: texto,
        model_id: OPCOES.narracao[0].modelo,
        language_code: "pt",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, speed: VELOCIDADE[ritmo] },
      }),
    });
    if (!r.ok) await falhaHttp(r, "ElevenLabs");
    const chave = await salvar(novaChave(ctx.workspaceId, ctx.projetoId, "narracao.mp3"), Buffer.from(await r.arrayBuffer()));
    const { duracao } = await probe(caminhoLocal(chave));
    return { chave, duracaoS: duracao, custoUsd: texto.length * PRECOS.elevenlabsPorCaractere, unidade: "caracteres", quantidade: texto.length };
  },
};

export async function testarElevenlabs(key: string) {
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
  if (!r.ok) await falhaHttp(r, "ElevenLabs");
  const j = (await r.json()) as { character_count?: number; character_limit?: number };
  const restante = (j.character_limit ?? 0) - (j.character_count ?? 0);
  return { ok: true, saldoBaixo: j.character_limit ? restante < 5000 : false, detalhe: `${restante} caracteres restantes` };
}

// ---------------------------------------------------------------- OpenAI
export const openaiImagem: ProvedorImagem = {
  id: "openai-image",
  async gerarImagemChave({ fotoAtor, fotosProduto, cena, formato }, ctx) {
    const key = exigirChave(ctx.apiKey, "OpenAI");
    const form = new FormData();
    form.append("model", OPCOES.imagem[1].modelo!);
    form.append("prompt", promptImagemChave(cena));
    form.append("size", formato === "16:9" ? "1536x1024" : formato === "1:1" ? "1024x1024" : "1024x1536");
    form.append("quality", "medium");
    for (const c of [fotoAtor, ...fotosProduto.slice(0, 2)].filter(Boolean) as string[]) {
      const { ler } = await import("../storage");
      form.append("image[]", new Blob([new Uint8Array(await ler(c))], { type: mimeDe(c) }), c.split("/").pop());
    }
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
    if (!r.ok) await falhaHttp(r, "OpenAI");
    const j = (await r.json()) as { data: { b64_json: string }[] };
    const chave = await salvar(novaChave(ctx.workspaceId, ctx.projetoId, "imagem-chave.png"), Buffer.from(j.data[0].b64_json, "base64"));
    return { chave, custoUsd: PRECOS.imagem["openai-image"], unidade: "imagem", quantidade: 1 };
  },
};

export async function testarOpenai(key: string) {
  const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
  if (!r.ok) await falhaHttp(r, "OpenAI");
  return { ok: true, saldoBaixo: false, detalhe: "chave aceita" };
}

export function promptImagemChave(cena: string) {
  return (
    `Foto realista estilo UGC gravada com celular, vertical. A pessoa da primeira imagem (mesmo rosto, mesmas feições) ` +
    `segura o produto da(s) outra(s) imagem(ns) perto do rosto, com o rótulo virado para a câmera e totalmente legível. ` +
    `Cenário: ${cena}. Luz natural, enquadramento do peito para cima, olhando para a câmera, mãos com cinco dedos e naturais. ` +
    `Não alterar o produto, o rótulo nem as cores.`
  );
}

// ---------------------------------------------------------------- fal.ai (fila)
interface FalRef { modelo: string; status_url: string; response_url: string; opcao: string; dur: number; resolucao: string }

async function falEnviar(key: string, modelo: string, input: unknown) {
  const r = await fetch(`https://queue.fal.run/${modelo}`, {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) await falhaHttp(r, "fal.ai");
  return (await r.json()) as { request_id: string; status_url: string; response_url: string };
}

function falVideo(opcaoId: string, etapa: "lipsync" | "broll"): ProvedorVideo {
  const opcao = OPCOES[etapa].find((o) => o.id === opcaoId)!;
  return {
    id: opcaoId,
    async gerarFala({ imagem, audio, prompt, duracaoS, resolucao }, ctx) {
      const key = exigirChave(ctx.apiKey, "fal.ai");
      const q = await falEnviar(key, opcao.modelo!, {
        image_url: await dataUri(imagem, mimeDe(imagem)),
        audio_url: await dataUri(audio, mimeDe(audio)),
        prompt: prompt ?? "pessoa falando naturalmente para a câmera, gestos sutis",
      });
      const ref: FalRef = { modelo: opcao.modelo!, status_url: q.status_url, response_url: q.response_url, opcao: opcaoId, dur: duracaoS, resolucao };
      return { jobExternoId: JSON.stringify(ref) };
    },
    async gerarBroll({ imagem, prompt, duracaoS, resolucao, formato }, ctx) {
      const key = exigirChave(ctx.apiKey, "fal.ai");
      const dur = duracaoS > 7 ? "10" : "5";
      const q = await falEnviar(key, opcao.modelo!, {
        image_url: await dataUri(imagem, mimeDe(imagem)),
        prompt,
        duration: dur,
        resolution: resolucao,
        aspect_ratio: formato,
      });
      const ref: FalRef = { modelo: opcao.modelo!, status_url: q.status_url, response_url: q.response_url, opcao: opcaoId, dur: Number(dur), resolucao };
      return { jobExternoId: JSON.stringify(ref) };
    },
    async consultar(id, ctx): Promise<StatusExterno> {
      const key = exigirChave(ctx.apiKey, "fal.ai");
      const ref = JSON.parse(id) as FalRef;
      const s = await fetch(ref.status_url, { headers: { authorization: `Key ${key}` } });
      if (!s.ok) await falhaHttp(s, "fal.ai");
      const st = (await s.json()) as { status: string; queue_position?: number; error?: string };
      if (st.status === "IN_QUEUE") return { status: "gerando", progresso: 5 };
      if (st.status === "IN_PROGRESS") return { status: "gerando", progresso: 50 };
      if (st.status !== "COMPLETED") return { status: "falha", erro: st.error ?? `status ${st.status}` };
      const r = await fetch(ref.response_url, { headers: { authorization: `Key ${key}` } });
      if (!r.ok) await falhaHttp(r, "fal.ai");
      const out = (await r.json()) as { video?: { url: string }; error?: string; detail?: unknown };
      if (!out.video?.url) return { status: "falha", erro: out.error ?? JSON.stringify(out.detail ?? out).slice(0, 300) };
      const chave = await salvar(novaChave(ctx.workspaceId, "externo", `${etapa}.mp4`), await baixar(out.video.url));
      const { duracao } = await probe(caminhoLocal(chave));
      const preco =
        etapa === "lipsync"
          ? (PRECOS.lipsyncPorSegundo[ref.opcao] ?? 0.1) * duracao
          : (PRECOS.brollPorSegundo[ref.opcao]?.[ref.resolucao] ?? 0.232) * ref.dur;
      return { status: "concluido", chave, duracaoS: duracao, uso: { custoUsd: preco, unidade: "segundos", quantidade: etapa === "lipsync" ? duracao : ref.dur } };
    },
  };
}

export const falKlingAvatar = falVideo("fal-kling-avatar", "lipsync");
export const falKlingAvatarPro = falVideo("fal-kling-avatar-pro", "lipsync");
export const falOmnihuman = falVideo("fal-omnihuman", "lipsync");
export const falSeedance = falVideo("fal-seedance", "broll");
export const falKlingI2V = falVideo("fal-kling-i2v", "broll");

export const falNanoBanana: ProvedorImagem = {
  id: "fal-nano-banana",
  async gerarImagemChave({ fotoAtor, fotosProduto, cena }, ctx) {
    const key = exigirChave(ctx.apiKey, "fal.ai");
    const imagens = await Promise.all([fotoAtor, ...fotosProduto.slice(0, 2)].filter(Boolean).map((c) => dataUri(c!, mimeDe(c!))));
    // Chamada síncrona (fal.run) — imagem leva poucos segundos.
    const r = await fetch(`https://fal.run/${OPCOES.imagem[0].modelo}`, {
      method: "POST",
      headers: { authorization: `Key ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: promptImagemChave(cena), image_urls: imagens, num_images: 1 }),
    });
    if (!r.ok) await falhaHttp(r, "fal.ai");
    const j = (await r.json()) as { images: { url: string }[] };
    const chave = await salvar(novaChave(ctx.workspaceId, ctx.projetoId, "imagem-chave.png"), await baixar(j.images[0].url));
    return { chave, custoUsd: PRECOS.imagem["fal-nano-banana"], unidade: "imagem", quantidade: 1 };
  },
};

export async function testarFal(key: string) {
  if (!/^[^:\s]+:[^:\s]+$/.test(key)) throw new ErroProvedor("formato esperado: id:segredo", "chave_invalida");
  // Consulta de status de um id inexistente: 401/403 = chave ruim; 404/422 = chave aceita.
  const r = await fetch("https://queue.fal.run/fal-ai/fast-sdxl/requests/00000000-0000-0000-0000-000000000000/status", {
    headers: { authorization: `Key ${key}` },
  });
  if (r.status === 401 || r.status === 403) await falhaHttp(r, "fal.ai");
  return { ok: true, saldoBaixo: false, detalhe: "chave aceita" };
}
