import * as z from "zod/v4";
import { chamarJSON, clienteClaude } from "./claude";
import { ler, mimeDe } from "../storage";

const ChecagemSchema = z.object({
  pessoa_visivel: z.boolean(),
  aparenta_menor_de_idade: z.boolean(),
  figura_publica_provavel: z.boolean().describe("true se parece ser celebridade, político ou figura pública amplamente conhecida"),
  motivo: z.string(),
});

/**
 * RF-33 / 11.1: bloqueia figuras públicas e menores de idade.
 * Não identifica a pessoa — só sinaliza se a foto aparenta ser de alguém amplamente conhecido ou menor.
 */
export async function checarFotoAtor(workspaceId: string, chave: string) {
  const client = await clienteClaude(workspaceId);
  if (!client) return { bloquear: false, motivo: "checagem de figura pública indisponível sem chave do Claude", simulado: true };
  const r = await chamarJSON({
    client,
    workspaceId,
    projetoId: null,
    etapa: "checagem_foto",
    effort: "low",
    system:
      "Você faz triagem de fotos enviadas para uso em anúncios. Não identifique nem nomeie ninguém. Responda apenas se a foto " +
      "aparenta ser de menor de idade e se aparenta ser de uma figura pública amplamente conhecida (por contexto como palco, " +
      "tapete vermelho, púlpito, aparência de foto de imprensa ou de campanha).",
    conteudo: [
      { type: "image", source: { type: "base64", media_type: mimeDe(chave) as "image/png", data: (await ler(chave)).toString("base64") } },
      { type: "text", text: "Faça a triagem desta foto." },
    ],
    schema: ChecagemSchema,
  });
  const bloquear = r.aparenta_menor_de_idade || r.figura_publica_provavel || !r.pessoa_visivel;
  return { bloquear, motivo: r.motivo, simulado: false };
}
