import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { sql } from "./db";
import { assinar, verificarAssinatura } from "./crypto";

export type Papel = "admin" | "produtor" | "revisor" | "cliente";
export interface Sessao {
  usuarioId: string;
  email: string;
  nome: string;
  workspaceId: string;
  workspaceNome: string;
  papel: Papel;
}

const COOKIE = "ugc_sessao";

export async function criarSessao(usuarioId: string, workspaceId: string) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  (await cookies()).set(COOKIE, assinar(`${usuarioId}|${workspaceId}|${exp}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE);
}

export async function sessaoAtual(): Promise<Sessao | null> {
  const bruto = (await cookies()).get(COOKIE)?.value;
  if (!bruto) return null;
  const valor = verificarAssinatura(bruto);
  if (!valor) return null;
  const [usuarioId, workspaceId, exp] = valor.split("|");
  if (Number(exp) < Date.now() / 1000) return null;
  const [r] = await sql`
    select u.id, u.email, u.nome, m.papel, w.nome as ws_nome
    from usuarios u join membros m on m.usuario_id = u.id join workspaces w on w.id = m.workspace_id
    where u.id = ${usuarioId} and m.workspace_id = ${workspaceId}`;
  if (!r) return null;
  return { usuarioId: r.id, email: r.email, nome: r.nome, workspaceId, workspaceNome: r.ws_nome, papel: r.papel };
}

/** Para páginas: redireciona ao login. */
export async function exigirSessao(papeis?: Papel[]): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (papeis && !papeis.includes(s.papel)) redirect("/");
  return s;
}

export class ErroHttp extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

/** Para rotas de API. */
export async function exigirApi(papeis?: Papel[]): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) throw new ErroHttp(401, "não autenticado");
  if (papeis && !papeis.includes(s.papel)) throw new ErroHttp(403, "sem permissão para esta ação");
  return s;
}

export const ator = (s: Sessao) => `usuario:${s.email}`;

/** Envolve um handler de rota com tratamento de erro padrão. */
export function rota<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ErroHttp) return NextResponse.json({ erro: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ erro: e instanceof Error ? e.message : "erro interno" }, { status: 500 });
    }
  };
}

/** Garante que o recurso pertence ao workspace da sessão. */
export async function doWorkspace(tabela: "projetos" | "variacoes" | "atores" | "produtos" | "marcas" | "consentimentos", id: string, s: Sessao) {
  const [r] = await sql`select workspace_id from ${sql(tabela)} where id = ${id}`;
  if (!r || r.workspace_id !== s.workspaceId) throw new ErroHttp(404, "não encontrado");
}
