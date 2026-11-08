import { Plus } from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { FiltroProjetos } from "@/components/FiltroProjetos";
import { exigirSessao } from "@/lib/sessao";
import { painel } from "@/lib/consultas";
import { linhasProjeto } from "@/lib/linhasProjeto";

export default async function Projetos() {
  const s = await exigirSessao();
  const d = await painel(s.workspaceId);
  return (
    <>
      <Cabecalho kicker="Projetos" titulo="Todos os projetos" sub="Cada projeto reúne as variações de um briefing."
        acoes={["admin", "produtor"].includes(s.papel) ? <a href="/novo" className="btn-primario"><Plus size={16} /> Criar UGC</a> : undefined} />
      <FiltroProjetos titulo={`${d.projetos.length} projeto${d.projetos.length === 1 ? "" : "s"}`} projetos={linhasProjeto(d.projetos)} />
    </>
  );
}
