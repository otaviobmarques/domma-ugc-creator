import fs from "node:fs";
import { Readable } from "node:stream";
import { caminhoLocal, infoRemota, lerTrecho, mimeDe, nuvem, urlSupabaseAssinada, validarToken } from "@/lib/storage";

const TRECHO_MAX = 3 * 1024 * 1024; // respostas da Vercel têm limite de 4,5 MB

/** Serve arquivos privados por URL assinada de validade curta (com Range para o player). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chave = validarToken(url.searchParams.get("t") ?? "");
  if (!chave) return new Response("link expirado ou inválido", { status: 403 });
  const nome = url.searchParams.get("download");
  const base: Record<string, string> = { "content-type": mimeDe(chave), "accept-ranges": "bytes", "cache-control": "private, max-age=600" };
  if (nome) base["content-disposition"] = `attachment; filename="${nome.replace(/[^\w.\-]/g, "_")}"`;
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);

  if (nuvem()) {
    const info = await infoRemota(chave);
    if (!info) return new Response("arquivo não encontrado", { status: 404 });
    if (info.onde === "supabase") {
      const assinada = await urlSupabaseAssinada(chave, 3600, nome ?? undefined);
      return assinada ? Response.redirect(assinada, 302) : new Response("armazenamento indisponível", { status: 503 });
    }
    // Postgres: entrega em trechos (o player de vídeo pede por Range).
    const tam = info.tamanho;
    const ini = range?.[1] ? Number(range[1]) : 0;
    const fimPedido = range?.[2] ? Math.min(Number(range[2]), tam - 1) : tam - 1;
    const fim = Math.min(fimPedido, ini + TRECHO_MAX - 1);
    if (!range && tam <= TRECHO_MAX) {
      return new Response(new Uint8Array(await lerTrecho(chave, 0, tam)), { headers: { ...base, "content-length": String(tam) } });
    }
    const parte = await lerTrecho(chave, ini, fim - ini + 1);
    return new Response(new Uint8Array(parte), { status: 206, headers: { ...base, "content-range": `bytes ${ini}-${fim}/${tam}`, "content-length": String(parte.length) } });
  }

  const caminho = caminhoLocal(chave);
  if (!fs.existsSync(caminho)) return new Response("arquivo não encontrado", { status: 404 });
  const tam = fs.statSync(caminho).size;
  if (range) {
    const ini = range[1] ? Number(range[1]) : 0;
    const fim = range[2] ? Math.min(Number(range[2]), tam - 1) : tam - 1;
    const s = Readable.toWeb(fs.createReadStream(caminho, { start: ini, end: fim })) as ReadableStream;
    return new Response(s, { status: 206, headers: { ...base, "content-range": `bytes ${ini}-${fim}/${tam}`, "content-length": String(fim - ini + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(caminho)) as ReadableStream, { headers: { ...base, "content-length": String(tam) } });
}
