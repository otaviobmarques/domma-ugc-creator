import { Download } from "lucide-react";
import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { Cabecalho, brl } from "@/components/ui";

export default async function Custos({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  const s = await exigirSessao(["admin", "produtor"]);
  const { marca } = await searchParams;
  const m = marca || null;
  const [ws] = await sql`select limite_custo_mensal from workspaces where id = ${s.workspaceId}`;
  const filtro = sql`c.workspace_id = ${s.workspaceId} and c.data >= date_trunc('month', now()) and (${m}::uuid is null or p.marca_id = ${m}::uuid)`;
  const porEtapa = await sql`select coalesce(c.etapa,'outros') as etapa, sum(c.valor_brl)::float as brl from custos c left join projetos p on p.id = c.projeto_id where ${filtro} group by 1 order by 2 desc`;
  const porProvedor = await sql`select c.provedor, sum(c.valor_usd)::float as usd, sum(c.valor_brl)::float as brl, bool_or(c.unidade like '%simulado%') as sim from custos c left join projetos p on p.id = c.projeto_id where ${filtro} group by 1 order by 3 desc`;
  const porMarca = await sql`select coalesce(mk.nome,'—') as marca, sum(c.valor_brl)::float as brl, count(distinct c.projeto_id)::int as projetos from custos c left join projetos p on p.id = c.projeto_id left join marcas mk on mk.id = p.marca_id where ${filtro} group by 1 order by 2 desc`;
  const porProjeto = await sql`select p.id, p.titulo, sum(c.valor_brl)::float as brl, p.limite_custo from custos c join projetos p on p.id = c.projeto_id where ${filtro} group by p.id order by 3 desc limit 20`;
  const marcas = await sql`select id, nome from marcas where workspace_id = ${s.workspaceId} order by nome`;
  const total = porEtapa.reduce((a, b) => a + b.brl, 0);
  const lim = Number(ws.limite_custo_mensal);
  return (
    <>
      <Cabecalho kicker="Custos" titulo="Custos do mês" sub="Custo real por etapa, provedor, cliente e projeto."
        acoes={<a className="btn-secundario" href={`/api/custos?formato=csv${m ? `&marca=${m}` : ""}`}><Download size={15} /> Exportar CSV</a>} />
      <form className="mb-4 flex gap-2">
        <select name="marca" defaultValue={m ?? ""} className="campo max-w-xs"><option value="">Todas as marcas</option>{marcas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <button className="btn-secundario">Filtrar</button>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="cartao p-4"><div className="text-xs text-cinza">Total no mês</div><div className="text-[26px] font-semibold">{brl(total)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-roxo-claro"><div className="h-full bg-roxo" style={{ width: `${Math.min(100, (total / lim) * 100)}%` }} /></div>
          <div className="mt-1 text-[11px] text-cinza">{Math.round((total / lim) * 100)}% do limite mensal ({brl(lim)})</div></div>
        <Tabela titulo="Por etapa" linhas={porEtapa.map((x) => [x.etapa, brl(x.brl)])} />
        <Tabela titulo="Por cliente" linhas={porMarca.map((x) => [`${x.marca} (${x.projetos})`, brl(x.brl)])} />
        <Tabela titulo="Por provedor" linhas={porProvedor.map((x) => [`${x.provedor}${x.sim ? " (simulado)" : ""}`, `US$ ${x.usd.toFixed(2)} · ${brl(x.brl)}`])} />
        <div className="md:col-span-2"><Tabela titulo="Por projeto" linhas={porProjeto.map((x) => [<a key={x.id} className="underline" href={`/projetos/${x.id}`}>{x.titulo}</a>, `${brl(x.brl)} / ${brl(Number(x.limite_custo))}`])} /></div>
      </div>
    </>
  );
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: [React.ReactNode, string][] }) {
  return (
    <section className="cartao p-4">
      <h2 className="mb-2 text-sm font-semibold">{titulo}</h2>
      {linhas.length === 0 ? <p className="text-xs text-cinza">Sem gastos.</p> : (
        <ul className="divide-y divide-borda text-sm">{linhas.map(([a, b], i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span className="truncate">{a}</span><span className="shrink-0 font-mono text-xs">{b}</span></li>)}</ul>
      )}
    </section>
  );
}
