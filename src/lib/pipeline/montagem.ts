import fs from "node:fs/promises";
import { existe, garantirPasta, local, novaChave, publicar } from "../storage";
import { ffmpeg, dimensoes, filtroTexto, probe, PASTA_FONTES } from "../ffmpeg";
import type { Roteiro } from "../agent/roteiro";

export interface EntradaMontagem {
  workspaceId: string;
  projetoId: string;
  formato: string;
  qualidade: string;
  roteiro: Roteiro;
  fala: string;                                // clipe com a pessoa falando (com áudio)
  brolls: { chave: string; inicio: number; fim: number }[]; // tempos do roteiro
  logo: string | null;
  musica: string | null;                       // chave de arquivo de música
  marcaIA: boolean;
}

/** Gera SRT distribuindo as palavras de cada bloco na janela de tempo do bloco. */
export function gerarSRT(roteiro: Roteiro, duracaoReal: number): string {
  const k = duracaoReal / roteiro.duracao_s;
  const cues: { ini: number; fim: number; txt: string }[] = [];
  for (const b of roteiro.blocos) {
    const palavras = b.texto.trim().split(/\s+/).filter(Boolean);
    if (!palavras.length) continue;
    const ini = b.inicio * k;
    const fim = b.fim * k;
    const grupos: string[][] = [];
    for (let i = 0; i < palavras.length; i += 5) grupos.push(palavras.slice(i, i + 5));
    const passo = (fim - ini) / grupos.length;
    grupos.forEach((g, i) => cues.push({ ini: ini + i * passo, fim: ini + (i + 1) * passo - 0.05, txt: g.join(" ") }));
  }
  const ts = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), r = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(r).padStart(3, "0")}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.ini)} --> ${ts(c.fim)}\n${c.txt}\n`).join("\n");
}

/** Montagem: fala como base, B-roll sobreposto nos tempos do roteiro, legendas, logo, selo de IA, música, loudness. */
export async function montar(e: EntradaMontagem) {
  const { w, h } = dimensoes(e.formato, e.qualidade);
  const falaPath = await local(e.fala);
  const info = await probe(falaPath);
  const dur = info.duracao;
  const k = dur / e.roteiro.duracao_s;

  const srt = gerarSRT(e.roteiro, dur);
  const srtChave = novaChave(e.workspaceId, e.projetoId, "legendas.srt");
  const srtArquivo = await garantirPasta(srtChave);
  await fs.writeFile(srtArquivo, srt);
  await publicar(srtChave);

  const args: string[] = ["-i", falaPath];
  const filtros: string[] = [`[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,setsar=1[base]`];
  let atual = "base";
  let idx = 1;
  for (const b of e.brolls) {
    if (!(await existe(b.chave))) continue;
    args.push("-i", await local(b.chave));
    const ini = b.inicio * k;
    const fim = Math.min(dur, b.fim * k);
    filtros.push(
      `[${idx}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,setsar=1,trim=0:${(fim - ini).toFixed(2)},setpts=PTS-STARTPTS+${ini.toFixed(2)}/TB[b${idx}]`,
      `[${atual}][b${idx}]overlay=0:0:eof_action=pass:enable='between(t,${ini.toFixed(2)},${fim.toFixed(2)})'[v${idx}]`,
    );
    atual = `v${idx}`;
    idx++;
  }
  if (e.logo && (await existe(e.logo))) {
    args.push("-i", await local(e.logo));
    filtros.push(`[${idx}:v]scale=${Math.round(w / 6)}:-1[logo]`, `[${atual}][logo]overlay=W-w-${Math.round(w / 24)}:${Math.round(h / 40)}[vl]`);
    atual = "vl";
    idx++;
  }
  // Unidades do ASS são relativas a PlayResY=288 (não ao tamanho real do vídeo).
  const tamanho = e.formato === "16:9" ? 16 : e.formato === "1:1" ? 13 : 11;
  const estilo = `FontName=Inter,Bold=1,FontSize=${tamanho},PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=1,Outline=1.2,Shadow=0,Alignment=2,MarginV=${e.formato === "9:16" ? 52 : 24}`;
  const esc = (p: string) => p.replace(/:/g, "\\:").replace(/'/g, "\\'");
  const srtPath = srtArquivo.replace(/:/g, "\\:").replace(/'/g, "\\'");
  filtros.push(`[${atual}]subtitles='${srtPath}':fontsdir='${esc(PASTA_FONTES)}':force_style='${estilo}'[vs]`);
  atual = "vs";
  if (e.marcaIA) {
    filtros.push(`[${atual}]${await filtroTexto([{ texto: "Gerado por IA", tamanho: h * 0.017, x: w * 0.05, y: h * 0.03, alinhamento: 7, caixa: true }], w, h)}[vf]`);
    atual = "vf";
  }
  let audio = "0:a";
  if (e.musica && (await existe(e.musica))) {
    args.push("-stream_loop", "-1", "-i", await local(e.musica));
    filtros.push(`[${idx}:a]volume=0.12,atrim=0:${dur.toFixed(2)}[mus]`, `[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0[mix]`);
    audio = "mix";
    idx++;
  }
  filtros.push(`[${audio === "0:a" ? "0:a" : audio}]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);

  const saida = novaChave(e.workspaceId, e.projetoId, `final-${e.formato.replace(":", "x")}.mp4`);
  await ffmpeg([
    ...args,
    "-filter_complex", filtros.join(";"),
    "-map", `[${atual}]`, "-map", "[aout]",
    "-t", dur.toFixed(2),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart",
    await garantirPasta(saida),
  ]);
  await publicar(saida);
  return { chave: saida, srt, srtChave, duracao: dur };
}

/** Exporta outro formato a partir do vídeo final (fundo desfocado, sem custo de geração). */
export async function reenquadrar(workspaceId: string, projetoId: string, origem: string, formato: string, qualidade: string) {
  const { w, h } = dimensoes(formato, qualidade);
  const saida = novaChave(workspaceId, projetoId, `final-${formato.replace(":", "x")}.mp4`);
  await ffmpeg([
    "-i", await local(origem),
    "-filter_complex",
    `[0:v]split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=20:2[bg];` +
      `[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`,
    "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "copy", "-movflags", "+faststart",
    await garantirPasta(saida),
  ]);
  await publicar(saida);
  return saida;
}

/** Extrai N quadros uniformes (para o QA visual). */
export async function extrairQuadros(workspaceId: string, projetoId: string, video: string, n = 8) {
  const arquivo = await local(video);
  const { duracao } = await probe(arquivo);
  const quadros: { chave: string; tempo: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) * duracao) / n;
    const chave = novaChave(workspaceId, projetoId, `qa-${i}.jpg`);
    await ffmpeg(["-ss", t.toFixed(2), "-i", arquivo, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4", await garantirPasta(chave)]);
    quadros.push({ chave, tempo: t });
  }
  return quadros;
}
