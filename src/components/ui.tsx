import clsx from "clsx";
import { Check, Clock, Loader2, X, AlertTriangle, Sparkles } from "lucide-react";

export function Cabecalho({ kicker, titulo, sub, acoes }: { kicker: string; titulo: string; sub?: string; acoes?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="kicker">{kicker}</div>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-cinza">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Cartao({ titulo, acao, className, children }: { titulo?: React.ReactNode; acao?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={clsx("cartao p-5", className)}>
      {(titulo || acao) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-[15px] font-semibold">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

type Tom = "ok" | "alerta" | "erro" | "roxo" | "neutro";
export function Selo({ tom = "neutro", icone, children }: { tom?: Tom; icone?: React.ReactNode; children: React.ReactNode }) {
  const c = {
    ok: "bg-ok-claro text-ok",
    alerta: "bg-alerta-claro text-alerta",
    erro: "bg-erro-claro text-erro",
    roxo: "bg-roxo-claro text-roxo",
    neutro: "bg-lavanda text-cinza",
  }[tom];
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", c)}>{icone}{children}</span>;
}

export const ESTADOS: Record<string, { rotulo: string; tom: Tom }> = {
  rascunho: { rotulo: "Rascunho", tom: "neutro" },
  roteiro_gerado: { rotulo: "Roteiro pronto", tom: "roxo" },
  roteiro_aprovado: { rotulo: "Roteiro aprovado", tom: "roxo" },
  em_producao: { rotulo: "Gerando", tom: "roxo" },
  em_qa: { rotulo: "Revisão da IA", tom: "roxo" },
  aguardando_revisao: { rotulo: "Em revisão", tom: "alerta" },
  ajuste: { rotulo: "Ajuste", tom: "alerta" },
  aprovado: { rotulo: "Aprovado", tom: "ok" },
  reprovado: { rotulo: "Reprovado", tom: "erro" },
  entregue: { rotulo: "Entregue", tom: "ok" },
  pausado_custo: { rotulo: "Pausado: limite de custo", tom: "erro" },
  falha: { rotulo: "Falha", tom: "erro" },
  roteiro: { rotulo: "Roteiro", tom: "neutro" },
};

export function SeloEstado({ estado, extra }: { estado: string; extra?: string }) {
  const e = ESTADOS[estado] ?? { rotulo: estado, tom: "neutro" as Tom };
  const icone =
    e.tom === "ok" ? <Check size={11} /> : e.tom === "erro" ? <X size={11} /> : e.tom === "alerta" ? <AlertTriangle size={11} /> : estado === "rascunho" ? <Clock size={11} /> : <Sparkles size={11} />;
  return <Selo tom={e.tom} icone={icone}>{e.rotulo}{extra ? ` ${extra}` : ""}</Selo>;
}

export function Etapas({ atual, projetoId }: { atual: 1 | 2 | 3 | 4; projetoId?: string }) {
  const itens = [
    { n: 1, t: "Briefing", href: "/novo" },
    { n: 2, t: "Roteiro e voz", href: projetoId ? `/projetos/${projetoId}/roteiro` : undefined },
    { n: 3, t: "Produção", href: projetoId ? `/projetos/${projetoId}/producao` : undefined },
    { n: 4, t: "Revisão e entrega", href: projetoId ? `/projetos/${projetoId}/revisao` : undefined },
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
      {itens.map((i) => {
        const feito = i.n < atual;
        const ativo = i.n === atual;
        const conteudo = (
          <span className={clsx("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs",
            ativo ? "border-roxo bg-roxo-claro font-medium text-roxo" : feito ? "border-borda text-ok" : "border-borda text-cinza")}>
            {feito && <Check size={13} />}
            {feito ? i.t : `${i.n}. ${i.t}`}
          </span>
        );
        return i.href && (feito || ativo) && i.n > 1 ? <a key={i.n} href={i.href}>{conteudo}</a> : <span key={i.n}>{conteudo}</span>;
      })}
    </div>
  );
}

export function IconeEstadoJob({ estado }: { estado: "concluido" | "gerando" | "na_fila" | "falha" }) {
  const c = {
    concluido: ["bg-ok-claro text-ok", <Check key="c" size={16} />],
    gerando: ["bg-roxo-claro text-roxo", <Loader2 key="g" size={16} className="animate-spin" />],
    na_fila: ["bg-lavanda text-cinza", <Clock key="n" size={16} />],
    falha: ["bg-erro-claro text-erro", <X key="f" size={16} />],
  }[estado] as [string, React.ReactNode];
  return <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", c[0])}>{c[1]}</span>;
}

export const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const usd = (v: number | null | undefined) =>
  v == null ? "—" : `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function tempoRelativo(d: Date | string) {
  const dt = new Date(d);
  const min = Math.round((Date.now() - dt.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hoje = new Date();
  if (dt.toDateString() === hoje.toDateString()) return `hoje, ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const ontem = new Date(Date.now() - 86400000);
  if (dt.toDateString() === ontem.toDateString()) return "ontem";
  return dt.toLocaleDateString("pt-BR");
}

export function Logo() {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[22px] font-bold tracking-tight text-tinta">
        <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden="true">
          <path d="M2 15 L9 4 L15 12 L21 4 L28 15" fill="none" stroke="#5b3df5" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Domma
      </div>
      <div className="-mt-1 pl-9 text-[8px] font-semibold tracking-[0.3em] text-roxo">TECNOLOGIA</div>
    </div>
  );
}
