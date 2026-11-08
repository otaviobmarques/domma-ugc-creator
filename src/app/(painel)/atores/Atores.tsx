"use client";
import { useState } from "react";
import { Plus, User, Check, Sparkles, AlertTriangle, X, ShieldCheck, Link2, Copy, Clock } from "lucide-react";
import { Cabecalho, Selo } from "@/components/ui";

interface A { id: string; nome: string; tipo: string; descricao: string; status: string; voz: boolean; foto: string | null; termo: string; dias: number | null; fim: string | null; link: string | null; prompt: string | null }

export function Atores({ atores, marcas, abrirNovo, podeEditar }: { atores: A[]; marcas: { id: string; nome: string }[]; abrirNovo: string | null; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<"todos" | "real" | "sintetico" | "vencendo">("todos");
  const [novo, setNovo] = useState<string | null>(abrirNovo);
  const [termoDe, setTermoDe] = useState<A | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const reais = atores.filter((a) => a.tipo === "real");
  const sint = atores.filter((a) => a.tipo === "sintetico");
  const venc = atores.filter((a) => a.termo === "vencendo");
  const lista = filtro === "real" ? reais : filtro === "sintetico" ? sint : filtro === "vencendo" ? venc : atores;

  async function cadastrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/atores", { method: "POST", body: f });
    const j = await r.json();
    if (!r.ok) return setErro(j.erro);
    if (j.aviso) alert(j.aviso);
    location.href = "/atores";
  }

  async function enviarTermo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    const r = await fetch(`/api/atores/${termoDe!.id}/consentimento`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titular: f.get("titular"), finalidade: f.get("finalidade"), marcas: f.getAll("marcas"), canais: f.getAll("canais"),
        inicio: f.get("inicio"), fim: f.get("fim"), usa_voz: f.get("usa_voz") === "on",
      }),
    });
    const j = await r.json();
    if (!r.ok) return setErro(j.erro);
    setLink(j.link.startsWith("http") ? j.link : location.origin + j.link);
  }

  async function revogar(a: A) {
    if (!confirm(`Revogar o termo de ${a.nome}? Novas produções com este rosto param na hora.`)) return;
    await fetch(`/api/atores/${a.id}/revogar`, { method: "POST" });
    location.reload();
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const umAno = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  return (
    <>
      <Cabecalho kicker="Biblioteca" titulo="Atores e consentimentos" sub="Rostos e vozes só entram em produção com autorização válida."
        acoes={podeEditar && <button className="btn-primario" onClick={() => setNovo("real")}><Plus size={15} /> Cadastrar ator</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {([["todos", `Todos (${atores.length})`], ["real", `Pessoas reais (${reais.length})`], ["sintetico", `Sintéticos (${sint.length})`], ["vencendo", `Termo vencendo (${venc.length})`]] as const).map(([k, t]) => (
          <button key={k} className={filtro === k ? "chip-ativo" : "chip"} onClick={() => setFiltro(k)}>{t}</button>
        ))}
      </div>
      {erro && <div className="mb-4 rounded-lg bg-erro-claro px-4 py-2.5 text-sm text-erro">{erro}</div>}

      {novo && (
        <form onSubmit={cadastrar} className="cartao mb-5 grid gap-3 p-5 md:grid-cols-4">
          <div className="md:col-span-4 flex gap-2">
            <button type="button" className={novo === "real" ? "chip-ativo" : "chip"} onClick={() => setNovo("real")}>Pessoa real</button>
            <button type="button" className={novo === "sintetico" ? "chip-ativo" : "chip"} onClick={() => setNovo("sintetico")}>Ator sintético</button>
          </div>
          <input type="hidden" name="tipo" value={novo} />
          <div><label className="rotulo">Nome</label><input name="nome" required className="campo" /></div>
          <div className="md:col-span-2"><label className="rotulo">Descrição {novo === "sintetico" && "(idade, estilo, cenário)"}</label><input name="descricao" className="campo" required={novo === "sintetico"} /></div>
          <div><label className="rotulo">{novo === "real" ? "Foto (obrigatória)" : "Foto (opcional; sem foto, a IA gera)"}</label><input name="foto" type="file" accept="image/*" required={novo === "real"} className="campo py-1.5" /></div>
          <div className="md:col-span-2"><label className="rotulo">ID da voz (ElevenLabs, opcional)</label><input name="voz_id" className="campo" placeholder="voz clonada só com autorização registrada" /></div>
          <div className="md:col-span-2 flex items-end justify-end gap-2">
            <button type="button" className="btn-secundario" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn-primario">{novo === "sintetico" ? "Criar ator" : "Cadastrar e pedir termo"}</button>
          </div>
          {novo === "real" && <p className="md:col-span-4 text-xs text-cinza">Fotos de celebridades, políticos e menores de idade são bloqueadas. Depois de cadastrar, envie o termo para assinatura.</p>}
        </form>
      )}

      {termoDe && (
        <form onSubmit={enviarTermo} className="cartao mb-5 grid gap-3 p-5 md:grid-cols-4">
          <h2 className="md:col-span-4 text-[15px] font-semibold">Termo de uso de imagem e voz · {termoDe.nome}</h2>
          <div><label className="rotulo">Titular</label><input name="titular" required className="campo" defaultValue={termoDe.nome} /></div>
          <div className="md:col-span-3"><label className="rotulo">Finalidade</label><input name="finalidade" required className="campo" defaultValue="Vídeos publicitários no estilo UGC para as marcas listadas" /></div>
          <fieldset className="md:col-span-2"><legend className="rotulo">Marcas permitidas</legend>
            <div className="flex flex-wrap gap-3 text-sm">{marcas.map((m) => <label key={m.id} className="flex items-center gap-1.5"><input type="checkbox" name="marcas" value={m.id} defaultChecked /> {m.nome}</label>)}</div>
          </fieldset>
          <fieldset className="md:col-span-2"><legend className="rotulo">Canais</legend>
            <div className="flex flex-wrap gap-3 text-sm">{[["meta_ads", "Meta Ads"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["organico", "Orgânico"]].map(([v, t]) => <label key={v} className="flex items-center gap-1.5"><input type="checkbox" name="canais" value={v} defaultChecked={v !== "youtube"} /> {t}</label>)}</div>
          </fieldset>
          <div><label className="rotulo">Início</label><input name="inicio" type="date" className="campo" defaultValue={hoje} required /></div>
          <div><label className="rotulo">Fim</label><input name="fim" type="date" className="campo" defaultValue={umAno} required /></div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="usa_voz" defaultChecked /> Inclui voz (e voz clonada)</label>
          <div className="flex items-end justify-end gap-2">
            <button type="button" className="btn-secundario" onClick={() => { setTermoDe(null); setLink(null); }}>Fechar</button>
            {!link && <button className="btn-primario">Gerar link de assinatura</button>}
          </div>
          {link && (
            <div className="md:col-span-4 flex items-center gap-2 rounded-lg bg-ok-claro p-3 text-sm text-ok">
              <Link2 size={15} /> Envie este link ao titular: <input readOnly className="campo flex-1 py-1 text-xs text-tinta" value={link} />
              <button type="button" className="btn-secundario px-2 py-1" onClick={() => navigator.clipboard.writeText(link)}><Copy size={13} /></button>
            </div>
          )}
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {lista.map((a) => (
          <div key={a.id} className="cartao p-3">
            <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-lavanda">
              {a.foto ? <img src={a.foto} alt={`Foto de ${a.nome}`} className="h-full w-full object-cover" /> : <User className="text-cinza" />}
            </div>
            <div className="mt-2 text-sm font-semibold">{a.nome}</div>
            <div className="text-xs text-cinza">{a.tipo === "sintetico" ? `Ator sintético · ${a.descricao.slice(0, 28)}` : `Pessoa real${a.voz ? " · voz clonada" : ""}`}</div>
            <div className="mt-2">
              {a.status === "bloqueado" ? <Selo tom="erro" icone={<X size={11} />}>Foto bloqueada</Selo>
                : a.tipo === "sintetico" ? <Selo tom="roxo" icone={<Sparkles size={11} />}>Sintético</Selo>
                : a.termo === "valido" ? <Selo tom="ok" icone={<Check size={11} />}>Termo até {mmaa(a.fim)}</Selo>
                : a.termo === "vencendo" ? <Selo tom="alerta" icone={<AlertTriangle size={11} />}>Vence em {a.dias} dias</Selo>
                : a.termo === "pendente" ? <Selo tom="alerta" icone={<Clock size={11} />}>Aguardando assinatura</Selo>
                : <Selo tom="erro" icone={<X size={11} />}>{a.termo === "revogado" ? "Revogado: bloqueado" : a.termo === "vencido" ? "Vencido: bloqueado" : "Sem termo: bloqueado"}</Selo>}
            </div>
            {podeEditar && a.tipo === "real" && a.status !== "bloqueado" && (
              <div className="mt-2 flex flex-wrap gap-x-3 text-[11px]">
                {a.termo === "pendente" && a.link ? <button className="text-roxo underline" onClick={() => navigator.clipboard.writeText(location.origin + a.link)}>Copiar link do termo</button>
                  : <button className="text-roxo underline" onClick={() => { setTermoDe(a); setLink(null); }}>{["valido", "vencendo"].includes(a.termo) ? "Renovar termo" : "Enviar termo"}</button>}
                {["valido", "vencendo"].includes(a.termo) && <button className="text-erro underline" onClick={() => revogar(a)}>Revogar</button>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="cartao mt-5 flex gap-3 p-5">
        <ShieldCheck className="shrink-0 text-roxo" size={20} />
        <div>
          <div className="text-sm font-semibold">O que o termo registra</div>
          <p className="mt-1 max-w-2xl text-xs text-cinza">Quem é o titular, para quais marcas e canais a imagem e a voz podem ser usadas, o prazo, e a assinatura eletrônica com data, IP e código do documento. O titular pode revogar a qualquer momento: novas produções com aquele rosto param na hora.</p>
        </div>
      </div>
    </>
  );
}

function mmaa(d: string | null) {
  if (!d) return "—";
  const [y, m] = d.split("-");
  return `${m}/${y}`;
}
