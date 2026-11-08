/**
 * Armazenamento de mídia.
 *
 * - STORAGE_DRIVER=disco (padrão local): arquivos em STORAGE_DIR.
 * - STORAGE_DRIVER=nuvem (Vercel/Railway): o disco é só um cache temporário; o
 *   original vai para o Supabase Storage (bucket "midia", se houver chave de
 *   serviço) ou, sem chave, para a tabela `arquivos` do Postgres.
 *
 * Chaves de objeto: "<workspace>/<projeto>/<arquivo>". O FFmpeg precisa de
 * arquivos locais: use `local(chave)` para ler e `publicar(chave)` depois de
 * escrever em `garantirPasta(chave)`.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { assinar, decifrar, verificarAssinatura } from "./crypto";
import { sql } from "./db";

export const nuvem = () => process.env.STORAGE_DRIVER === "nuvem";
const raiz = () => path.resolve(nuvem() ? path.join(os.tmpdir(), "ugc-midia") : process.env.STORAGE_DIR ?? "./storage");
const BUCKET = process.env.SUPABASE_BUCKET ?? "midia";

function seguro(chave: string) {
  const p = path.resolve(raiz(), chave);
  if (!p.startsWith(raiz() + path.sep)) throw new Error("caminho de mídia inválido");
  return p;
}

// ------------------------------------------------------------ Supabase Storage
let cacheChave: { valor: string | null; ate: number } | null = null;
async function chaveServico(): Promise<string | null> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (cacheChave && cacheChave.ate > Date.now()) return cacheChave.valor;
  const [r] = await sql`select chave_cifrada from chaves_api where provedor = 'supabase' limit 1`;
  const valor = r ? decifrar(r.chave_cifrada) : null;
  cacheChave = valor ? { valor, ate: Date.now() + 60_000 } : null;
  return valor;
}
const urlSupabase = () => process.env.SUPABASE_URL?.replace(/\/$/, "");

function cabecalhos(key: string): Record<string, string> {
  // Chaves novas (sb_secret_...) vão só no apikey; chaves JWT legadas também no Authorization.
  return key.startsWith("sb_") ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

async function supabase() {
  const url = urlSupabase();
  const key = url ? await chaveServico() : null;
  return url && key ? { url, key } : null;
}

const caminhoObjeto = (chave: string) => chave.split("/").map(encodeURIComponent).join("/");

export async function garantirBucket() {
  const s = await supabase();
  if (!s) return false;
  const r = await fetch(`${s.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...cabecalhos(s.key), "content-type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  return r.ok || r.status === 400 || r.status === 409; // 400/409 = já existe
}

// ------------------------------------------------------------ remoto
async function enviarRemoto(chave: string, dados: Buffer) {
  const s = await supabase();
  if (s) {
    const r = await fetch(`${s.url}/storage/v1/object/${BUCKET}/${caminhoObjeto(chave)}`, {
      method: "POST",
      headers: { ...cabecalhos(s.key), "content-type": mimeDe(chave), "x-upsert": "true" },
      body: new Uint8Array(dados),
    });
    if (!r.ok) throw new Error(`Supabase Storage respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await sql`insert into arquivos (chave, onde, tamanho, mime) values (${chave}, 'supabase', ${dados.length}, ${mimeDe(chave)})
      on conflict (chave) do update set onde = 'supabase', tamanho = excluded.tamanho, dados = null`;
    return;
  }
  await sql`insert into arquivos (chave, onde, tamanho, mime, dados) values (${chave}, 'postgres', ${dados.length}, ${mimeDe(chave)}, ${dados})
    on conflict (chave) do update set onde = 'postgres', tamanho = excluded.tamanho, dados = excluded.dados`;
}

async function baixarRemoto(chave: string): Promise<Buffer | null> {
  const [a] = await sql`select onde, dados from arquivos where chave = ${chave}`;
  if (!a) return null;
  if (a.onde === "postgres") return a.dados as Buffer;
  const s = await supabase();
  if (!s) throw new Error("arquivo está no Supabase Storage, mas a chave de serviço não está configurada");
  const r = await fetch(`${s.url}/storage/v1/object/${BUCKET}/${caminhoObjeto(chave)}`, { headers: cabecalhos(s.key) });
  if (!r.ok) throw new Error(`Supabase Storage respondeu ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Para a rota /api/midia: onde está o arquivo e como servi-lo. */
export async function infoRemota(chave: string) {
  const [a] = await sql`select onde, tamanho, mime from arquivos where chave = ${chave}`;
  return a ? { onde: a.onde as "supabase" | "postgres", tamanho: Number(a.tamanho), mime: a.mime as string } : null;
}

export async function urlSupabaseAssinada(chave: string, validadeS = 3600, download?: string) {
  const s = await supabase();
  if (!s) return null;
  const r = await fetch(`${s.url}/storage/v1/object/sign/${BUCKET}/${caminhoObjeto(chave)}`, {
    method: "POST",
    headers: { ...cabecalhos(s.key), "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: validadeS }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { signedURL: string };
  return `${s.url}/storage/v1${j.signedURL}${download ? `&download=${encodeURIComponent(download)}` : ""}`;
}

export async function lerTrecho(chave: string, inicio: number, tamanho: number): Promise<Buffer> {
  const [r] = await sql`select substring(dados from ${inicio + 1} for ${tamanho}) as parte from arquivos where chave = ${chave}`;
  return r.parte as Buffer;
}

// ------------------------------------------------------------ API pública
/** Caminho no disco (para escrever). Em nuvem é o cache temporário. */
export function caminhoLocal(chave: string) {
  return seguro(chave);
}

export async function garantirPasta(chave: string) {
  const p = seguro(chave);
  await fs.mkdir(path.dirname(p), { recursive: true });
  return p;
}

/** Envia ao armazenamento central o arquivo escrito em garantirPasta(chave). */
export async function publicar(chave: string) {
  if (nuvem()) await enviarRemoto(chave, await fs.readFile(seguro(chave)));
  return chave;
}

/** Caminho local legível do arquivo (baixa do armazenamento central se preciso). */
export async function local(chave: string): Promise<string> {
  const p = seguro(chave);
  if (existsSync(p)) return p;
  if (!nuvem()) throw new Error(`arquivo não encontrado: ${chave}`);
  const dados = await baixarRemoto(chave);
  if (!dados) throw new Error(`arquivo não encontrado: ${chave}`);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, dados);
  return p;
}

export async function salvar(chave: string, dados: Buffer | Uint8Array): Promise<string> {
  const p = await garantirPasta(chave);
  await fs.writeFile(p, dados);
  return publicar(chave);
}

export async function ler(chave: string) {
  return fs.readFile(await local(chave));
}

export async function existe(chave: string) {
  if (existsSync(seguro(chave))) return true;
  if (!nuvem()) return false;
  const [a] = await sql`select 1 from arquivos where chave = ${chave}`;
  return !!a;
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

/**
 * Link público assinado (validade curta) para provedores externos baixarem o arquivo.
 * Sem APP_URL (ambiente local), cai para data URI embutido.
 */
export async function linkExterno(chave: string, validadeS = 2 * 3600) {
  const base = process.env.APP_URL;
  if (!base || !nuvem()) return dataUri(chave, mimeDe(chave));
  return new URL(urlAssinada(chave, validadeS)!, base).toString();
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
