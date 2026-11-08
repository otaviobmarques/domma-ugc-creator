"use client";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

export function NovoProduto({ marcas }: { marcas: { id: string; nome: string }[] }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const r = await fetch("/api/produtos/importar", { method: "POST", body: new FormData(e.currentTarget) });
    setOcupado(false);
    if (r.ok) location.reload();
    else setErro((await r.json()).erro);
  }
  return (
    <form onSubmit={enviar} className="cartao grid gap-3 p-5 md:grid-cols-6">
      <div><label className="rotulo">Marca</label><select name="marca_id" className="campo">{marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
      <div className="md:col-span-2"><label className="rotulo">Link da página (opcional)</label><input name="url" className="campo" placeholder="https://loja..." /></div>
      <div><label className="rotulo">Nome</label><input name="nome" className="campo" placeholder="se não houver link" /></div>
      <div><label className="rotulo">Fotos (até 10)</label><input name="fotos" type="file" accept="image/*" multiple className="campo py-1.5" /></div>
      <div className="flex items-end"><button className="btn-primario w-full" disabled={ocupado}>{ocupado ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar</button></div>
      <div className="md:col-span-6"><label className="rotulo">Descrição</label><input name="descricao" className="campo" placeholder="preenchida automaticamente pelo link" /></div>
      {erro && <p className="md:col-span-6 text-sm text-erro">{erro}</p>}
    </form>
  );
}
