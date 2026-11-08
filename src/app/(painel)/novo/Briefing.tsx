"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles, Upload, User, AlertTriangle, X, Loader2 } from "lucide-react";
import { Cabecalho, Etapas, Selo } from "@/components/ui";

interface Ator { id: string; nome: string; tipo: string; descricao: string; status: string; foto: string | null; termo: string; fim: string | null }
interface Produto { id: string; marca_id: string; nome: string; descricao: string; preco: string | null; foto: string | null; n: number }

const OBJETIVOS = [
  { id: "depoimento", t: "Depoimento" },
  { id: "unboxing", t: "Unboxing" },
  { id: "problema e solução", t: "Problema e solução" },
  { id: "demonstração", t: "Demonstração" },
  { id: "oferta", t: "Oferta" },
];

export function Briefing({ atores: atoresIniciais, marcas, produtos: produtosIniciais }: { atores: Ator[]; marcas: { id: string; nome: string }[]; produtos: Produto[] }) {
  const [atores, setAtores] = useState(atoresIniciais);
  const [produtos, setProdutos] = useState(produtosIniciais);
  const [atorId, setAtorId] = useState<string | null>(atores.find((a) => a.termo === "valido")?.id ?? null);
  const [marcaId, setMarcaId] = useState(produtosIniciais[0]?.marca_id ?? marcas[0]?.id ?? "");
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState("depoimento");
  const [publico, setPublico] = useState("");
  const [duracao, setDuracao] = useState(30);
  const [formato, setFormato] = useState("9:16");
  const [n, setN] = useState(4);
  const [qualidade, setQualidade] = useState("720p");
  const [estimativa, setEstimativa] = useState<{ min: number; max: number } | null>(null);
  const [url, setUrl] = useState("");
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modoAtor, setModoAtor] = useState<"biblioteca" | "sintetico">("biblioteca");
  const [descSint, setDescSint] = useState("");

  const ator = atores.find((a) => a.id === atorId);
  const produtosMarca = useMemo(() => produtos.filter((p) => p.marca_id === marcaId), [produtos, marcaId]);
  const produto = produtos.find((p) => p.id === produtoId) ?? null;
  useEffect(() => {
    if (!produtosMarca.some((p) => p.id === produtoId)) setProdutoId(produtosMarca[0]?.id ?? null);
  }, [produtosMarca, produtoId]);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/estimativa?duracao=${duracao}&qualidade=${qualidade}&n=${n}`);
      if (r.ok) setEstimativa(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [duracao, qualidade, n]);

  const termoOk = ator && (ator.tipo === "sintetico" || ["valido", "vencendo"].includes(ator.termo));

  async function importar(arquivos?: FileList | null) {
    setImportando(true);
    setAviso(null);
    setErro(null);
    const f = new FormData();
    f.set("marca_id", marcaId);
    if (url) f.set("url", url);
    if (arquivos) for (const a of Array.from(arquivos).slice(0, 10)) f.append("fotos", a);
    if (!url) f.set("nome", prompt("Nome do produto?") ?? "");
    const r = await fetch("/api/produtos/importar", { method: "POST", body: f });
    const j = await r.json();
    setImportando(false);
    if (!r.ok) return setErro(j.erro);
    const p = j.produto;
    setProdutos((ps) => [{ id: p.id, marca_id: p.marca_id, nome: p.nome, descricao: p.descricao, preco: p.preco, foto: null, n: p.imagens.length }, ...ps]);
    setProdutoId(p.id);
    setAviso(url ? `A IA importou ${j.importadas} imagens, o nome, a descrição e o preço da página.` : `Produto cadastrado com ${p.imagens.length} foto(s).`);
  }

  async function gerarSintetico() {
    if (!descSint.trim()) return;
    setEnviando(true);
    const f = new FormData();
    f.set("tipo", "sintetico");
    f.set("nome", descSint.split(",")[0].slice(0, 30));
    f.set("descricao", descSint);
    const r = await fetch("/api/atores", { method: "POST", body: f });
    const j = await r.json();
    setEnviando(false);
    if (!r.ok) return setErro(j.erro);
    const novo: Ator = { id: j.ator.id, nome: j.ator.nome, tipo: "sintetico", descricao: descSint, status: "ativo", foto: null, termo: "sintetico", fim: null };
    setAtores((as) => [novo, ...as]);
    setAtorId(novo.id);
    setModoAtor("biblioteca");
  }

  async function enviar(rascunho: boolean) {
    setErro(null);
    if (!atorId || !produtoId) return setErro("Escolha o ator e o produto.");
    setEnviando(true);
    const r = await fetch("/api/projetos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ produto_id: produtoId, ator_id: atorId, objetivo, publico, tom: publico, duracao_s: duracao, formato, qualidade, n_variacoes: n, salvar_rascunho: rascunho }),
    });
    const j = await r.json();
    if (!r.ok) {
      setEnviando(false);
      return setErro(j.erro);
    }
    location.href = rascunho ? "/projetos" : `/projetos/${j.id}/roteiro`;
  }

  return (
    <>
      <Cabecalho kicker="Novo UGC" titulo="Briefing" sub="Conte o que o vídeo precisa vender. A IA cuida do roteiro e das cenas."
        acoes={<>
          <button className="btn-secundario" disabled={enviando} onClick={() => enviar(true)}>Salvar rascunho</button>
          <button className="btn-primario" disabled={enviando || !termoOk || !produtoId} onClick={() => enviar(false)}>
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {enviando ? "Escrevendo roteiros…" : "Gerar roteiros"}
          </button>
        </>} />
      <Etapas atual={1} />
      {erro && <div className="mb-4 rounded-lg bg-erro-claro px-4 py-2.5 text-sm text-erro">{erro}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Ator */}
        <section className="cartao p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Ator</h2>
          <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-lavanda">
            {ator?.foto ? <img src={ator.foto} alt={`Foto de ${ator.nome}`} className="h-full w-full object-cover" /> : (
              <div className="text-center text-xs text-cinza"><User className="mx-auto mb-1" size={20} />{ator ? `Foto de ${ator.nome}` : "Escolha um ator"}</div>
            )}
          </div>
          <div className="mt-3 min-h-6">
            {ator && (ator.tipo === "sintetico" ? <Selo tom="roxo" icone={<Sparkles size={11} />}>Ator sintético</Selo>
              : ator.termo === "valido" ? <Selo tom="ok" icone={<Check size={11} />}>Termo válido até {fmt(ator.fim)}</Selo>
              : ator.termo === "vencendo" ? <Selo tom="alerta" icone={<AlertTriangle size={11} />}>Termo vence em {fmt(ator.fim)}</Selo>
              : <Selo tom="erro" icone={<X size={11} />}>Sem termo: bloqueado</Selo>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={modoAtor === "biblioteca" ? "chip-ativo" : "chip"} onClick={() => setModoAtor("biblioteca")}>Da biblioteca</button>
            <a className="chip" href="/atores?novo=real">Enviar foto</a>
            <button className={modoAtor === "sintetico" ? "chip-ativo" : "chip"} onClick={() => setModoAtor("sintetico")}>Gerar ator com IA</button>
          </div>
          {modoAtor === "biblioteca" ? (
            <select className="campo mt-3" value={atorId ?? ""} onChange={(e) => setAtorId(e.target.value)} aria-label="Ator">
              <option value="" disabled>Escolha…</option>
              {atores.map((a) => (
                <option key={a.id} value={a.id} disabled={a.status === "bloqueado"}>
                  {a.nome} — {a.tipo === "sintetico" ? "sintético" : a.termo === "valido" ? "termo válido" : a.termo === "vencendo" ? "termo vencendo" : "sem termo"}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-3">
              <textarea className="campo" rows={2} placeholder="Idade, estilo, cenário. Ex.: mulher de 30 anos, cabelo cacheado, cozinha clara" value={descSint} onChange={(e) => setDescSint(e.target.value)} />
              <button className="btn-secundario mt-2 w-full" disabled={enviando} onClick={gerarSintetico}><Sparkles size={14} /> Gerar ator</button>
            </div>
          )}
          <p className="mt-3 text-[11px] text-cinza">Foto de pessoa real só entra em produção com termo de uso de imagem assinado.</p>
        </section>

        {/* Produto */}
        <section className="cartao p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Produto</h2>
          <label className="rotulo">Cliente</label>
          <select className="campo mb-3" value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
            {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-borda bg-lavanda px-4 py-8 text-center text-xs text-cinza hover:border-roxo"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); importar(e.dataTransfer.files); }}>
            {importando ? <Loader2 size={18} className="mb-1 animate-spin" /> : <Upload size={18} className="mb-1" />}
            Arraste as fotos do produto aqui ou clique para enviar
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => importar(e.target.files)} />
          </label>
          <label className="rotulo mt-4">Ou cole o link da página do produto</label>
          <div className="flex gap-2">
            <input className="campo" placeholder="https://loja.exemplo.com.br/produto" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn-secundario" disabled={!url || importando} onClick={() => importar()}>Importar</button>
          </div>
          {aviso && <div className="mt-3 flex gap-2 rounded-lg bg-roxo-claro p-3 text-xs text-roxo"><Sparkles size={14} className="shrink-0" />{aviso}</div>}
          <label className="rotulo mt-4">Produto do briefing</label>
          <select className="campo" value={produtoId ?? ""} onChange={(e) => setProdutoId(e.target.value)}>
            {produtosMarca.length === 0 && <option value="">Nenhum produto desta marca</option>}
            {produtosMarca.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.preco ? ` · ${p.preco}` : ""}</option>)}
          </select>
          {produto && (
            <div className="mt-3 flex gap-3 text-xs text-cinza">
              {produto.foto && <img src={produto.foto} alt="" className="h-14 w-14 rounded object-cover" />}
              <p className="line-clamp-3">{produto.descricao}</p>
            </div>
          )}
        </section>

        {/* Objetivo */}
        <section className="cartao p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Objetivo do vídeo</h2>
          <label className="rotulo">Formato do roteiro</label>
          <div className="flex flex-wrap gap-2">
            {OBJETIVOS.map((o) => <button key={o.id} className={objetivo === o.id ? "chip-ativo" : "chip"} onClick={() => setObjetivo(o.id)}>{o.t}</button>)}
          </div>
          <label className="rotulo mt-4">Público e tom</label>
          <input className="campo" placeholder="Mulheres de 25 a 40 anos, tom próximo, sem exagero" value={publico} onChange={(e) => setPublico(e.target.value)} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo">Duração</label>
              <select className="campo" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
                {[10, 15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} segundos</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo">Formato</label>
              <select className="campo" value={formato} onChange={(e) => setFormato(e.target.value)}>
                <option value="9:16">9:16 (Reels e TikTok)</option>
                <option value="1:1">1:1 (Feed)</option>
                <option value="16:9">16:9 (YouTube)</option>
              </select>
            </div>
            <div>
              <label className="rotulo">Variações</label>
              <select className="campo" value={n} onChange={(e) => setN(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo">Qualidade</label>
              <select className="campo" value={qualidade} onChange={(e) => setQualidade(e.target.value)}>
                <option>480p</option><option>720p</option><option>1080p</option>
              </select>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-borda pt-4">
            <span className="text-xs text-cinza">Custo estimado</span>
            <span className="font-mono text-sm font-semibold">{estimativa ? `R$ ${estimativa.min} a R$ ${estimativa.max}` : "…"}</span>
          </div>
        </section>
      </div>
    </>
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  const [y, m] = d.split("-");
  return `${m}/${y}`;
}
