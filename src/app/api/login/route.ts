import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { conferirSenha } from "@/lib/crypto";
import { criarSessao } from "@/lib/sessao";

export async function POST(req: Request) {
  const { email, senha } = (await req.json()) as { email: string; senha: string };
  const [u] = await sql`select u.id, u.senha_hash, m.workspace_id from usuarios u join membros m on m.usuario_id = u.id
    where lower(u.email) = lower(${email ?? ""}) order by m.workspace_id limit 1`;
  if (!u || !conferirSenha(senha ?? "", u.senha_hash)) return NextResponse.json({ erro: "e-mail ou senha incorretos" }, { status: 401 });
  await criarSessao(u.id, u.workspace_id);
  return NextResponse.json({ ok: true });
}
