"use client";
import { useState } from "react";
import { AlertTriangle, Check, Clock, Eye, Plus, ShieldCheck, X, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Cabecalho, Selo, usd } from "@/components/ui";
import type { InfoProvedor, OpcaoEtapa } from "@/lib/providers/catalogo";

interface Chave { provedor: string; nome: string; ultimos4: string; status: string; limite: number | null; gasto: number }
const GRUPOS: [string, string][] = [["ia", "Inteligência artificial"], ["voz", "Voz"], ["imagem", "Imagem"], ["video", "Vídeo e lip-sync"], ["integracao", "Integrações Domma"]];
const ETAPAS: [string, string][] = [["roteiro", "Roteiro e QA"], ["narracao", "Voz"], ["imagem", "Imagem-chave"], ["lipsync", "Lip-sync"], ["broll", "B-roll"]];

export function Configuracoes(p: {
  aba: string; provedores: InfoProvedor[]; chaves: Chave[]; opcoes: Record<string, OpcaoEtapa[]>;
  roteamento: Record<string, { principal: string; alternativo: string }>; limiteMensal: number; workspace: string; simulador: boolean;
  membros: { nome: string; email: string; papel: string }[]; auditoria: { ator: string; acao: string; alvo: string | null; quando: string }[];
}) {
  const [aba, setAba] = useState(p.aba);
  const [form, setForm] = useState({ provedor: "fal", nome: `Produção ${p.workspace}`, chave: "", limite: "150" });
  const [msg, setMsg] = useState<{ tom: "ok" | "erro"; t: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [rot, setRot] = useState(p.roteamento);
  const [limite, setLimite] = useState(String(p.limiteMensal));
  const porProv = Object.fromEntries(p.chaves.map((c) => [c.provedor, c]));
  const alerta = p.chaves.find((c) => c.status === "saldo_baixo" || c.status === "chave_invalida");

  async function req(rotulo: string, url: string, init: RequestInit, ok: string, recarregar = true) {
    setOcupado(rotulo);
    setMsg(null);
    const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) return setMsg({ tom: "erro", t: j.erro ?? "falhou" });
    setMsg({ tom: "ok", t: j.detalhe ? `${ok} (${j.detalhe})` : ok });
    if (recarregar) setTimeout(() => location.reload(), 700);
  }

  return (
    <>
      <Cabecalho kicker="Configurações" titulo={aba === "chaves" ? "Chaves de API" : aba === "provedores" ? "Provedor por etapa" : aba === "limites" ? "Limites de custo" : aba === "equipe" ? "Equipe e auditoria" : "Geral"}
        sub="Conecte os provedores de IA usados em cada etapa da produção."
        acoes={<>
          <button className="btn-secundario" onClick={() => setAba("equipe")}><Eye size={15} /> Ver auditoria</button>
          <button className="btn-primario" onClick={() => { setAba("chaves"); document.getElementById("form-chave")?.scrollIntoView({ behavior: "smooth" }); }}><Plus size={15} /> Adicionar chave</button>
        </>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[["geral", "Geral"], ["chaves", "Chaves de API"], ["provedores", "Provedor por etapa"], ["limites", "Limites de custo"], ["equipe", "Equipe e permissões"]].map(([k, t]) => (
          <button key={k} onClick={() => setAba(k)} className={aba === k ? "rounded-lg bg-tinta px-3 py-2 text-xs font-medium text-white" : "rounded-lg border border-borda px-3 py-2 text-xs hover:border-roxo"}>{t}</button>
        ))}
      </div>
      {alerta && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-alerta-claro px-4 py-2.5 text-sm text-alerta">
          <AlertTriangle size={15} />
          <span><b>{alerta.status === "saldo_baixo" ? "Saldo baixo" : "Chave inválida"} em {p.provedores.find((x) => x.id === alerta.provedor)?.nome}.</b> Recarregue no painel do provedor ou ative o alternativo em “Provedor por etapa”.</span>
        </div>
      )}
      {msg && <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${msg.tom === "ok" ? "bg-ok-claro text-ok" : "bg-erro-claro text-erro"}`}>{msg.t}</div>}

      {aba === "chaves" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="cartao overflow-x-auto p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Provedores conectados</h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-[11px] text-cinza"><th className="py-1 font-medium">Provedor</th><th className="font-medium">Status</th><th className="font-medium">Chave</th><th className="text-right font-medium">Gasto no mês</th><th /></tr></thead>
              {GRUPOS.map(([g, t]) => (
                <tbody key={g}>
                  <tr><td colSpan={5} className="pt-4 pb-1 text-[10px] font-semibold tracking-[0.14em] text-roxo">{t.toUpperCase()}</td></tr>
                  {p.provedores.filter((x) => x.grupo === g).map((x) => {
                    const c = porProv[x.id];
                    return (
                      <tr key={x.id} className="border-t border-borda">
                        <td className="py-2.5"><div className="font-medium">{x.nome}</div><div className="text-[11px] text-cinza">{x.descricao}</div></td>
                        <td>{!c ? <Selo icone={<Clock size={11} />}>Não configurado</Selo> : c.status === "conectado" ? <Selo tom="ok" icone={<Check size={11} />}>Conectado</Selo> : c.status === "saldo_baixo" ? <Selo tom="alerta" icone={<AlertTriangle size={11} />}>Saldo baixo</Selo> : <Selo tom="erro" icone={<X size={11} />}>Chave inválida</Selo>}</td>
                        <td className="font-mono text-xs">{c ? `••••••••${c.ultimos4}` : "—"}</td>
                        <td className="text-right font-mono text-xs">{c ? usd(c.gasto) : "—"}</td>
                        <td className="pl-2 text-right">
                          {c && (
                            <span className="flex justify-end gap-1">
                              <button title="Testar" className="rounded p-1 hover:bg-lavanda" onClick={() => req(`t-${x.id}`, `/api/config/chaves/${x.id}`, { method: "POST" }, "Chave testada")}>{ocupado === `t-${x.id}` ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}</button>
                              <button title="Trocar" className="rounded p-1 hover:bg-lavanda" onClick={() => { setForm({ ...form, provedor: x.id, nome: c.nome }); document.getElementById("form-chave")?.scrollIntoView({ behavior: "smooth" }); }}><Plus size={13} /></button>
                              <button title="Remover" className="rounded p-1 text-erro hover:bg-erro-claro" onClick={() => confirm(`Remover a chave de ${x.nome}?`) && req(`d-${x.id}`, `/api/config/chaves/${x.id}`, { method: "DELETE" }, "Chave removida")}><Trash2 size={13} /></button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
            {p.simulador && <p className="mt-4 text-xs text-cinza">Etapas sem chave configurada usam o <b>simulador</b> (mídia de teste, custo estimado). Defina PERMITIR_SIMULADOR=false para exigir chaves reais.</p>}
          </section>
          <div className="space-y-4">
            <form id="form-chave" className="cartao space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); req("salvar", "/api/config/chaves", { method: "POST", body: JSON.stringify({ provedor: form.provedor, nome: form.nome, chave: form.chave, limite_mensal_usd: form.limite ? Number(form.limite) : null }) }, "Chave testada e salva"); }}>
              <h2 className="text-[15px] font-semibold">Adicionar chave</h2>
              <div><label className="rotulo">Provedor</label>
                <select className="campo" value={form.provedor} onChange={(e) => setForm({ ...form, provedor: e.target.value })}>
                  {p.provedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select></div>
              <div><label className="rotulo">Nome da chave</label><input className="campo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div><label className="rotulo">Chave de API</label><input className="campo font-mono" type="password" autoComplete="off" placeholder={p.provedores.find((x) => x.id === form.provedor)?.formatoChave} value={form.chave} onChange={(e) => setForm({ ...form, chave: e.target.value })} />
                <p className="mt-1 text-[11px] text-cinza">Cole a chave gerada no painel do provedor. Depois de salva, ela nunca mais aparece inteira.</p></div>
              <div><label className="rotulo">Limite de gasto mensal (US$)</label><input className="campo" inputMode="decimal" value={form.limite} onChange={(e) => setForm({ ...form, limite: e.target.value })} /></div>
              <div className="flex gap-2">
                <button className="btn-primario" disabled={!form.chave || !!ocupado}>{ocupado === "salvar" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Testar e salvar</button>
                <button type="button" className="btn-secundario" onClick={() => setForm({ ...form, chave: "" })}>Cancelar</button>
              </div>
            </form>
            <section className="cartao p-5">
              <div className="flex gap-2"><ShieldCheck size={17} className="shrink-0 text-roxo" /><h2 className="text-[15px] font-semibold">Como as chaves ficam guardadas</h2></div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-cinza">
                <li><b>Web:</b> criptografadas no servidor (AES-256-GCM) e usadas só pelos workers. A tela mostra apenas os 4 últimos caracteres.</li>
                <li><b>Local:</b> guardadas no cofre do sistema (Windows Credential Manager ou Chaves do macOS), nunca em arquivo de texto.</li>
                <li>Só administradores adicionam, trocam ou removem chaves. Toda alteração fica registrada na auditoria.</li>
              </ul>
            </section>
          </div>
        </div>
      )}

      {aba === "provedores" && (
        <section className="cartao max-w-3xl p-5">
          <p className="mb-4 text-sm text-cinza">Se o principal falhar duas vezes ou passar do tempo limite, o worker tenta o alternativo automaticamente.</p>
          <div className="space-y-3">
            {ETAPAS.map(([e, t]) => (
              <div key={e} className="grid items-center gap-2 sm:grid-cols-[140px_1fr_1fr]">
                <div className="text-sm font-medium">{t}</div>
                {(["principal", "alternativo"] as const).map((k) => (
                  <select key={k} aria-label={`${t} ${k}`} className="campo" value={rot[e]?.[k]} onChange={(ev) => setRot({ ...rot, [e]: { ...rot[e], [k]: ev.target.value } })}>
                    {p.opcoes[e].map((o) => <option key={o.id} value={o.id}>{k === "principal" ? "Principal: " : "Alternativo: "}{o.nome}{o.chave && !porProv[o.chave] ? " (sem chave)" : ""}</option>)}
                  </select>
                ))}
              </div>
            ))}
          </div>
          <button className="btn-primario mt-5" disabled={!!ocupado} onClick={() => req("rot", "/api/config/roteamento", { method: "PUT", body: JSON.stringify(rot) }, "Roteamento salvo", false)}>Salvar</button>
        </section>
      )}

      {aba === "limites" && (
        <section className="cartao max-w-xl space-y-3 p-5">
          <div><label className="rotulo">Limite de gasto mensal do workspace (R$)</label><input className="campo" inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} /></div>
          <p className="text-xs text-cinza">Cada projeto também tem seu limite (padrão: 1,5× a estimativa). Ao chegar a 80% a IA avisa; a 100% ela para e pede aprovação. Máximo de 2 refações automáticas por cena.</p>
          <button className="btn-primario" onClick={() => req("lim", "/api/config/limites", { method: "PUT", body: JSON.stringify({ limite_custo_mensal: Number(limite.replace(",", ".")) }) }, "Limite salvo", false)}>Salvar</button>
        </section>
      )}

      {aba === "equipe" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="cartao p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Equipe</h2>
            <ul className="divide-y divide-borda text-sm">{p.membros.map((m) => <li key={m.email} className="flex justify-between py-2"><span>{m.nome} <span className="text-cinza">· {m.email}</span></span><Selo tom="roxo">{m.papel}</Selo></li>)}</ul>
          </section>
          <section className="cartao p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Auditoria</h2>
            <ul className="max-h-[480px] divide-y divide-borda overflow-y-auto text-xs">
              {p.auditoria.map((a, i) => <li key={i} className="flex justify-between gap-3 py-2"><span><b>{a.acao}</b> {a.alvo && <span className="text-cinza">· {a.alvo.slice(0, 18)}</span>}<span className="block text-cinza">{a.ator}</span></span><span className="shrink-0 text-cinza">{new Date(a.quando).toLocaleString("pt-BR")}</span></li>)}
            </ul>
          </section>
        </div>
      )}

      {aba === "geral" && (
        <section className="cartao max-w-xl p-5 text-sm">
          <div className="flex justify-between border-b border-borda py-2"><span className="text-cinza">Workspace</span><span>{p.workspace}</span></div>
          <div className="flex justify-between border-b border-borda py-2"><span className="text-cinza">Idioma</span><span>Português do Brasil</span></div>
          <div className="flex justify-between border-b border-borda py-2"><span className="text-cinza">Rotulagem de IA</span><span>Selo “Gerado por IA” por padrão</span></div>
          <div className="flex justify-between py-2"><span className="text-cinza">Simulador</span><span>{p.simulador ? "Ativo para etapas sem chave" : "Desligado"}</span></div>
        </section>
      )}
    </>
  );
}
