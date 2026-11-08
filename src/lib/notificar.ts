import { sql, auditar } from "./db";
import { obterChave } from "./providers";

/** RF-25: avisa por e-mail (Resend) e WhatsApp (Domma Chat). Falhas não derrubam o pipeline. */
export async function notificar(workspaceId: string, projetoId: string, titulo: string, mensagem: string) {
  const canais: string[] = [];
  const [p] = await sql`select u.email, u.nome from projetos p left join usuarios u on u.id = p.criado_por where p.id = ${projetoId}`;
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/projetos/${projetoId}`;
  try {
    const key = (await obterChave(workspaceId, "resend")) ?? process.env.RESEND_API_KEY;
    if (key && p?.email) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_REMETENTE ?? "UGC Creator <ugc@domma.com.br>",
          to: [p.email],
          subject: titulo,
          html: `<p>${mensagem}</p><p><a href="${link}">Abrir no UGC Creator</a></p>`,
        }),
      });
      if (r.ok) canais.push("email");
    }
  } catch (e) {
    console.error("[notificar] email", e);
  }
  try {
    const token = await obterChave(workspaceId, "domma_chat");
    const url = process.env.DOMMA_CHAT_WEBHOOK_URL;
    if (token && url) {
      const r = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ titulo, mensagem, link, projetoId }),
      });
      if (r.ok) canais.push("whatsapp");
    }
  } catch (e) {
    console.error("[notificar] domma chat", e);
  }
  await auditar(workspaceId, "agente", "notificar", { projetoId, dados: { mensagem: `${titulo}: ${mensagem}`, canais } });
}
