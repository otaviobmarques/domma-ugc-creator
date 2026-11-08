"use client";
import { useState } from "react";
import { Filter, X } from "lucide-react";
import { ESTADOS, Selo, SeloEstado } from "./ui";

interface Linha { id: string; titulo: string; marca: string; formato: string; n: number; estado: string; extra?: string; falha?: string; custo: string; quando: string }

export function FiltroProjetos({ titulo, projetos }: { titulo: string; projetos: Linha[] }) {
  const [filtro, setFiltro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const lista = filtro ? projetos.filter((p) => p.estado === filtro) : projetos;
  const estados = [...new Set(projetos.map((p) => p.estado))];
  return (
    <section className="cartao mt-5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        <div className="relative">
          <button className="btn-secundario py-1.5" onClick={() => setAberto(!aberto)}><Filter size={14} /> {filtro ? ESTADOS[filtro]?.rotulo : "Filtrar"}</button>
          {aberto && (
            <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-borda bg-white p-1 shadow-lg">
              <button className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-lavanda" onClick={() => { setFiltro(null); setAberto(false); }}>Todos</button>
              {estados.map((e) => (
                <button key={e} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-lavanda" onClick={() => { setFiltro(e); setAberto(false); }}>{ESTADOS[e]?.rotulo ?? e}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-cinza">Nenhum projeto ainda. <a className="text-roxo underline" href="/novo">Crie o primeiro UGC</a>.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-cinza">
                <th className="py-2 font-medium">Projeto</th><th className="font-medium">Cliente</th><th className="font-medium">Formato</th>
                <th className="text-right font-medium">Variações</th><th className="pl-6 font-medium">Status</th><th className="text-right font-medium">Custo</th><th className="pl-6 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="border-t border-borda hover:bg-lavanda/60">
                  <td className="py-3"><a href={`/projetos/${p.id}`} className="flex items-center gap-3 font-medium"><span className="h-8 w-6 shrink-0 rounded bg-roxo-claro" />{p.titulo}</a></td>
                  <td className="text-cinza">{p.marca}</td>
                  <td className="text-cinza">{p.formato}</td>
                  <td className="text-right">{p.n}</td>
                  <td className="pl-6">{p.falha ? <Selo tom="erro" icone={<X size={11} />}>{p.falha}</Selo> : <SeloEstado estado={p.estado} extra={p.extra} />}</td>
                  <td className="text-right font-mono text-xs">{p.custo}</td>
                  <td className="pl-6 text-xs text-cinza">{p.quando}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
