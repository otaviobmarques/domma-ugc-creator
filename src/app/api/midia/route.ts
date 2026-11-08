import fs from "node:fs";
import { Readable } from "node:stream";
import { caminhoLocal, existe, mimeDe, validarToken } from "@/lib/storage";

/** Serve arquivos privados por URL assinada de validade curta (com suporte a Range para o player). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const chave = validarToken(url.searchParams.get("t") ?? "");
  if (!chave || !(await existe(chave))) return new Response("link expirado ou inválido", { status: 403 });
  const caminho = caminhoLocal(chave);
  const tam = fs.statSync(caminho).size;
  const tipo = mimeDe(chave);
  const nome = url.searchParams.get("download");
  const base: Record<string, string> = { "content-type": tipo, "accept-ranges": "bytes", "cache-control": "private, max-age=600" };
  if (nome) base["content-disposition"] = `attachment; filename="${nome.replace(/[^\w.\-]/g, "_")}"`;
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const ini = range[1] ? Number(range[1]) : 0;
    const fim = range[2] ? Math.min(Number(range[2]), tam - 1) : tam - 1;
    const s = Readable.toWeb(fs.createReadStream(caminho, { start: ini, end: fim })) as ReadableStream;
    return new Response(s, { status: 206, headers: { ...base, "content-range": `bytes ${ini}-${fim}/${tam}`, "content-length": String(fim - ini + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(caminho)) as ReadableStream, { headers: { ...base, "content-length": String(tam) } });
}
