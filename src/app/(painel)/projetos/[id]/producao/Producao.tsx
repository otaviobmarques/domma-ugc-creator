"use client";
import { useEffect, useState } from "react";
import { Eye, X, Check, Clock, Loader2, AlertTriangle } from "lucide-react";
import { Cabecalho, Etapas, IconeEstadoJob, Selo, brl } from "@/components/ui";
import type { StatusProjeto } from "@/lib/consultas";

const ETAPAS: Record<string, { t: string; d: (r: Resumo, s: StatusProjeto) => string }> = {
  narracao: { t: "Narração", d: (r) => `${prov(r)}` },
  imagem: { t: "Imagem-chave com produto", d: (r) => r.falhas ? `A revisão de qualidade pediu para refazer ${r.falhas} imagem(ns)` : prov(r) },
  lipsync: { t: "Fala com lip-sync", d: (r) => `${prov(r)}${r.gerando ? " · gerando" : ""}` },
  broll: { t: "B-roll do produto", d: (r, s) => `${prov(r)} · ${s.projeto.qualidade}` },
  montagem: { t: "Montagem e legendas", d: (r) => (r.concluidos || r.ativos ? "FFmpeg · legendas, música, logo e selo de IA" : "Começa quando as etapas 3 e 4 terminarem") },
  qa: { t: "Revisão de qualidade pela IA", d: () => "Rosto, mãos, produto, sincronia e legendas" },
};
type Resumo = StatusProjeto["resumo"][number];
const NOMES: Record<string, string> = { elevenlabs: "ElevenLabs", simulador: "Simulador", "fal-kling-avatar": "Kling Avatar", "fal-kling-avatar-pro": "Kling Avatar Pro", "fal-omnihuman": "OmniHuman", "fal-seedance": "Seedance", "fal-kling-i2v": "Kling", "fal-nano-banana": "Nano Banana", "openai-image": "GPT Image", anthropic: "Claude", ffmpeg: "FFmpeg" };
const prov = (r: Resumo) => r.provedores.map((p) => NOMES[p] ?? p).join(" → ") || "aguardando";
const ROT_ETAPA: Record<string, string> = { narracao: "Narração", imagem: "Imagens", lipsync: "Lip-sync", broll: "B-roll", montagem: "Montagem", qa: "Revisão IA", roteiro: "Roteiro", ajuste: "Ajustes", previa_voz: "Prévia de voz", checagem_foto: "Checagem de foto" };

