import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { statusProjeto } from "@/lib/consultas";
import { Revisao } from "./Revisao";

export default async function PaginaRevisao({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao();
  const { id } = await params;
  const [p] = await sql`select 1 from projetos where id = ${id} and workspace_id = ${s.workspaceId}`;
  if (!p) notFound();
  return <Revisao id={id} inicial={JSON.parse(JSON.stringify(await statusProjeto(id)))} papel={s.papel} />;
}
