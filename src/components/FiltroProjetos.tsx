"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronRight, FolderOpen, User, X } from "lucide-react";
import { Selo, SeloEstado } from "./ui";

export interface LinhaProjeto {
  id: string;
  titulo: string;
  marca: string;
  produto: string;
  ator: string;
  foto: string | null;
  formato: string;
  n: number;
  estado: string;
  progresso: number;
  falha?: string;
  aprovadas: number;
  custo: string;
  quando: string;
}

const FILTROS: { id: string; t: string; estados: string[] | null; falha?: boolean }[] = [
  { id: "todos", t: "Todos", estados: null },
  { id: "producao", t: "Em produção", estados: ["roteiro_aprovado", "em_producao", "em_qa", "pausado_custo"] },
  { id: "revisao", t: "Em revisão", estados: ["aguardando_revisao", "ajuste"] },
  { id: "rascunho", t: "Roteiro", estados: ["rascunho", "roteiro_gerado"] },
  { id: "aprovados", t: "Aprovados", estados: ["aprovado", "entregue"] },
  { id: "falha", t: "Com falha", estados: null, falha: true },
];

export function FiltroProjetos({ titulo, projetos, acao }: { titulo: string; projetos: LinhaProjeto[]; acao?: React.ReactNode }) {
  const [filtro, setFiltro] = useState("todos");
  const passa = (f: (typeof FILTROS)[number], p: LinhaProjeto) => (f.falha ? !!p.falha : !f.estados || f.estados.includes(p.estado));
  const contagem = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id, projetos.filter((p) => passa(f, p)).length])), [projetos]);
  const atual = FILTROS.find((f) => f.id === filtro)!;
  const lista = projetos.filter((p) => passa(atual, p));

  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-borda px-5 pb-3">
        {FILTROS.filter((f) => f.id === "todos" || contagem[f.id] > 0).map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={clsx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
              filtro === f.id ? "bg-tinta text-white" : "bg-fundo text-tinta-2 hover:bg-roxo-claro")}>
            {f.t}
            <span className={clsx("rounded-full px-1.5 text-[10px]", filtro === f.id ? "bg-white/20" : "bg-white text-cinza")}>{contagem[f.id]}</span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-roxo-claro text-roxo"><FolderOpen size={22} /></span>
          <p className="mt-3 text-sm font-medium">{projetos.length ? "Nenhum projeto neste filtro" : "Nenhum projeto ainda"}</p>
          {!projetos.length && <a className="btn-primario mt-4" href="/novo">Criar o primeiro UGC</a>}
        </div>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.map((p) => (
            <li key={p.id}>
              <a href={`/projetos/${p.id}`} className="group grid grid-cols-[44px_1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition hover:bg-fundo md:grid-cols-[44px_minmax(0,1fr)_150px_84px_76px_16px]">
                <span className="relative row-span-2 flex h-[58px] w-11 items-center justify-center overflow-hidden rounded-lg bg-roxo-claro text-roxo md:row-span-1">
                  {p.foto ? <img src={p.foto} alt="" className="h-full w-full object-cover" loading="lazy" /> : <User size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold group-hover:text-roxo">{p.titulo}</span>
                  <span className="block truncate text-xs text-cinza">
                    {p.marca} · {p.ator} · {p.formato} · {p.n} variaç{p.n === 1 ? "ão" : "ões"}{p.aprovadas ? ` · ${p.aprovadas} aprovada${p.aprovadas === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
                <span className="col-start-2 md:col-start-auto">
                  {p.falha ? <Selo tom="erro" icone={<X size={11} />}>{p.falha}</Selo> : <SeloEstado estado={p.estado} />}
                  {["em_producao", "em_qa"].includes(p.estado) && !p.falha && (
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-roxo-claro">
                        <span className="block h-full rounded-full bg-roxo transition-all" style={{ width: `${Math.max(4, p.progresso)}%` }} />
                      </span>
                      <span className="text-[10px] text-cinza">{p.progresso}%</span>
                    </span>
                  )}
                </span>
                <span className="hidden text-right font-mono text-xs text-tinta-2 md:block">{p.custo}</span>
                <span className="row-start-1 text-right text-[11px] text-cinza md:row-start-auto">{p.quando}</span>
                <ChevronRight size={16} className="hidden text-cinza/50 transition group-hover:translate-x-0.5 group-hover:text-roxo md:block" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
