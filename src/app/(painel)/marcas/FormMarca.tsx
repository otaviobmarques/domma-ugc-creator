"use client";
import { useState } from "react";
import { Plus } from "lucide-react";

export function FormMarca({ marca }: { marca?: { id: string; nome: string; diretrizes: string; termos_vetados: string } }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!aberto) return marca ? <button className="mt-3 text-xs text-roxo underline" onClick={() => setAberto(true)}>Editar</button>
    : <button className="btn-primario" onClick={() => setAberto(true)}><Plus size={15} /> Nova marca</button>;
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await fetch("/api/marcas", { method: "POST", body: new FormData(e.currentTarget) });
    if (r.ok) location.reload();
    else setErro((await r.json()).erro);
  }
  return (
    <form onSubmit={enviar} className={`${marca ? "mt-3" : "cartao p-5"} grid gap-3 md:grid-cols-2`}>
      {marca && <input type="hidden" name="id" value={marca.id} />}
      <div><label className="rotulo">Nome</label><input name="nome" className="campo" defaultValue={marca?.nome} required /></div>
      <div><label className="rotulo">Termos vetados (separados por vírgula)</label><input name="termos_vetados" className="campo" defaultValue={marca?.termos_vetados} /></div>
      <div className="md:col-span-2"><label className="rotulo">Diretrizes</label><textarea name="diretrizes" rows={2} className="campo" defaultValue={marca?.diretrizes} /></div>
      <div><label className="rotulo">Logo (PNG)</label><input name="logo" type="file" accept="image/png,image/webp" className="campo py-1.5" /></div>
      <div><label className="rotulo">Músicas permitidas (MP3)</label><input name="musicas" type="file" accept="audio/mpeg" multiple className="campo py-1.5" /></div>
      {erro && <p className="text-sm text-erro md:col-span-2">{erro}</p>}
      <div className="flex gap-2 md:col-span-2"><button className="btn-primario">Salvar</button><button type="button" className="btn-secundario" onClick={() => setAberto(false)}>Cancelar</button></div>
    </form>
  );
}
