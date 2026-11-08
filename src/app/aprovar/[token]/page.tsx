import { sql } from "@/lib/db";
import { urlAssinada } from "@/lib/storage";
import { Aprovar } from "./Aprovar";

export const dynamic = "force-dynamic";

export default async function PaginaAprovar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [p] = await sql`select p.id, pr.nome as produto, m.nome as marca from projetos p join produtos pr on pr.id = p.produto_id join marcas m on m.id = p.marca_id where p.token_aprovacao = ${token}`;
  if (!p) return <main className="p-10 text-center text-sm text-cinza">Link inválido ou expirado.</main>;
  const vars = await sql`select id, letra, estado, video_final_url, escolhida_cliente from variacoes where projeto_id = ${p.id} and video_final_url is not null and estado <> 'reprovado' order by letra`;
  return (
    <Aprovar token={token} produto={p.produto} marca={p.marca}
      variacoes={vars.map((v) => ({ id: v.id, letra: v.letra, video: urlAssinada(v.video_final_url, 6 * 3600)!, aprovada: v.estado === "aprovado" && v.escolhida_cliente }))} />
  );
}
