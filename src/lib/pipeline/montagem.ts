import { existe, garantirPasta, local, novaChave, publicar } from "../storage";
import { ffmpeg, dimensoes, probe } from "../ffmpeg";
import { montarArquivos } from "./montagem-core";
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

export { gerarSRT } from "./montagem-core";

/** Montagem no servidor: baixa as entradas, chama o núcleo e publica o resultado. */
export async function montar(e: EntradaMontagem) {
  const srtChave = novaChave(e.workspaceId, e.projetoId, "legendas.srt");
  const saida = novaChave(e.workspaceId, e.projetoId, `final-${e.formato.replace(":", "x")}.mp4`);
  const brolls = [];
  for (const b of e.brolls) if (await existe(b.chave)) brolls.push({ arquivo: await local(b.chave), inicio: b.inicio, fim: b.fim });
  const r = await montarArquivos({
    formato: e.formato,
    qualidade: e.qualidade,
    roteiro: e.roteiro,
    fala: await local(e.fala),
    brolls,
    logo: e.logo && (await existe(e.logo)) ? await local(e.logo) : null,
    musica: e.musica && (await existe(e.musica)) ? await local(e.musica) : null,
    marcaIA: e.marcaIA,
    saida: await garantirPasta(saida),
    srtArquivo: await garantirPasta(srtChave),
  });
  await publicar(srtChave);
  await publicar(saida);
  return { chave: saida, srt: r.srt, srtChave, duracao: r.duracao };
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
