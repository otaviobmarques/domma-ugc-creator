import crypto from "node:crypto";

function masterKey(): Buffer {
  const b64 = process.env.MASTER_KEY;
  if (!b64) throw new Error("MASTER_KEY não configurada");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("MASTER_KEY precisa ter 32 bytes em base64");
  return key;
}

/** Cifra uma chave de API com AES-256-GCM. Formato: v1.<iv>.<tag>.<dados> (base64url). */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrar(blob: string): string {
  const [v, iv, tag, dados] = blob.split(".");
  if (v !== "v1") throw new Error("formato de chave cifrada desconhecido");
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}

const segredo = () => process.env.APP_SECRET ?? "dev-secret";

export function assinar(valor: string): string {
  const mac = crypto.createHmac("sha256", segredo()).update(valor).digest("base64url");
  return `${valor}.${mac}`;
}

export function verificarAssinatura(assinado: string): string | null {
  const i = assinado.lastIndexOf(".");
  if (i < 0) return null;
  const valor = assinado.slice(0, i);
  const esperado = assinar(valor);
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinado);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? valor : null;
}

export function tokenAleatorio(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 32);
  return `scrypt.${salt.toString("base64url")}.${h.toString("base64url")}`;
}

export function conferirSenha(senha: string, armazenado: string): boolean {
  const [, salt, h] = armazenado.split(".");
  if (!salt || !h) return false;
  const calc = crypto.scryptSync(senha, Buffer.from(salt, "base64url"), 32);
  const esperado = Buffer.from(h, "base64url");
  return calc.length === esperado.length && crypto.timingSafeEqual(calc, esperado);
}

export function sha256(dados: string | Buffer) {
  return crypto.createHash("sha256").update(dados).digest("hex");
}
