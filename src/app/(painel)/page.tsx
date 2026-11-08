import { Download, Plus } from "lucide-react";
import { Cabecalho, brl, tempoRelativo } from "@/components/ui";
import { exigirSessao } from "@/lib/sessao";
import { painel } from "@/lib/consultas";
import { FiltroProjetos } from "@/components/FiltroProjetos";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function Painel() {
  const s = await exigirSessao();
  const d = await painel(s.workspaceId);
  const mes = MESES[new Date().getMonth()];
  const variacao = d.entregues_ant ? Math.round(((d.entregues - d.entregues_ant) / d.entregues_ant) * 100) : null;
  const kpis = [
    { t: "Vídeos entregues no mês", v: String(d.entregues), sub: variacao == null ? "primeiro mês" : `${variacao >= 0 ? "Mais" : "Menos"} ${Math.abs(variacao)}% que o mês anterior`, cor: "text-ok" },
    { t: "Em produção agora", v: String(d.em_producao), sub: `${d.aguardando} aguardando revisão`, cor: "text-roxo" },
    { t: "Custo médio por vídeo", v: brl(d.custo_medio), sub: "APIs e armazenamento", cor: "text-cinza" },
    { t: "Aprovação na 1ª versão", v: d.aprovacao_1a == null ? "—" : `${Math.round(d.aprovacao_1a * 100)}%`, sub: "Meta: 80%", cor: "text-alerta" },
  ];
  return (
    <>
      <Cabecalho kicker="Painel" titulo={`Produção de ${mes}`} sub={`Todos os clientes do workspace ${s.workspaceNome}`}
        acoes={<>
          <a href="/api/custos?formato=csv" className="btn-secundario"><Download size={15} /> Exportar</a>
          <a href="/novo" className="btn-primario"><Plus size={15} /> Criar UGC</a>
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.t} className="cartao p-4">
            <div className="text-xs text-cinza">{k.t}</div>
            <div className="mt-1 text-[26px] font-semibold">{k.v}</div>
            <div className={`text-[11px] ${k.cor}`}>{k.sub}</div>
          </div>
        ))}
      </div>
      <FiltroProjetos titulo="Projetos recentes" projetos={d.projetos.map((p) => ({
        id: p.id, titulo: p.titulo, marca: p.marca, formato: `${p.formato} · ${p.duracao_s} s`, n: p.n_variacoes, estado: p.estado,
        extra: p.estado === "em_producao" && p.progresso ? `${p.progresso}%` : undefined,
        falha: p.falhas ? `Falha ${p.etapa_falha ? `no ${p.etapa_falha}` : ""}` : undefined,
        custo: p.custo ? brl(p.custo) : "—", quando: tempoRelativo(p.atualizado_em),
      }))} />
    </>
  );
}
