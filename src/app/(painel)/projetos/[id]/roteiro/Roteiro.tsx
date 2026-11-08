"use client";
import { useRef, useState } from "react";
import { Check, Clock, Loader2, Play, RefreshCw, Sparkles, AlertTriangle, Pencil, Wand2 } from "lucide-react";
import { Cabecalho, Etapas, Selo } from "@/components/ui";
import type { Roteiro as TRoteiro } from "@/lib/agent/roteiro";
import { NOME_ANGULO } from "@/lib/agent/nomes";

interface Verif { palavras: number; segundos_fala: number; palavras_por_s: number; excesso_palavras: boolean; proibidas: string[]; vetadas: string[]; alerta_sintetico: boolean; ok: boolean }
interface Var { id: string; letra: string; angulo: string; roteiro: TRoteiro; verificacao: Verif }

const TIPO: Record<string, string> = { gancho: "Gancho", demonstracao: "Demonstração", broll: "B-roll", prova: "Prova", cta: "Chamada" };
const NOME_PROV: Record<string, string> = { "fal-kling-avatar": "Kling Avatar", "fal-kling-avatar-pro": "Kling Avatar Pro", "fal-omnihuman": "OmniHuman", "fal-seedance": "Seedance", "fal-kling-i2v": "Kling", simulador: "Simulador" };

