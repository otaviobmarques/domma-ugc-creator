import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { assinar, verificarAssinatura } from "./crypto";

/**
 * Armazenamento de mídia. Implementação em disco local; a interface
 * (salvar / caminhoLocal / urlAssinada) é a mesma que um adaptador de
 * Supabase Storage ou Cloudflare R2 precisa expor.
 * Chaves de objeto: "<workspace>/<projeto>/<arquivo>".
 */
const raiz = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

function seguro(chave: string) {
  const p = path.resolve(raiz(), chave);
  if (!p.startsWith(raiz() + path.sep)) throw new Error("caminho de mídia inválido");
  return p;
}

export async function salvar(chave: string, dados: Buffer | Uint8Array): Promise<string> {
  const p = seguro(chave);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, dados);
  return chave;
}

export function caminhoLocal(chave: string) {
  return seguro(chave);
}

export async function garantirPasta(chave: string) {
  const p = seguro(chave);
  await fs.mkdir(path.dirname(p), { recursive: true });
  return p;
}

export async function ler(chave: string) {
  return fs.readFile(seguro(chave));
}

export async function existe(chave: string) {
  try {
    await fs.access(seguro(chave));
    return true;
  } catch {
    return false;
  }
}

export function novaChave(workspaceId: string, projetoId: string, nome: string) {
  return `${workspaceId}/${projetoId}/${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${nome}`;
}

/** URL assinada de validade curta (padrão 1 h) para servir arquivos privados. */
export function urlAssinada(chave: string | null | undefined, validadeS = 3600): string | null {
  if (!chave) return null;
  if (/^https?:\/\//.test(chave)) return chave;
  const exp = Math.floor(Date.now() / 1000) + validadeS;
  const token = assinar(`${chave}|${exp}`);
  return `/api/midia?t=${encodeURIComponent(token)}`;
}

export function validarToken(token: string): string | null {
  const valor = verificarAssinatura(token);
  if (!valor) return null;
  const i = valor.lastIndexOf("|");
  const chave = valor.slice(0, i);
  const exp = Number(valor.slice(i + 1));
  if (!exp || exp < Date.now() / 1000) return null;
  return chave;
}

export async function dataUri(chave: string, mime: string) {
  const b = await ler(chave);
  return `data:${mime};base64,${b.toString("base64")}`;
}

export function mimeDe(chave: string) {
  const ext = path.extname(chave).toLowerCase();
  return (
    {
      ".mp4": "video/mp4",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".srt": "application/x-subrip",
      ".zip": "application/zip",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}
