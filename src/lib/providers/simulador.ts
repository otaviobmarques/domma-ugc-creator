/**
 * Simulador de provedores. Gera mídia de teste com FFmpeg para que o pipeline
 * inteiro (fila, custos, QA, montagem, revisão) rode sem chaves de API.
 * Os custos registrados usam a tabela de preços do provedor principal da etapa
 * e ficam marcados como "simulado".
 */
import { caminhoLocal, existe, garantirPasta, novaChave } from "../storage";
import { ffmpeg, probe, dimensoes, escDrawtext, FONTE } from "../ffmpeg";
import { PRECOS } from "./catalogo";
import type { ProvedorImagem, ProvedorTTS, ProvedorVideo, StatusExterno } from "./types";

const ATRASO_MS = Number(process.env.SIMULADOR_ATRASO_MS ?? 6000);

export const ttsSimulador: ProvedorTTS = {
  id: "simulador",
  async gerarNarracao({ texto, ritmo }, ctx) {
    const palavras = texto.split(/\s+/).filter(Boolean).length;
    const wps = ritmo === "animada" ? 2.9 : ritmo === "calma" ? 2.2 : 2.6;
    const dur = Math.max(3, palavras / wps);
    const chave = novaChave(ctx.workspaceId, ctx.projetoId, "narracao.mp3");
    const out = await garantirPasta(chave);
    // Tom com envelope de "sílabas" — só para ter áudio com a duração certa.
    await ffmpeg([
      "-f", "lavfi", "-i", `aevalsrc=0.18*sin(2*PI*170*t)*(0.55+0.45*sin(2*PI*4*t)):s=44100:d=${dur.toFixed(2)}`,
      "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", out,
    ]);
    return { chave, duracaoS: dur, custoUsd: texto.length * PRECOS.elevenlabsPorCaractere, unidade: "caracteres (simulado)", quantidade: texto.length };
  },
};

export const imagemSimulador: ProvedorImagem = {
  id: "simulador",
  async gerarImagemChave({ fotoAtor, fotosProduto, cena, formato }, ctx) {
    const { w, h } = dimensoes(formato, "1080p");
    const chave = novaChave(ctx.workspaceId, ctx.projetoId, "imagem-chave.png");
    const out = await garantirPasta(chave);
    const ator = fotoAtor && (await existe(fotoAtor)) ? caminhoLocal(fotoAtor) : null;
    const prod = fotosProduto[0] && (await existe(fotosProduto[0])) ? caminhoLocal(fotosProduto[0]) : null;
    const legenda = escDrawtext(`Imagem-chave (simulada): ${cena}`.slice(0, 70));
    const inputs = ["-f", "lavfi", "-i", `color=c=0x2a2350:s=${w}x${h}:d=1`];
    let filtro = `[0:v]drawtext=fontfile=${FONTE}:text='${legenda}':fontcolor=white@0.8:fontsize=${Math.round(w / 28)}:x=(w-tw)/2:y=h*0.06[bg]`;
    let ultimo = "bg";
    if (ator) {
      inputs.push("-i", ator);
      filtro += `;[${inputs.filter((x) => x === "-i").length - 1}:v]scale=${Math.round(w * 0.9)}:-2:force_original_aspect_ratio=decrease[a];[${ultimo}][a]overlay=(W-w)/2:(H-h)/2[v1]`;
      ultimo = "v1";
    }
    if (prod) {
      inputs.push("-i", prod);
      filtro += `;[${inputs.filter((x) => x === "-i").length - 1}:v]scale=${Math.round(w * 0.38)}:-2[p];[${ultimo}][p]overlay=W*0.55:H*0.6[v2]`;
      ultimo = "v2";
    }
    await ffmpeg([...inputs, "-filter_complex", filtro, "-map", `[${ultimo}]`, "-frames:v", "1", out]);
    return { chave, custoUsd: PRECOS.imagem["fal-nano-banana"], unidade: "imagem (simulado)", quantidade: 1 };
  },
};

/** jobExternoId = JSON com o arquivo final e o horário em que "fica pronto". */
export const videoSimulador: ProvedorVideo = {
  id: "simulador",
  async gerarFala({ imagem, audio, resolucao, formato, duracaoS }, ctx) {
    const { w, h } = dimensoes(formato, resolucao);
    const chave = novaChave(ctx.workspaceId, ctx.projetoId, "fala.mp4");
    const out = await garantirPasta(chave);
    // Imagem com leve "respiração" (zoom) + forma de onda da fala na base.
    await ffmpeg([
      "-loop", "1", "-i", caminhoLocal(imagem), "-i", caminhoLocal(audio),
      "-filter_complex",
      `[0:v]scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
        `zoompan=z='1.04+0.02*sin(on/12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=25[bg];` +
        `[1:a]showwaves=s=${w}x${Math.round(h / 10)}:mode=cline:colors=white@0.6:rate=25[wv];` +
        `[bg][wv]overlay=0:H*0.86,format=yuv420p[v]`,
      "-map", "[v]", "-map", "1:a", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", out,
    ]);
    const custo = duracaoS * PRECOS.lipsyncPorSegundo["fal-kling-avatar"];
    return { jobExternoId: JSON.stringify({ chave, pronto: Date.now() + ATRASO_MS, custo, dur: duracaoS, un: "segundos (simulado)" }) };
  },
  async gerarBroll({ imagem, prompt, duracaoS, resolucao, formato }, ctx) {
    const { w, h } = dimensoes(formato, resolucao);
    const chave = novaChave(ctx.workspaceId, ctx.projetoId, "broll.mp4");
    const out = await garantirPasta(chave);
    const frames = Math.round(duracaoS * 25);
    await ffmpeg([
      "-loop", "1", "-i", caminhoLocal(imagem),
      "-vf",
      `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},` +
        `zoompan=z='min(zoom+0.0015,1.25)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=25,` +
        `drawtext=fontfile=${FONTE}:text='${escDrawtext(("B-roll: " + prompt).slice(0, 60))}':fontcolor=white@0.7:fontsize=${Math.round(w / 32)}:x=(w-tw)/2:y=h*0.12,format=yuv420p`,
      "-t", duracaoS.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-an", out,
    ]);
    const custo = duracaoS * (PRECOS.brollPorSegundo["fal-seedance"][resolucao] ?? 0.232);
    return { jobExternoId: JSON.stringify({ chave, pronto: Date.now() + ATRASO_MS * 1.3, custo, dur: duracaoS, un: "segundos (simulado)" }) };
  },
  async consultar(id): Promise<StatusExterno> {
    const j = JSON.parse(id) as { chave: string; pronto: number; custo: number; dur: number; un: string };
    const falta = j.pronto - Date.now();
    if (falta > 0) return { status: "gerando", progresso: Math.max(5, Math.min(95, Math.round(100 - (falta / (ATRASO_MS * 1.3)) * 100))) };
    const info = await probe(caminhoLocal(j.chave));
    return { status: "concluido", chave: j.chave, duracaoS: info.duracao, uso: { custoUsd: j.custo, unidade: j.un, quantidade: j.dur } };
  },
};
