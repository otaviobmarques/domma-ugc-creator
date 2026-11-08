"use client";
import { useEffect, useRef, useState } from "react";
import { Check, X, AlertTriangle, Send, Scissors, Link2, Film, Pause, Play, Loader2, Copy } from "lucide-react";
import { Cabecalho, Etapas, Selo, SeloEstado } from "@/components/ui";
import type { StatusProjeto } from "@/lib/consultas";

const CRITERIOS: [string, string][] = [
  ["sincronia", "Sincronia labial dentro do limite"],
  ["rosto", "Rosto igual ao do ator em todas as cenas"],
  ["produto", "Rótulo do produto legível e correto"],
  ["maos", "Mãos e dedos naturais"],
  ["legenda", "Legendas conferem com o roteiro"],
];
const LIM: Record<string, number> = { rosto: 7, maos: 6, produto: 7, sincronia: 7, legenda: 9 };

export function Revisao({ id, inicial, papel }: { id: string; inicial: StatusProjeto; papel: string }) {
  const [s, setS] = useState(inicial);
  const [ativa, setAtiva] = useState(0);
  const [pedido, setPedido] = useState("");
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; t: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(s.projeto.token_aprovacao ? `${location.origin}/aprovar/${s.projeto.token_aprovacao}` : null);
  const [tocando, setTocando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const video = useRef<HTMLVideoElement>(null);

  async function recarregar() {
    const r = await fetch(`/api/projetos/${id}/status`);
    if (r.ok) setS(await r.json());
  }
  useEffect(() => {
    const emAndamento = s.variacoes.some((v) => ["em_producao", "em_qa"].includes(v.estado));
    if (!emAndamento) return;
    const t = setInterval(recarregar, 3000);
    return () => clearInterval(t);
  });

  const v = s.variacoes[ativa];
  const qa = v?.qa as null | { nota: number; criterios: Record<string, number>; defeitos: { criterio: string; tempo_s: number; descricao: string; sugestao: string }[]; checagens: Record<string, unknown> & { resumo?: string; simulado?: boolean } };
  const podeDecidir = ["admin", "produtor", "revisor"].includes(papel) && v && ["aguardando_revisao", "falha"].includes(v.estado) && !!v.video;
  const emProducao = v && ["em_producao", "em_qa"].includes(v.estado);

  async function acao(rotulo: string, corpo: object, ok: string) {
    setOcupado(rotulo);
    setMsg(null);
    const r = await fetch(`/api/variacoes/${v.id}/revisao`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json();
    setOcupado(null);
    if (!r.ok) return setMsg({ tom: "erro", t: j.erro });
    setMsg({ tom: "ok", t: j.decisao?.resumo ?? ok });
    setPedido("");
    recarregar();
  }

  async function gerarLink() {
    setOcupado("link");
    const r = await fetch(`/api/projetos/${id}/link-aprovacao`, { method: "POST" });
    const j = await r.json();
    setOcupado(null);
    if (r.ok) { setLink(j.link.startsWith("http") ? j.link : `${location.origin}${j.link}`); }
  }

  async function adplane() {
    setOcupado("adplane");
    const r = await fetch(`/api/variacoes/${v.id}/adplane`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json();
    setOcupado(null);
    setMsg(r.ok ? { tom: "ok", t: "Enviado ao Adplane." } : { tom: "erro", t: j.erro });
  }

  if (!v) return <p className="text-sm text-cinza">Sem variações.</p>;
  const defeito = qa?.defeitos?.[0];
  const trecho = defeito ? [Math.max(0, Math.floor(defeito.tempo_s - 2)), Math.ceil(defeito.tempo_s + 2)] : null;

  return (
    <>
      <Cabecalho kicker="Novo UGC" titulo="Revisão e entrega" sub={`Variação ${v.letra} de ${s.variacoes.length} · ${s.projeto.produto_nome}`}
        acoes={podeDecidir ? <>
          <button className="btn-perigo" disabled={!!ocupado} onClick={() => acao("reprovar", { acao: "reprovar" }, "Variação reprovada.")}><X size={15} /> Reprovar</button>
          <button className="btn-primario" disabled={!!ocupado} onClick={() => acao("aprovar", { acao: "aprovar" }, "Variação aprovada.")}><Check size={15} /> Aprovar variação</button>
        </> : <SeloEstado estado={v.estado} />} />
      <Etapas atual={4} projetoId={id} />
      {msg && <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${msg.tom === "ok" ? "bg-ok-claro text-ok" : "bg-erro-claro text-erro"}`}>{msg.t}</div>}
      {v.observacao && <div className="mb-4 flex items-center gap-2 rounded-lg bg-alerta-claro px-4 py-2.5 text-sm text-alerta"><AlertTriangle size={15} />{v.observacao}</div>}

      <div className="grid gap-4 xl:grid-cols-[300px_1fr_320px]">
        <section className="cartao p-4">
          <div className="relative mx-auto aspect-[9/16] max-w-[260px] overflow-hidden rounded-2xl bg-[#2a2350]">
            {v.video ? (
              <video key={v.video} ref={video} src={v.video} className="h-full w-full object-cover" playsInline
                onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)} onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-xs text-white/70">
                {emProducao ? <Loader2 className="mb-2 animate-spin" /> : <Film className="mb-2" />} {emProducao ? "Gerando…" : `Vídeo da variação ${v.letra}`}
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button className="flex h-9 w-9 items-center justify-center rounded-full border border-borda" aria-label={tocando ? "Pausar" : "Tocar"} disabled={!v.video}
              onClick={() => (video.current?.paused ? video.current?.play() : video.current?.pause())}>{tocando ? <Pause size={14} /> : <Play size={14} />}</button>
            <span className="font-mono text-xs text-cinza">{fmt(tempo)} / {fmt(video.current?.duration || s.projeto.duracao_s)}</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {s.variacoes.map((x, i) => (
              <button key={x.id} onClick={() => { setAtiva(i); setTempo(0); setMsg(null); }}
                className={`rounded-lg border py-2 text-xs font-semibold ${i === ativa ? "border-roxo bg-roxo-claro text-roxo" : "border-borda"} ${x.estado === "aprovado" ? "text-ok" : x.estado === "reprovado" ? "text-erro line-through" : ""}`}>{x.letra}</button>
            ))}
          </div>
        </section>

        <section className="cartao p-5">
          <h2 className="text-[15px] font-semibold">Revisão de qualidade da IA</h2>
          {qa ? (
            <>
              <div className="mt-1 text-[28px] font-semibold">{Number(qa.nota).toLocaleString("pt-BR")} <span className="text-xs font-normal text-cinza">de 10</span></div>
              {qa.checagens?.simulado && <p className="mb-2 text-[11px] text-alerta">Avaliação visual simulada (sem chave do Claude). Checagens automáticas são reais.</p>}
              <ul className="mt-2 divide-y divide-borda text-sm">
                {CRITERIOS.map(([k, t]) => {
                  const nota = qa.criterios[k];
                  const d = qa.defeitos.find((x) => x.criterio === k);
                  const ok = nota >= LIM[k] && !d;
                  return (
                    <li key={k} className="flex gap-2 py-2">
                      {ok ? <Check size={15} className="mt-0.5 shrink-0 text-ok" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-alerta" />}
                      <div>
                        <div>{ok ? t : d ? `${d.descricao} em ${fmt(d.tempo_s)}` : `${t} (nota ${nota})`}</div>
                        {d && <div className="text-xs text-cinza">Sugestão: {d.sugestao}</div>}
                      </div>
                    </li>
                  );
                })}
                <li className="flex gap-2 py-2"><Check size={15} className="mt-0.5 text-ok" /> Selo “gerado por IA” aplicado</li>
              </ul>
              <details className="mt-2 text-xs text-cinza">
                <summary className="cursor-pointer">Checagens automáticas</summary>
                <ul className="mt-2 space-y-1">
                  {Object.entries(qa.checagens).filter(([k]) => !["resumo", "simulado"].includes(k)).map(([k, c]) => {
                    const x = c as { valor: unknown; ok: boolean; alvo?: unknown };
                    return <li key={k}>{x.ok ? "✓" : "⚠"} {k}: {String(x.valor ?? "—")}{x.alvo != null ? ` (alvo ${x.alvo})` : ""}</li>;
                  })}
                </ul>
                {qa.checagens.resumo && <p className="mt-2">{qa.checagens.resumo}</p>}
              </details>
              {trecho && podeDecidir && (
                <button className="btn-secundario mt-4 py-1.5" disabled={!!ocupado} onClick={() => acao("trecho", { acao: "trecho", tempo_s: defeito!.tempo_s }, "Refazendo só esse trecho.")}>
                  <Scissors size={14} /> Refazer só o trecho {fmt(trecho[0])}–{fmt(trecho[1])}
                </button>
              )}
            </>
          ) : <p className="mt-2 text-sm text-cinza">{emProducao ? "A IA ainda está produzindo e revisando esta variação." : "Sem avaliação."}</p>}
        </section>

        <div className="space-y-4">
          <section className="cartao p-5">
            <h2 className="text-[15px] font-semibold">Pedir ajuste</h2>
            <label className="rotulo mt-3">Diga o que mudar</label>
            <textarea className="campo" rows={3} placeholder="Deixa o gancho mais curto e troca a música por algo mais calmo." value={pedido} onChange={(e) => setPedido(e.target.value)} disabled={!podeDecidir} />
            <button className="btn-secundario mt-2 py-1.5" disabled={!pedido.trim() || !!ocupado || !podeDecidir} onClick={() => acao("ajuste", { acao: "ajuste", comentario: pedido }, "Ajuste enviado.")}>
              {ocupado === "ajuste" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar para a IA
            </button>
          </section>
          <section className="cartao p-5">
            <h2 className="text-[15px] font-semibold">Entrega</h2>
            <div className="rotulo mt-3">Arquivos</div>
            <div className="flex flex-wrap gap-2">
              {[["9x16", "MP4 9:16"], ["1x1", "MP4 1:1"], ["16x9", "MP4 16:9"], ["srt", "Legendas (SRT)"]].map(([f, t], i) => (
                <a key={f} className={i === 0 ? "chip-ativo" : "chip"} href={v.video ? `/api/variacoes/${v.id}/exportar?formato=${f}` : undefined} aria-disabled={!v.video}>{t}</a>
              ))}
            </div>
            <div className="mt-4 divide-y divide-borda border-t border-borda text-sm">
              <button className="flex w-full items-start gap-2 py-3 text-left" onClick={adplane} disabled={!!ocupado}>
                <Send size={15} className="mt-0.5 text-roxo" />
                <span><span className="text-roxo underline">Enviar para campanha no Meta Ads</span><span className="block text-xs text-cinza">Pelo Adplane, já ligado à campanha do cliente (variação aprovada)</span></span>
              </button>
              <div className="py-3">
                <button className="flex items-start gap-2 text-left" onClick={gerarLink} disabled={!!ocupado}>
                  <Link2 size={15} className="mt-0.5 text-roxo" />
                  <span><span className="text-roxo underline">Gerar link de aprovação para o cliente</span><span className="block text-xs text-cinza">O cliente aprova pelo celular, sem login</span></span>
                </button>
                {link && (
                  <div className="mt-2 flex gap-2">
                    <input className="campo py-1 text-xs" readOnly value={link} />
                    <button className="btn-secundario px-2 py-1" title="Copiar" onClick={() => navigator.clipboard.writeText(link)}><Copy size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          </section>
          {v.estado !== "aguardando_revisao" && <div className="text-xs text-cinza">Situação: <SeloEstado estado={v.estado} /></div>}
          {s.variacoes.some((x) => x.estado === "aprovado") && <Selo tom="ok">{s.variacoes.filter((x) => x.estado === "aprovado").length} aprovada(s)</Selo>}
        </div>
      </div>
    </>
  );
}

function fmt(s: number) {
  const t = Math.max(0, Math.round(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
