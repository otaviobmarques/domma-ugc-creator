"use client";
import { useState } from "react";

export function Assinar({ token, titular }: { token: string; titular: string }) {
  const [feito, setFeito] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function assinar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch(`/api/termo/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: f.get("nome"), documento: f.get("documento"), aceite: f.get("aceite") === "on" }) });
    const j = await r.json();
    if (r.ok) setFeito(j.codigo);
    else setErro(j.erro);
  }
  if (feito) return <div className="mt-4 rounded-lg bg-ok-claro p-4 text-sm text-ok">Termo assinado. Código do documento: <b>{feito}</b>. Guarde este código.</div>;
  return (
    <form onSubmit={assinar} className="mt-4 space-y-3">
      <div><label className="rotulo">Nome completo</label><input name="nome" className="campo" defaultValue={titular} required /></div>
      <div><label className="rotulo">CPF</label><input name="documento" className="campo" required inputMode="numeric" /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="aceite" required className="mt-1" /> Li e autorizo o uso da minha imagem nos termos acima.</label>
      {erro && <p className="text-sm text-erro">{erro}</p>}
      <button className="btn-primario w-full">Assinar eletronicamente</button>
      <p className="text-[11px] text-cinza">Registramos data, hora, IP e um código do documento como prova da assinatura.</p>
    </form>
  );
}
