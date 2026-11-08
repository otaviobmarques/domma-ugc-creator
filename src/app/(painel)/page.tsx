import { AlertTriangle, CheckCircle2, Download, Plus, Sparkles, Target, Wallet } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { brl, tempoRelativo } from "@/components/ui";
import { FiltroProjetos } from "@/components/FiltroProjetos";
import { exigirSessao } from "@/lib/sessao";
import { painel } from "@/lib/consultas";
import { linhasProjeto } from "@/lib/linhasProjeto";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function saudacao() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Medidor({ pct, tom = "roxo", meta }: { pct: number; tom?: "roxo" | "alerta"; meta?: number }) {
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-fundo">
      <div className={clsx("h-full rounded-full", tom === "alerta" ? "bg-alerta" : "bg-roxo")} style={{ width: `${Math.min(100, Math.max(pct > 0 ? 3 : 0, pct))}%` }} />
      {meta != null && <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-tinta/40" style={{ left: `${meta}%` }} title={`Meta: ${meta}%`} />}
    </div>
  );
}

function Indicador({ titulo, valor, icone, cor, children }: { titulo: string; valor: string; icone: React.ReactNode; cor: string; children?: React.ReactNode }) {
  return (
    <div className="cartao p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-cinza">{titulo}</div>
        <span className={clsx("flex h-8 w-8 items-center justify-center rounded-xl", cor)}>{icone}</span>
      </div>
      <div className="mt-1 text-[30px] font-semibold leading-none tracking-tight">{valor}</div>
      {children}
    </div>
  );
}

export default async function Painel() {
  const s = await exigirSessao();
  const d = await painel(s.workspaceId);
  const agora = new Date();
  const mes = MESES[agora.getMonth()];
  const dataHoje = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  const variacao = d.entregues_ant ? Math.round(((d.entregues - d.entregues_ant) / d.entregues_ant) * 100) : null;
  const pctOrcamento = d.limite_mensal ? (d.custo_mes / d.limite_mensal) * 100 : 0;
  const aprovacao = d.aprovacao_1a == null ? null : Math.round(d.aprovacao_1a * 100);
  const emAndamento = d.projetos.filter((p) => ["em_producao", "em_qa", "pausado_custo"].includes(p.estado)).slice(0, 5);
  const podeCriar = ["admin", "produtor"].includes(s.papel);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker first-letter:uppercase">{dataHoje}</div>
          <h1 className="mt-1.5 text-[30px] font-semibold leading-tight tracking-tight">{saudacao()}, {s.nome.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-cinza">Produção de {mes} · todos os clientes do workspace {s.workspaceNome}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/custos?formato=csv" className="btn-secundario"><Download size={15} /> Exportar custos</a>
          {podeCriar && <a href="/novo" className="btn-primario"><Plus size={16} /> Criar UGC</a>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Vídeos entregues no mês" valor={String(d.entregues)} icone={<CheckCircle2 size={16} />} cor="bg-ok-claro text-ok">
          <p className="mt-3 text-xs text-cinza">
            {variacao == null ? "Primeiro mês de produção" : `${variacao >= 0 ? "+" : ""}${variacao}% em relação a ${MESES[(agora.getMonth() + 11) % 12]}`}
          </p>
        </Indicador>
        <Indicador titulo="Em produção agora" valor={String(d.em_producao)} icone={<Sparkles size={16} />} cor="bg-roxo-claro text-roxo">
          <p className="mt-3 text-xs text-cinza">
            {d.aguardando ? <Link href="/projetos" className="font-medium text-roxo hover:underline">{d.aguardando} aguardando sua revisão</Link> : "Nada aguardando revisão"}
          </p>
        </Indicador>
        <Indicador titulo="Gasto do mês" valor={brl(d.custo_mes)} icone={<Wallet size={16} />} cor="bg-fundo text-tinta-2">
          <Medidor pct={pctOrcamento} tom={pctOrcamento >= 80 ? "alerta" : "roxo"} />
          <p className="mt-2 flex items-center gap-1 text-xs text-cinza">
            {pctOrcamento >= 80 && <AlertTriangle size={12} className="text-alerta" />}
            {Math.round(pctOrcamento)}% de {brl(d.limite_mensal)} · média {brl(d.custo_medio)}/vídeo
          </p>
        </Indicador>
        <Indicador titulo="Aprovação na 1ª versão" valor={aprovacao == null ? "—" : `${aprovacao}%`} icone={<Target size={16} />} cor="bg-alerta-claro text-alerta">
          <Medidor pct={aprovacao ?? 0} meta={80} />
          <p className="mt-2 text-xs text-cinza">{aprovacao == null ? "Sem revisões concluídas ainda · meta 80%" : `Meta: 80%${aprovacao >= 80 ? " · atingida" : ""}`}</p>
        </Indicador>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <FiltroProjetos titulo="Projetos recentes" projetos={linhasProjeto(d.projetos)}
          acao={<Link href="/projetos" className="text-xs font-medium text-roxo hover:underline">Ver todos</Link>} />

        <div className="space-y-5">
          <section className="cartao p-5">
            <h2 className="text-[15px] font-semibold">Em andamento</h2>
            {emAndamento.length === 0 ? (
              <p className="mt-3 text-sm text-cinza">Nenhum vídeo sendo gerado agora.</p>
            ) : (
              <ul className="mt-3 space-y-3.5">
                {emAndamento.map((p) => (
                  <li key={p.id}>
                    <a href={`/projetos/${p.id}/producao`} className="group block">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium group-hover:text-roxo">{p.titulo}</span>
                        <span className="shrink-0 text-xs text-cinza">{p.estado === "pausado_custo" ? "pausado" : `${p.progresso}%`}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fundo">
                        <div className={clsx("h-full rounded-full", p.estado === "pausado_custo" ? "bg-alerta" : "bg-roxo")} style={{ width: `${Math.max(4, p.progresso)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-cinza">{p.marca} · {p.n_variacoes} variações</div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles size={15} className="text-roxo" /> O que a IA fez</h2>
            {d.atividade.length === 0 ? (
              <p className="mt-3 text-sm text-cinza">As decisões do agente aparecem aqui.</p>
            ) : (
              <ol className="relative mt-4 space-y-4 border-l border-borda pl-4">
                {d.atividade.map((a, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-roxo ring-4 ring-white" />
                    <p className="line-clamp-2 text-[13px] leading-snug text-tinta-2">{a.mensagem}</p>
                    <p className="mt-0.5 text-[11px] text-cinza">
                      {a.projeto_id ? <a href={`/projetos/${a.projeto_id}`} className="hover:text-roxo">{a.titulo}</a> : null}
                      {a.projeto_id ? " · " : ""}{tempoRelativo(a.criado_em)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