export function Roteiro({ projeto, variacoes: iniciais, provedores, podeEditar }: {
  projeto: { id: string; estado: string; n: number; produto: string; ator: string; atorTipo: string; vozClonada: boolean; vozId: string | null; ritmo: string };
  variacoes: Var[];
  provedores: { lipsync: string; broll: string };
  podeEditar: boolean;
}) {
  const [vars, setVars] = useState(iniciais);
  const [ativa, setAtiva] = useState(0);
  const [ritmo, setRitmo] = useState(projeto.ritmo || "natural");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [previa, setPrevia] = useState<{ url: string; duracao: number } | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const v = vars[ativa];

  async function chamar(rotulo: string, fn: () => Promise<Response>) {
    setOcupado(rotulo);
    setErro(null);
    try {
      const r = await fn();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? "falhou");
      return j;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function salvarTexto(bloco: number, texto: string) {
    const novo = structuredClone(v.roteiro);
    novo.blocos[bloco].texto = texto;
    const j = await chamar("salvar", () => fetch(`/api/variacoes/${v.id}/roteiro`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ roteiro: novo }) }));
    if (j) atualizar(j);
    setEditando(null);
  }

  async function regerar(bloco?: number) {
    const texto = instrucao.trim() || (bloco != null ? "reescreva este bloco de outro jeito" : "escreva de novo com outra abordagem");
    const j = await chamar(bloco != null ? `bloco-${bloco}` : "variacao", () =>
      fetch(`/api/variacoes/${v.id}/roteiro`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ instrucao: texto, bloco }) }));
    if (j) { atualizar(j); setInstrucao(""); }
  }

  function atualizar(j: { roteiro: TRoteiro; verificacao: Verif }) {
    setVars((vs) => vs.map((x, i) => (i === ativa ? { ...x, roteiro: j.roteiro, verificacao: j.verificacao } : x)));
  }

  async function gerarTudo() {
    if (!confirm("Gerar todas as variações de novo? As edições manuais serão perdidas.")) return;
    const j = await chamar("tudo", () => fetch(`/api/projetos/${projeto.id}/roteiros`, { method: "POST" }));
    if (j) location.reload();
  }

  async function ouvir() {
    const j = await chamar("previa", () => fetch("/api/vozes/previa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variacao_id: v.id, ritmo }) }));
    if (j) { setPrevia(j); setTimeout(() => audio.current?.play(), 50); }
  }

  async function produzir() {
    const j = await chamar("produzir", () => fetch(`/api/projetos/${projeto.id}/produzir`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voz_ritmo: ritmo }) }));
    if (j) location.href = `/projetos/${projeto.id}/producao`;
  }

  if (!v) {
    return (
      <>
        <Cabecalho kicker="Novo UGC" titulo="Roteiro e voz" sub="Este projeto ainda não tem roteiros." />
        <button className="btn-primario" onClick={() => chamar("tudo", () => fetch(`/api/projetos/${projeto.id}/roteiros`, { method: "POST" })).then((j) => j && location.reload())} disabled={!!ocupado}>
          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Gerar roteiros
        </button>
        {erro && <p className="mt-3 text-sm text-erro">{erro}</p>}
      </>
    );
  }

  const ver = v.verificacao;
  const travado = !["rascunho", "roteiro_gerado", "roteiro_aprovado"].includes(projeto.estado);
  return (
    <>
      <Cabecalho kicker="Novo UGC" titulo="Roteiro e voz" sub={`A IA escreveu ${vars.length} variações a partir do briefing. Edite o texto direto ou peça um ajuste.`}
        acoes={podeEditar && !travado ? <>
          <button className="btn-secundario" disabled={!!ocupado} onClick={gerarTudo}><RefreshCw size={15} className={ocupado === "tudo" ? "animate-spin" : ""} /> Gerar de novo</button>
          <button className="btn-primario" disabled={!!ocupado} onClick={produzir}>{ocupado === "produzir" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Aprovar e produzir</button>
        </> : <a className="btn-secundario" href={`/projetos/${projeto.id}/producao`}>Ver produção</a>} />
      <Etapas atual={2} projetoId={projeto.id} />
      {erro && <div className="mb-4 rounded-lg bg-erro-claro px-4 py-2.5 text-sm text-erro">{erro}</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="cartao p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {vars.map((x, i) => (
              <button key={x.id} onClick={() => { setAtiva(i); setEditando(null); }}
                className={i === ativa ? "rounded-lg bg-tinta px-3 py-1.5 text-xs font-medium text-white" : "rounded-lg border border-borda px-3 py-1.5 text-xs hover:border-roxo"}>
                {x.letra} · {NOME_ANGULO[x.angulo] ?? x.angulo}
              </button>
            ))}
          </div>
          {v.roteiro.blocos.map((b, i) => (
            <div key={i} className="group border-b border-borda py-3 last:border-0">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold tracking-[0.14em] text-roxo">
                  {TIPO[b.tipo]?.toUpperCase()} <span className="ml-1 font-mono text-tinta">{fmtT(b.inicio)}–{fmtT(b.fim)} s</span>
                  <span className="ml-2 font-normal tracking-normal text-cinza">· {b.enquadramento}</span>
                </div>
                {podeEditar && !travado && (
                  <span className="flex gap-1 opacity-60 group-hover:opacity-100">
                    <button title="Editar texto" className="rounded p-1 hover:bg-lavanda" onClick={() => setEditando(i)}><Pencil size={13} /></button>
                    <button title="Regerar este bloco (usa a instrução abaixo, se houver)" className="rounded p-1 hover:bg-lavanda" onClick={() => regerar(i)} disabled={!!ocupado}>
                      {ocupado === `bloco-${i}` ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                    </button>
                  </span>
                )}
              </div>
              {editando === i ? (
                <EditorBloco inicial={b.texto} onSalvar={(t) => salvarTexto(i, t)} onCancelar={() => setEditando(null)} />
              ) : b.tipo === "broll" ? (
                <p className="mt-1 text-sm text-cinza">[Cena gerada: {b.prompt_visual}]{b.texto && <span className="block text-tinta">“{b.texto}” (narração em off)</span>}</p>
              ) : (
                <p className="mt-1 text-[15px]">“{b.texto}”</p>
              )}
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            <Selo tom={ver.excesso_palavras ? "alerta" : "neutro"} icone={<Clock size={11} />}>{ver.palavras} palavras · cerca de {ver.segundos_fala} s de fala ({ver.palavras_por_s}/s)</Selo>
            {ver.proibidas.length + ver.vetadas.length === 0 ? <Selo tom="ok" icone={<Check size={11} />}>Sem promessas proibidas</Selo>
              : <Selo tom="erro" icone={<AlertTriangle size={11} />}>Revisar: {[...ver.proibidas, ...ver.vetadas].join(", ")}</Selo>}
            {ver.alerta_sintetico && <Selo tom="erro" icone={<AlertTriangle size={11} />}>Ator sintético apresentado como cliente real</Selo>}
            {v.roteiro.alertas.map((a, i) => <Selo key={i} tom="alerta" icone={<AlertTriangle size={11} />}>{a}</Selo>)}
          </div>
          {podeEditar && !travado && (
            <div className="mt-4 flex gap-2">
              <input className="campo" placeholder='Peça um ajuste: "deixa o gancho mais curto", "fala do frete grátis"' value={instrucao} onChange={(e) => setInstrucao(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && regerar()} />
              <button className="btn-secundario shrink-0" disabled={!!ocupado} onClick={() => regerar()}>
                {ocupado === "variacao" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Regerar variação
              </button>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="cartao p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Voz</h2>
            <label className="rotulo">Voz</label>
            <div className="campo bg-lavanda/50">{projeto.ator} ({projeto.vozClonada ? "clonada, com autorização" : projeto.vozId ? "voz da biblioteca" : "voz padrão da biblioteca"})</div>
            <label className="rotulo mt-3">Ritmo</label>
            <div className="flex gap-2">
              {[["animada", "Animada"], ["natural", "Natural"], ["calma", "Calma"]].map(([id, t]) => (
                <button key={id} className={ritmo === id ? "chip-ativo" : "chip"} onClick={() => setRitmo(id)} disabled={travado}>{t}</button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn-secundario py-1.5" onClick={ouvir} disabled={!!ocupado || !podeEditar}>
                {ocupado === "previa" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Ouvir prévia
              </button>
              <span className="font-mono text-xs text-cinza">{previa ? `0:${String(Math.round(previa.duracao)).padStart(2, "0")}` : `0:${String(v.roteiro.duracao_s).padStart(2, "0")}`}</span>
            </div>
            {previa && <audio ref={audio} src={previa.url} controls className="mt-3 w-full" />}
          </section>
          <section className="cartao p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Cenas que serão geradas</h2>
            <ol className="space-y-3 text-sm">
              <Cena n={1} t="Imagem-chave" d={v.roteiro.cenario_imagem_chave} />
              <Cena n={2} t={`Fala com lip-sync · ${v.roteiro.blocos.filter((b) => b.texto).reduce((s, b) => s + b.fim - b.inicio, 0).toFixed(0)} s`} d={`Provedor: ${NOME_PROV[provedores.lipsync] ?? provedores.lipsync}`} />
              {v.roteiro.blocos.filter((b) => b.tipo === "broll").map((b, i) => (
                <Cena key={i} n={3 + i} t={`B-roll do produto · ${(b.fim - b.inicio).toFixed(0)} s`} d={`Provedor: ${NOME_PROV[provedores.broll] ?? provedores.broll}`} />
              ))}
              <Cena n={3 + v.roteiro.blocos.filter((b) => b.tipo === "broll").length} t="Montagem" d="Legendas, música e logo da marca" />
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

function Cena({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <li className="flex gap-3 border-b border-borda pb-3 last:border-0 last:pb-0">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-roxo-claro text-[10px] font-semibold text-roxo">{n}</span>
      <div><div className="font-medium">{t}</div><div className="text-xs text-cinza">{d}</div></div>
    </li>
  );
}

function EditorBloco({ inicial, onSalvar, onCancelar }: { inicial: string; onSalvar: (t: string) => void; onCancelar: () => void }) {
  const [t, setT] = useState(inicial);
  return (
    <div className="mt-2">
      <textarea className="campo" rows={2} value={t} onChange={(e) => setT(e.target.value)} autoFocus />
      <div className="mt-2 flex gap-2">
        <button className="btn-primario py-1.5" onClick={() => onSalvar(t)}>Salvar</button>
        <button className="btn-secundario py-1.5" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

const fmtT = (s: number) => (Number.isInteger(s) ? String(s) : s.toFixed(1));
