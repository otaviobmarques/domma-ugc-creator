import { redirect, notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";

export default async function Projeto({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao();
  const { id } = await params;
  const [p] = await sql`select estado from projetos where id = ${id} and workspace_id = ${s.workspaceId}`;
  if (!p) notFound();
  if (["rascunho", "roteiro_gerado"].includes(p.estado)) redirect(`/projetos/${id}/roteiro`);
  if (["roteiro_aprovado", "em_producao", "em_qa", "pausado_custo"].includes(p.estado)) redirect(`/projetos/${id}/producao`);
  redirect(`/projetos/${id}/revisao`);
}
