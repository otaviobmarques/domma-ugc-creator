import { Download, Monitor, Check, Clock, ShieldCheck, AlertTriangle } from "lucide-react";
import { sql } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";
import { Cabecalho, Cartao, Selo, tempoRelativo } from "@/components/ui";
import { ultimaVersaoPC } from "@/lib/versaoPC";

export default async function VersaoPC() {
  const s = await exigirSessao();
  const [v, pcs] = await Promise.all([
    ultimaVersaoPC(),
    sql`select a.maquina, a.versao, a.visto_em, u.nome from agentes_locais a join usuarios u on u.id = a.usuario_id
        where a.workspace_id = ${s.workspaceId} order by a.visto_em desc limit 20`,
  ]);
  const [m] = await sql`select count(*) filter (where provedor like 'pc:%')::int as pc, count(*)::int as total
    from jobs where workspace_id = ${s.workspaceId} and etapa = 'montagem' and estado = 'concluido' and criado_em > now() - interval '30 days'`;
  const online = (d: Date) => Date.now() - new Date(d).getTime() < 60_000;

  return (
    <>
      <Cabecalho kicker="Versão Local" titulo="Versão para PC (Windows)"
        sub="O mesmo UGC Creator, com a mesma conta e os mesmos projetos. Enquanto o app está aberto, a montagem dos vídeos é feita no seu computador."
        acoes={v ? <a className="btn-primario" href={v.url}><Download size={15} /> Baixar para Windows</a> : undefined} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Cartao titulo="Download">
            {v ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-roxo-claro text-roxo"><Monitor size={20} /></span>
                  <div>
                    <div className="font-semibold">Domma UGC Creator {v.versao}</div>
                    <div className="text-xs text-cinza">Windows 10 ou 11 (64 bits) · {v.tamanhoMB.toFixed(0)} MB · publicada {tempoRelativo(v.data)}</div>
                  </div>
                </div>
                <a className="btn-primario" href={v.url}><Download size={15} /> Baixar instalador</a>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-alerta-claro px-4 py-3 text-sm text-alerta">
                <Clock size={15} /> O instalador está sendo gerado. Volte em alguns minutos.
              </div>
            )}
          </Cartao>

          <Cartao titulo="Como instalar">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Baixe e abra o <b>DommaUGCCreator-Setup.exe</b>.</li>
              <li>
                Se o Windows mostrar <i>“O Windows protegeu o computador”</i>, clique em <b>Mais informações › Executar assim mesmo</b>.
                <span className="block text-xs text-cinza">O aviso aparece porque o instalador ainda não tem certificado de assinatura de código.</span>
              </li>
              <li>Siga o instalador e abra o <b>Domma UGC Creator</b> pelo atalho na área de trabalho.</li>
              <li>Entre com o mesmo usuário e senha do painel. Pronto: o título da janela mostra <b>“montagem no PC ativa”</b>.</li>
            </ol>
          </Cartao>

          <Cartao titulo="Como funciona">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" /> Mesma conta, mesmos projetos e custos da versão Web. Nada para sincronizar.</li>
              <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" /> A geração por IA (roteiro, voz, imagem, lip-sync, B-roll) continua nas APIs dos provedores. Não precisa de placa de vídeo.</li>
              <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" /> A montagem (legendas, B-roll, música, logo) roda no seu PC, sem custo de servidor.</li>
              <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" /> Fechar a janela deixa o app na bandeja do Windows, ao lado do relógio, e a montagem continua.</li>
              <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" /> Se o PC desligar ou falhar, a nuvem assume em até 2 minutos. A produção nunca para.</li>
              <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-ok" /> Atualiza sozinho quando sai uma versão nova.</li>
            </ul>
          </Cartao>
        </div>

        <div className="space-y-4">
          <Cartao titulo="PCs conectados">
            {pcs.length === 0 ? (
              <p className="text-sm text-cinza">Nenhum PC conectado ainda.</p>
            ) : (
              <ul className="divide-y divide-borda text-sm">
                {pcs.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{p.maquina}</span>
                      <span className="block text-xs text-cinza">{p.nome} · v{p.versao || "?"} · {tempoRelativo(p.visto_em)}</span>
                    </span>
                    {online(p.visto_em) ? <Selo tom="ok" icone={<Check size={11} />}>Online</Selo> : <Selo icone={<Clock size={11} />}>Offline</Selo>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 border-t border-borda pt-3 text-xs text-cinza">
              Últimos 30 dias: {m.pc} de {m.total} montagens feitas em PCs.
            </div>
          </Cartao>
          <Cartao>
            <div className="flex gap-2">
              <ShieldCheck size={17} className="shrink-0 text-roxo" />
              <div className="text-xs text-cinza">
                <b className="text-tinta">Segurança.</b> O app não guarda senha do banco nem chaves de API. Ele usa só o seu login e recebe
                links temporários (válidos por 3 horas) para os arquivos de cada montagem.
              </div>
            </div>
          </Cartao>
          {!["admin", "produtor"].includes(s.papel) && (
            <div className="flex gap-2 rounded-lg bg-alerta-claro px-4 py-3 text-xs text-alerta">
              <AlertTriangle size={14} className="shrink-0" /> A montagem no PC só é ativada para administradores e produtores.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