export function Producao({ id, inicial, podeEditar }: { id: string; inicial: StatusProjeto; podeEditar: boolean }) {
  const [s, setS] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch(`/api/projetos/${id}/status`);
      if (r.ok) setS(await r.json());
    }, 2000);
    return () => clearInterval(t);
  }, [id]);

  const p = s.projeto;
  const pronto = ["aguardando_revisao", "aprovado", "reprovado", "entregue"].includes(p.estado);
  const custo = s.custo!;
  const previsao = { min: Math.max(custo.total, Number(p.custo_estimado_min ?? 0)), max: Math.max(custo.total, Number(p.custo_estimado_max ?? 0)) };
  const falhas = s.variacoes.filter((v) => v.estado === "falha");

  async function cancelar() {
    if (!confirm("Cancelar a produção? O que já foi gerado continua salvo.")) return;
    const r = await fetch(`/api/projetos/${id}/cancelar`, { method: "POST" });
    if (r.ok) location.href = `/projetos/${id}/roteiro`;
  }
  async function continuar() {
    const v = prompt(`Novo limite de custo do projeto (gasto atual ${brl(custo.total)}):`, String(Math.ceil(custo.limite * 1.5)));
    if (!v) return;
    const r = await fetch(`/api/projetos/${id}/continuar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ novo_limite: Number(v.replace(",", ".")) }) });
    if (!r.ok) setErro((await r.json()).erro);
  }

  return (
    <>
      <Cabecalho kicker="Novo UGC" titulo={pronto ? "Produção concluída" : "Produção em andamento"}
        sub={`${p.produto_nome} · ${s.variacoes.length} variações. ${pronto ? "Tudo pronto para revisão." : "Você pode sair desta tela: a produção continua."}`}
        acoes={<>
          {podeEditar && !pronto && <button className="btn-perigo" onClick={cancelar}><X size={15} /> Cancelar produção</button>}
          <a className={pronto ? "btn-primario" : "btn-secundario"} href={`/projetos/${id}/revisao`}><Eye size={15} /> Ver revisão</a>
        </>} />
      <Etapas atual={3} projetoId={id} />
      {erro && <div className="mb-4 rounded-lg bg-erro-claro px-4 py-2.5 text-sm text-erro">{erro}</div>}
      {p.estado === "pausado_custo" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-erro-claro px-4 py-3 text-sm text-erro">
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> O projeto atingiu o limite de custo ({brl(custo.limite)}). A IA parou e pediu sua aprovação.</span>
          {podeEditar && <button className="btn-primario" onClick={continuar}>Aprovar novo limite</button>}
        </div>
      )}
      {falhas.map((v) => (
        <div key={v.id} className="mb-4 flex items-center gap-2 rounded-lg bg-alerta-claro px-4 py-3 text-sm text-alerta"><AlertTriangle size={16} /> Variação {v.letra}: {v.observacao}</div>
      ))}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-2.5">
          {s.resumo.map((r) => {
            const e = ETAPAS[r.etapa];
            const concluida = r.concluidos >= r.total && r.total > 0;
            const estado = concluida ? "concluido" : r.ativos ? (r.gerando ? "gerando" : "na_fila") : r.concluidos ? "gerando" : "na_fila";
            return (
              <div key={r.etapa} className="cartao flex items-center gap-4 p-4">
                <IconeEstadoJob estado={estado as "concluido"} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-semibold">{e.t}</span> <span className="text-cinza">· {r.concluidos} de {r.total}</span></div>
                  {estado === "gerando" && (
                    <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-roxo-claro">
                      <div className="h-full rounded-full bg-roxo transition-all" style={{ width: `${Math.max(8, ((r.concluidos + r.progresso / 100 * Math.max(1, r.gerando)) / r.total) * 100)}%` }} />
                    </div>
                  )}
                  <div className="truncate text-xs text-cinza">{e.d(r, s)}</div>
                </div>
                {concluida ? <Selo tom="ok" icone={<Check size={11} />}>Concluído</Selo>
                  : estado === "gerando" ? <Selo tom="roxo" icone={<Loader2 size={11} className="animate-spin" />}>Gerando</Selo>
                  : <Selo icone={<Clock size={11} />}>Na fila</Selo>}
              </div>
            );
          })}
        </div>
        <div className="space-y-4">
          <section className="cartao p-5">
            <div className="text-sm font-semibold">Custo até agora</div>
            <div className="mt-1 text-[28px] font-semibold">{brl(custo.total)}</div>
            <div className="text-xs text-cinza">Previsão ao final: {brl(previsao.min)} a {brl(previsao.max)} · limite {brl(custo.limite)}</div>
            <div className="mt-4 divide-y divide-borda text-sm">
              {custo.porEtapa.map((c) => (
                <div key={c.etapa} className="flex justify-between py-2">
                  <span>{ROT_ETAPA[c.etapa] ?? c.etapa}{c.simulado && <span className="ml-1 text-[10px] text-cinza">(simulado)</span>}</span>
                  <span className="font-mono text-xs">{brl(c.brl)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="cartao p-5">
            <div className="mb-3 text-sm font-semibold">O que a IA fez</div>
            <ul className="max-h-[420px] space-y-2.5 overflow-y-auto text-[13px]">
              {s.registro.map((r, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 font-mono text-[11px] text-cinza">{new Date(r.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{(r.dados as { mensagem?: string })?.mensagem ?? r.acao}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
