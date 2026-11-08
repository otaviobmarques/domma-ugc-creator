import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/** FFmpeg: variável FFMPEG_PATH, binário do sistema ou o empacotado (ffmpeg-static, usado na Vercel). */
function binario(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* sem ffmpeg-static */
  }
  return "ffmpeg";
}
const BIN = binario();

export function run(bin: string, args: string[], timeoutMs = 10 * 60_000, aceitarErro = false): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0 || aceitarErro) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} saiu com código ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run(BIN, ["-hide_banner", "-loglevel", "error", "-y", ...args]);

/** Duração, dimensões e presença de áudio (lidos do cabeçalho via `ffmpeg -i`, sem ffprobe). */
export async function probe(arquivo: string) {
  const { stderr } = await run(BIN, ["-hide_banner", "-i", arquivo], 60_000, true);
  const d = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const v = stderr.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/);
  return {
    duracao: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0,
    largura: v ? Number(v[1]) : undefined,
    altura: v ? Number(v[2]) : undefined,
    temAudio: /Stream #.*Audio:/.test(stderr),
  };
}

/** Loudness integrada (LUFS) via filtro ebur128. */
export async function loudness(arquivo: string): Promise<number | null> {
  const { stderr } = await run(BIN, ["-hide_banner", "-nostats", "-i", arquivo, "-filter_complex", "ebur128", "-f", "null", "-"]);
  const m = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? Number(m[1]) : null;
}

export function dimensoes(formato: string, qualidade: string) {
  const base = qualidade === "1080p" ? 1080 : qualidade === "480p" ? 480 : 720;
  if (formato === "1:1") return { w: base, h: base };
  if (formato === "16:9") return { w: Math.round((base * 16) / 9 / 2) * 2, h: base };
  return { w: base, h: Math.round((base * 16) / 9 / 2) * 2 };
}

/** Escapa texto para o filtro drawtext. */
export function escDrawtext(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%").replace(/,/g, "\\,");
}

/** Fonte empacotada no repositório (Inter, licença OFL) — funciona igual na Vercel, na Railway e local. */
export const PASTA_FONTES = process.env.PASTA_FONTES ?? path.join(process.cwd(), "assets", "fonts");
export const FONTE = process.env.FONTE_LEGENDA ?? path.join(PASTA_FONTES, "Inter-SemiBold.otf");

export interface TextoNaTela {
  texto: string;
  tamanho: number;          // em pixels do vídeo
  x: number;
  y: number;
  alinhamento?: number;     // numpad do ASS: 7 = topo-esquerda, 8 = topo-centro, 5 = centro, 2 = base-centro
  cor?: string;             // "RRGGBB"
  caixa?: boolean;          // fundo escuro atrás do texto
}

const corAss = (rgb = "FFFFFF", alfa = "00") => `&H${alfa}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`;
export const escFiltro = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

/**
 * Texto sobre a imagem via libass (filtro `subtitles`), que existe em todos os
 * builds do FFmpeg que usamos — ao contrário do `drawtext`.
 */
export async function filtroTexto(itens: TextoNaTela[], w: number, h: number): Promise<string> {
  const linhas = itens.map((t, i) => {
    const txt = t.texto.replace(/[{}\\]/g, "").replace(/\n/g, "\\N");
    return `Dialogue: 0,0:00:00.00,9:00:00.00,S${i},,0,0,0,,{\\an${t.alinhamento ?? 8}\\pos(${Math.round(t.x)},${Math.round(t.y)})}${txt}`;
  });
  const estilos = itens.map((t, i) =>
    `Style: S${i},Inter,${Math.round(t.tamanho)},${corAss(t.cor)},${corAss("000000", "60")},${corAss("000000", "70")},1,0,0,0,100,100,0,0,${t.caixa ? 3 : 1},${t.caixa ? 6 : 1.5},0,${t.alinhamento ?? 8},0,0,0,1`,
  );
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${w}\nPlayResY: ${h}\nWrapStyle: 0\n\n[V4+ Styles]\n` +
    `Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `${estilos.join("\n")}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${linhas.join("\n")}\n`;
  const arq = path.join(os.tmpdir(), `ugc-texto-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ass`);
  await fs.promises.writeFile(arq, ass);
  return `subtitles='${escFiltro(arq)}':fontsdir='${escFiltro(PASTA_FONTES)}'`;
}
