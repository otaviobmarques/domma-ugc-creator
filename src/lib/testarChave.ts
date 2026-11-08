import Anthropic from "@anthropic-ai/sdk";
import { testarElevenlabs, testarFal, testarOpenai } from "./providers/reais";

/** Testa a chave antes de salvar (RF-52). */
export async function testarChave(provedor: string, chave: string): Promise<{ ok: boolean; saldoBaixo: boolean; detalhe: string }> {
  switch (provedor) {
    case "anthropic": {
      const c = new Anthropic({ apiKey: chave, maxRetries: 1 });
      await c.models.retrieve("claude-opus-5-5");
      return { ok: true, saldoBaixo: false, detalhe: "chave aceita" };
    }
    case "elevenlabs":
      return testarElevenlabs(chave);
    case "openai":
      return testarOpenai(chave);
    case "fal":
      return testarFal(chave);
    case "resend": {
      const r = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${chave}` } });
      if (r.status === 401 || r.status === 403) throw new Error("chave recusada pelo Resend");
      return { ok: true, saldoBaixo: false, detalhe: "chave aceita" };
    }
    default:
      // Integrações internas Domma: sem endpoint de teste definido ainda.
      if (chave.length < 8) throw new Error("chave muito curta");
      return { ok: true, saldoBaixo: false, detalhe: "formato aceito (teste de conexão a definir)" };
  }
}
