import { sql, auditar } from "../db";
import { cambio } from "../providers/catalogo";

/**
 * Guardrail 6.2 / RF-30/31: checado no servidor antes de CADA job, não só pelo agente.
 * Retorna null se pode usar; senão, o motivo do bloqueio.
 */
export async function checarConsentimento(atorId: string, marcaId: string, canal = "meta_ads"): Promise<string | null> {
  const [ator] = await sql`select tipo, status from atores where id = ${atorId}`;
  if (!ator) return "ator não encontrado";
  if (ator.status === "bloqueado") return "ator bloqueado";
  if (ator.tipo === "sintetico") return null;
  const termos = await sql`
    select * from consentimentos
    where ator_id = ${atorId} and assinado_em is not null and revogado_em is null
      and inicio <= current_date and fim >= current_date`;
  if (!termos.length) return "sem termo de uso de imagem válido (assinado, vigente e não revogado)";
  const ok = termos.some(
    (t) => (t.marcas_permitidas as string[]).includes(marcaId) && ((t.canais as string[]).length === 0 || (t.canais as string[]).includes(canal) || (t.canais as string[]).includes("todos")),
  );
  return ok ? null : "o termo não autoriza esta marca ou canal";
}

export async function situacaoConsentimento(atorId: string) {
  const [ator] = await sql`select tipo from atores where id = ${atorId}`;
  if (!ator) return { estado: "inexistente" as const };
  if (ator.tipo === "sintetico") return { estado: "sintetico" as const };
  const [t] = await sql`select * from consentimentos where ator_id = ${atorId} order by criado_em desc limit 1`;
  if (!t) return { estado: "sem_termo" as const };
  if (t.revogado_em) return { estado: "revogado" as const, termo: t };
  if (!t.assinado_em) return { estado: "pendente" as const, termo: t };
  const fim = new Date(t.fim);
  const dias = Math.ceil((fim.getTime() - Date.now()) / 86400000);
  if (dias < 0) return { estado: "vencido" as const, termo: t };
  if (dias <= 30) return { estado: "vencendo" as const, termo: t, dias };
  return { estado: "valido" as const, termo: t, dias };
}

export async function custoProjeto(projetoId: string): Promise<number> {
  const [r] = await sql`select coalesce(sum(valor_brl),0)::float as total from custos where projeto_id = ${projetoId}`;
  return Number(r.total);
}

export async function registrarCusto(p: {
  workspaceId: string; projetoId: string; jobId: string | null; etapa: string; provedor: string;
  unidade: string; quantidade: number; usd: number;
}) {
  const c = cambio();
  await sql`insert into custos (workspace_id, projeto_id, job_id, etapa, provedor, unidade, quantidade, valor_usd, valor_brl, cambio)
    values (${p.workspaceId}, ${p.projetoId}, ${p.jobId}, ${p.etapa}, ${p.provedor}, ${p.unidade}, ${p.quantidade}, ${p.usd}, ${p.usd * c}, ${c})`;
  if (p.jobId) await sql`update jobs set custo_real = coalesce(custo_real,0) + ${p.usd} where id = ${p.jobId}`;
}

/**
 * Guardrail de custo: 80% avisa; 100% para e pede aprovação (RF-51).
 * Também respeita o limite mensal do workspace.
 */
export async function checarCusto(projetoId: string): Promise<"ok" | "pausar"> {
  const [p] = await sql`select p.workspace_id, p.limite_custo, w.limite_custo_mensal from projetos p join workspaces w on w.id = p.workspace_id where p.id = ${projetoId}`;
  const gasto = await custoProjeto(projetoId);
  const [m] = await sql`select coalesce(sum(valor_brl),0)::float as total from custos where workspace_id = ${p.workspace_id} and data >= date_trunc('month', now())`;
  if (gasto >= Number(p.limite_custo) || Number(m.total) >= Number(p.limite_custo_mensal)) return "pausar";
  if (gasto >= 0.8 * Number(p.limite_custo)) {
    const [ja] = await sql`select 1 from auditoria where projeto_id = ${projetoId} and acao = 'alerta_custo_80'`;
    if (!ja) {
      await auditar(p.workspace_id, "agente", "alerta_custo_80", {
        projetoId,
        dados: { mensagem: `Custo chegou a 80% do limite (R$ ${gasto.toFixed(2)} de R$ ${Number(p.limite_custo).toFixed(2)}).` },
      });
    }
  }
  return "ok";
}
