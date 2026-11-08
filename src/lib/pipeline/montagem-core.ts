/**
 * Núcleo da montagem — só FFmpeg e arquivos locais, sem banco nem armazenamento.
 * O mesmo código roda no worker da nuvem e no app de desktop (Versão Local).
 */
import fs from "node:fs/promises";
import { ffmpeg, dimensoes, escFiltro, filtroTexto, probe, PASTA_FONTES } from "../ffmpeg";
import type { Roteiro } from "../agent/roteiro";

export interface EntradaMontagemLocal {
  formato: string;
  qualidade: string;
  roteiro: Roteiro;
  fala: string;                                     // caminho do clipe com a pessoa falando (com áudio)
  brolls: { arquivo: string; inicio: number; fim: number }[]; // tempos do roteiro
  logo: string | null;
  musica: string | null;
  marcaIA: boolean;
  saida: string;                                    // caminho do MP4 final
  srtArquivo: string;                               // caminho onde gravar as legendas
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

/** Fala como base, B-roll sobreposto nos tempos do roteiro, legendas, logo, selo de IA, música e loudness. */
export async function montarArquivos(e: EntradaMontagemLocal) {
  const { w, h } = dimensoes(e.formato, e.qualidade);
  const info = await probe(e.fala);
  const dur = info.duracao;
  const k = dur / e.roteiro.duracao_s;

  const srt = gerarSRT(e.roteiro, dur);
  await fs.writeFile(e.srtArquivo, srt);

  const args: string[] = ["-i", e.fala];
  const filtros: string[] = [`[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,setsar=1[base]`];
  let atual = "base";
  let idx = 1;
  for (const b of e.brolls) {
    args.push("-i", b.arquivo);
    const ini = b.inicio * k;
    const fim = Math.min(dur, b.fim * k);
    filtros.push(
      `[${idx}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,setsar=1,trim=0:${(fim - ini).toFixed(2)},setpts=PTS-STARTPTS+${ini.toFixed(2)}/TB[b${idx}]`,
      `[${atual}][b${idx}]overlay=0:0:eof_action=pass:enable='between(t,${ini.toFixed(2)},${fim.toFixed(2)})'[v${idx}]`,
    );
    atual = `v${idx}`;
    idx++;
  }
  if (e.logo) {
    args.push("-i", e.logo);
    filtros.push(`[${idx}:v]scale=${Math.round(w / 6)}:-1[logo]`, `[${atual}][logo]overlay=W-w-${Math.round(w / 24)}:${Math.round(h / 40)}[vl]`);
    atual = "vl";
    idx++;
  }
  // Unidades do ASS são relativas a PlayResY=288 (não ao tamanho real do vídeo).
  const tamanho = e.formato === "16:9" ? 16 : e.formato === "1:1" ? 13 : 11;
  const estilo = `FontName=Inter,Bold=1,FontSize=${tamanho},PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=1,Outline=1.2,Shadow=0,Alignment=2,MarginV=${e.formato === "9:16" ? 52 : 24}`;
  filtros.push(`[${atual}]subtitles='${escFiltro(e.srtArquivo)}':fontsdir='${escFiltro(PASTA_FONTES)}':force_style='${estilo}'[vs]`);
  atual = "vs";
  if (e.marcaIA) {
    filtros.push(`[${atual}]${await filtroTexto([{ texto: "Gerado por IA", tamanho: h * 0.017, x: w * 0.05, y: h * 0.03, alinhamento: 7, caixa: true }], w, h)}[vf]`);
    atual = "vf";
  }
  let audio = "0:a";
  if (e.musica) {
    args.push("-stream_loop", "-1", "-i", e.musica);
    filtros.push(`[${idx}:a]volume=0.12,atrim=0:${dur.toFixed(2)}[mus]`, `[0:a][mus]amix=inputs=2:duration=first:dropout_transition=0[mix]`);
    audio = "mix";
    idx++;
  }
  filtros.push(`[${audio}]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);

  await ffmpeg([
    ...args,
    "-filter_complex", filtros.join(";"),
    "-map", `[${atual}]`, "-map", "[aout]",
    "-t", dur.toFixed(2),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart",
    e.saida,
  ]);
  return { srt, duracao: dur };
}
