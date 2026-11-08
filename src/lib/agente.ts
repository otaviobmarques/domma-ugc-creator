import { sql } from "./db";
import { ErroHttp, type Sessao } from "./sessao";

/** Registra (ou atualiza) o PC que está falando com a nuvem. */
export async function registrarAgente(s: Sessao, maquina: string, versao: string) {
  const nome = (maquina || "PC sem nome").slice(0, 80);
  const [a] = await sql`insert into agentes_locais (workspace_id, usuario_id, maquina, versao)
    values (${s.workspaceId}, ${s.usuarioId}, ${nome}, ${(versao || "").slice(0, 30)})
    on conflict (workspace_id, usuario_id, maquina) do update set visto_em = now(), versao = excluded.versao
    returning id, maquina`;
  return a as { id: string; maquina: string };
}

/** Garante que o job é de montagem no PC, deste workspace e deste PC. */
export async function jobDoAgente(jobId: string, s: Sessao, agenteId: string) {
  const [j] = await sql`select * from jobs where id = ${jobId}`;
  if (!j || j.workspace_id !== s.workspaceId) throw new ErroHttp(404, "job não encontrado");
  if (j.executor !== "local" || j.estado !== "gerando" || j.agente_id !== agenteId) throw new ErroHttp(409, "este job não está com este PC");
  return j;
}
