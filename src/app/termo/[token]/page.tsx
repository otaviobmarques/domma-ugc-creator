import { sql } from "@/lib/db";
import { textoTermo } from "@/lib/termo";
import { Logo } from "@/components/ui";
import { Assinar } from "./Assinar";

export const dynamic = "force-dynamic";

export default async function Termo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t] = await sql`select c.*, a.nome as ator from consentimentos c join atores a on a.id = c.ator_id where c.token_assinatura = ${token} and c.assinado_em is null and c.revogado_em is null`;
  if (!t) return <main className="p-10 text-center text-sm text-cinza">Link inválido ou termo já assinado.</main>;
  const marcas = await sql`select nome from marcas where id in ${sql(t.marcas_permitidas.length ? t.marcas_permitidas : ["00000000-0000-0000-0000-000000000000"])}`;
  const texto = textoTermo({ titular: t.titular, finalidade: t.finalidade, marcas: marcas.map((m) => m.nome), canais: t.canais, inicio: new Date(t.inicio).toLocaleDateString("pt-BR"), fim: new Date(t.fim).toLocaleDateString("pt-BR"), usaVoz: t.usa_voz });
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Logo />
      <h1 className="mt-6 text-xl font-semibold">Autorização de uso de imagem{t.usa_voz ? " e voz" : ""}</h1>
      <pre className="cartao mt-4 whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed">{texto}</pre>
      <Assinar token={token} titular={t.titular} />
    </main>
  );
}
