"use client";
import { useState } from "react";
import { Logo } from "@/components/ui";

export default function Login() {
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCarregando(true);
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: f.get("email"), senha: f.get("senha") }) });
    setCarregando(false);
    if (r.ok) location.href = "/";
    else setErro((await r.json()).erro);
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-lavanda px-4">
      <form onSubmit={entrar} className="cartao w-full max-w-sm p-7">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold">Entrar no UGC Creator</h1>
        <label className="rotulo mt-5" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required className="campo" autoComplete="username" />
        <label className="rotulo mt-3" htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" required className="campo" autoComplete="current-password" />
        {erro && <p className="mt-3 text-sm text-erro">{erro}</p>}
        <button className="btn-primario mt-5 w-full" disabled={carregando}>{carregando ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}
