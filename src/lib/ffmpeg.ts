import { spawn } from "node:child_process";

export function run(bin: string, args: string[], timeoutMs = 10 * 60_000): Promise<{ stdout: string; stderr: string }> {
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
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} saiu com código ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

export async function probe(arquivo: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", arquivo]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  const a = j.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  return {
    duracao: Number(j.format.duration ?? 0),
    largura: v?.width as number | undefined,
    altura: v?.height as number | undefined,
    temAudio: !!a,
  };
}

/** Loudness integrada (LUFS) via filtro ebur128. */
export async function loudness(arquivo: string): Promise<number | null> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", arquivo, "-filter_complex", "ebur128", "-f", "null", "-"]);
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

export const FONTE = process.env.FONTE_LEGENDA ?? "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf";
