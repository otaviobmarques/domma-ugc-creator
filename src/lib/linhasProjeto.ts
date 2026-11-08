import { brl, tempoRelativo } from "@/components/ui";
import type { LinhaProjeto } from "@/components/FiltroProjetos";

const ETAPA: Record<string, string> = { narracao: "narração", imagem: "imagem", lipsync: "lip-sync", broll: "B-roll", montagem: "montagem", qa: "revisão" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function linhasProjeto(projetos: Record<string, any>[]): LinhaProjeto[] {
  return projetos.map((p) => ({
    id: p.id,
    titulo: p.titulo,
    marca: p.marca,
    produto: p.produto,
    ator: p.ator,
    foto: p.ator_foto,
    formato: `${p.formato} · ${p.duracao_s} s`,
    n: p.n_variacoes,
    estado: p.estado,
    progresso: p.progresso,
    aprovadas: p.aprovadas,
    falha: p.falhas ? `Falha${p.etapa_falha ? ` no ${ETAPA[p.etapa_falha] ?? p.etapa_falha}` : ""}` : undefined,
    custo: p.custo ? brl(p.custo) : "—",
    quando: tempoRelativo(p.atualizado_em),
  }));
}
