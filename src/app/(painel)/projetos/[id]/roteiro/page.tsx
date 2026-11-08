import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { Roteiro } from "./Roteiro";

export default async function PaginaRoteiro({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao();
  const { id } = await params;
  const [p] = await sql`select p.*, a.nome as ator_nome, a.tipo as ator_tipo, a.voz_clonada, a.voz_id as ator_voz, pr.nome as produto_nome
    from projetos p join atores a on a.id = p.ator_id join produtos pr on pr.id = p.produto_id where p.id = ${id} and p.workspace_id = ${s.workspaceId}`;
  if (!p) notFound();
  const variacoes = await sql`select id, letra, angulo, roteiro, verificacao from variacoes where projeto_id = ${id} order by letra`;
  const [rot] = await sql`select config_provedores from workspaces where id = ${s.workspaceId}`;
  return (
    <Roteiro
      projeto={{ id: p.id, estado: p.estado, n: p.n_variacoes, produto: p.produto_nome, ator: p.ator_nome, atorTipo: p.ator_tipo, vozClonada: p.voz_clonada, vozId: p.voz_id ?? p.ator_voz, ritmo: p.voz_ritmo }}
      variacoes={variacoes.map((v) => ({ id: v.id, letra: v.letra, angulo: v.angulo, roteiro: v.roteiro, verificacao: v.verificacao }))}
      provedores={{ lipsync: rot.config_provedores?.lipsync?.principal ?? "fal-kling-avatar", broll: rot.config_provedores?.broll?.principal ?? "fal-seedance" }}
      podeEditar={["admin", "produtor"].includes(s.papel)}
    />
  );
}
