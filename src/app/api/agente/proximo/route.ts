import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { exigirApi, rota } from "@/lib/sessao";
import { registrarAgente } from "@/lib/agente";
import { entradaMontagem } from "@/lib/pipeline/orquestrador";
import { urlAssinada } from "@/lib/storage";

/** Entrega ao PC a próxima montagem pendente do workspace (reserva atômica). */
export const POST = rota(async (req: Request) => {
  const s = await exigirApi(["admin", "produtor"]);
  const b = (await req.json().catch(() => ({}))) as { maquina?: string; versao?: string };
  const a = await registrarAgente(s, b.maquina ?? "", b.versao ?? "");
  const [j] = await sql`
    update jobs set estado = 'gerando', iniciado_em = now(), agente_id = ${a.id}, progresso = 10, provedor = ${"pc:" + a.maquina}
    where id = (select id from jobs where workspace_id = ${s.workspaceId} and executor = 'local' and estado = 'na_fila' and etapa = 'montagem'
                order by criado_em limit 1 for update skip locked)
    returning id, variacao_id`;
  if (!j) return NextResponse.json({ job: null });
  const e = await entradaMontagem(j.variacao_id);
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const link = (chave: string | null) => (chave ? new URL(urlAssinada(chave, 3 * 3600)!, base).toString() : null);
  return NextResponse.json({
    job: {
      id: j.id,
      formato: e.formato,
      qualidade: e.qualidade,
      roteiro: e.roteiro,
      marcaIA: e.marcaIA,
      fala: link(e.fala),
      brolls: e.brolls.map((x) => ({ url: link(x.chave), inicio: x.inicio, fim: x.fim })),
      logo: link(e.logo),
      musica: link(e.musica),
      projeto: e.p.titulo,
      variacao: e.v.letra,
    },
  });
});
