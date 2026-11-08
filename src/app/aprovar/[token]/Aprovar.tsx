"use client";
import { useState } from "react";
import { Check } from "lucide-react";

export function Aprovar({ token, produto, marca, variacoes }: { token: string; produto: string; marca: string; variacoes: { id: string; letra: string; video: string; aprovada: boolean }[] }) {
  const [i, setI] = useState(Math.max(0, variacoes.findIndex((v) => v.aprovada)));
  const [comentario, setComentario] = useState("");
  const [feito, setFeito] = useState<string | null>(variacoes.some((v) => v.aprovada) ? "Você já aprovou uma variação. Obrigado!" : null);
  const [erro, setErro] = useState<string | null>(null);
  const v = variacoes[i];
  async function enviar(acao: "aprovar" | "ajuste") {
    setErro(null);
    const r = await fetch(`/api/aprovacao/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ variacao_id: v.id, acao, comentario }) });
    const j = await r.json();
    if (!r.ok) return setErro(j.erro);
    setFeito(acao === "aprovar" ? `Variação ${v.letra} aprovada. Obrigado!` : "Pedido de ajuste enviado. Avisaremos quando a nova versão estiver pronta.");
  }
  if (!v) return <main className="p-10 text-center text-sm text-cinza">Os vídeos ainda estão sendo produzidos.</main>;
  return (
    <main className="mx-auto max-w-sm px-4 py-6">
      <div className="kicker">Aprovação</div>
      <h1 className="mt-1 text-2xl font-semibold">{produto}</h1>
      <p className="text-xs text-cinza">{marca} · {variacoes.length} variações para você escolher</p>
      <div className="relative mt-4 aspect-[9/16] overflow-hidden rounded-2xl bg-[#2a2350]">
        <video key={v.video} src={v.video} controls playsInline className="h-full w-full object-cover" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {variacoes.map((x, k) => (
          <button key={x.id} onClick={() => setI(k)} className={`rounded-lg border py-2.5 text-sm font-semibold ${k === i ? "border-roxo bg-roxo-claro text-roxo" : "border-borda"}`}>{x.letra}</button>
        ))}
      </div>
      {feito ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-ok-claro p-3 text-sm text-ok"><Check size={16} />{feito}</div>
      ) : (
        <>
          <label className="rotulo mt-4" htmlFor="c">Comentário (opcional)</label>
          <input id="c" className="campo" placeholder="Ex.: prefiro a música da variação C" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          {erro && <p className="mt-2 text-sm text-erro">{erro}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-secundario py-3" onClick={() => enviar("ajuste")}>Pedir ajuste</button>
            <button className="btn-primario py-3" onClick={() => enviar("aprovar")}>Aprovar {v.letra}</button>
          </div>
        </>
      )}
    </main>
  );
}
