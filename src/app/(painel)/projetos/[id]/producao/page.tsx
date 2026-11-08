import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { statusProjeto } from "@/lib/consultas";
import { Producao } from "./Producao";

export default async function PaginaProducao({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSessao();
  const { id } = await params;
  const [p] = await sql`select 1 from projetos where id = ${id} and workspace_id = ${s.workspaceId}`;
  if (!p) notFound();
  return <Producao id={id} inicial={JSON.parse(JSON.stringify(await statusProjeto(id)))} podeEditar={["admin", "produtor"].includes(s.papel)} />;
}
