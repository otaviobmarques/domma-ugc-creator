import { Plus } from "lucide-react";
import { Cabecalho, brl, tempoRelativo } from "@/components/ui";
import { FiltroProjetos } from "@/components/FiltroProjetos";
import { exigirSessao } from "@/lib/sessao";
import { painel } from "@/lib/consultas";

export default async function Projetos() {
  const s = await exigirSessao();
  const d = await painel(s.workspaceId);
  return (
    <>
      <Cabecalho kicker="Projetos" titulo="Todos os projetos" acoes={<a href="/novo" className="btn-primario"><Plus size={15} /> Criar UGC</a>} />
      <FiltroProjetos titulo={`${d.projetos.length} projetos`} projetos={d.projetos.map((p) => ({
        id: p.id, titulo: p.titulo, marca: p.marca, formato: `${p.formato} · ${p.duracao_s} s`, n: p.n_variacoes, estado: p.estado,
        extra: p.estado === "em_producao" && p.progresso ? `${p.progresso}%` : undefined, falha: p.falhas ? "Falha" : undefined,
        custo: p.custo ? brl(p.custo) : "—", quando: tempoRelativo(p.atualizado_em),
      }))} />
    </>
  );
}
