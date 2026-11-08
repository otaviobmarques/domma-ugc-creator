import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { urlAssinada } from "@/lib/storage";
import { Cabecalho } from "@/components/ui";
import { FormMarca } from "./FormMarca";

export default async function Marcas() {
  const s = await exigirSessao();
  const marcas = await sql`select m.*, (select count(*) from projetos p where p.marca_id = m.id)::int as projetos from marcas m where workspace_id = ${s.workspaceId} order by nome`;
  const pode = ["admin", "produtor"].includes(s.papel);
  return (
    <>
      <Cabecalho kicker="Clientes" titulo="Marcas e clientes" sub="Diretrizes, termos vetados, logo e músicas permitidas de cada marca." />
      {pode && <FormMarca />}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {marcas.map((m) => (
          <div key={m.id} className="cartao p-5">
            <div className="flex items-center gap-3">
              {m.logo_url ? <img src={urlAssinada(m.logo_url)!} alt="" className="h-9 w-9 rounded object-contain" /> : <span className="h-9 w-9 rounded bg-roxo-claro" />}
              <div><div className="font-semibold">{m.nome}</div><div className="text-xs text-cinza">{m.projetos} projeto(s) · {m.musicas_permitidas.length} música(s)</div></div>
            </div>
            <p className="mt-3 text-sm">{m.diretrizes || <span className="text-cinza">Sem diretrizes.</span>}</p>
            {m.termos_vetados.length > 0 && <p className="mt-2 text-xs text-erro">Vetados: {m.termos_vetados.join(", ")}</p>}
            {pode && <FormMarca marca={{ id: m.id, nome: m.nome, diretrizes: m.diretrizes, termos_vetados: m.termos_vetados.join(", ") }} />}
          </div>
        ))}
      </div>
    </>
  );
}
