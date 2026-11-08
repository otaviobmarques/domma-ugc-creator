import { Sidebar } from "@/components/Sidebar";
import { exigirSessao } from "@/lib/sessao";
import { ultimaVersaoPC } from "@/lib/versaoPC";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const v = await ultimaVersaoPC();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar workspace={s.workspaceNome} usuario={s.nome} papel={s.papel} versaoPC={v?.versao ?? null} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-9"><div className="mx-auto max-w-[1400px]">{children}</div></main>
    </div>
  );
}
