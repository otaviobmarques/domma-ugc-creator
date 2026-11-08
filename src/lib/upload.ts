import { novaChave, salvar } from "./storage";

const PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "audio/x-wav"];
const MAX = 15 * 1024 * 1024;

export async function salvarUpload(arquivo: File, workspaceId: string, pasta: string) {
  if (!PERMITIDOS.includes(arquivo.type)) throw new Error(`tipo de arquivo não permitido: ${arquivo.type}`);
  if (arquivo.size > MAX) throw new Error("arquivo maior que 15 MB");
  const ext = arquivo.type.split("/")[1].replace("jpeg", "jpg").replace("mpeg", "mp3").replace("x-wav", "wav");
  const chave = novaChave(workspaceId, pasta, `upload.${ext}`);
  return salvar(chave, Buffer.from(await arquivo.arrayBuffer()));
}

/** RF-01: extrai nome, descrição, preço e imagens da página do produto (Open Graph / JSON-LD). */
export async function extrairProduto(url: string) {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("URL inválida");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) throw new Error("endereço não permitido");
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; DommaUGC/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`página respondeu ${r.status}`);
  const html = (await r.text()).slice(0, 2_000_000);
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1];
  let nome = meta("og:title") ?? html.match(/<title>([^<]+)/i)?.[1]?.trim() ?? "";
  let descricao = meta("og:description") ?? meta("description") ?? "";
  let preco = meta("product:price:amount") ?? meta("og:price:amount") ?? null;
  const imagens = new Set<string>();
  const og = meta("og:image");
  if (og) imagens.add(new URL(og, u).toString());
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const itens = (Array.isArray(j) ? j : j["@graph"] ?? [j]) as Record<string, unknown>[];
      const p = itens.find((x) => String(x["@type"]).includes("Product"));
      if (!p) continue;
      nome = (p.name as string) || nome;
      descricao = (p.description as string) || descricao;
      const img = p.image;
      for (const i of (Array.isArray(img) ? img : [img]).filter(Boolean)) imagens.add(new URL(typeof i === "string" ? i : (i as { url: string }).url, u).toString());
      const of = (Array.isArray(p.offers) ? p.offers[0] : p.offers) as Record<string, unknown> | undefined;
      if (of?.price) preco = `${of.priceCurrency === "BRL" || !of.priceCurrency ? "R$ " : `${of.priceCurrency} `}${of.price}`;
    } catch {
      /* JSON-LD inválido: ignora */
    }
  }
  const dec = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return { nome: dec(nome).slice(0, 200), descricao: dec(descricao).slice(0, 2000), preco, imagens: [...imagens].slice(0, 6) };
}

export async function baixarImagem(url: string, workspaceId: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const tipo = r.headers.get("content-type")?.split(";")[0] ?? "";
  if (!r.ok || !tipo.startsWith("image/")) return null;
  const ext = tipo.split("/")[1].replace("jpeg", "jpg");
  return salvar(novaChave(workspaceId, "produtos", `importada.${ext}`), Buffer.from(await r.arrayBuffer()));
}
