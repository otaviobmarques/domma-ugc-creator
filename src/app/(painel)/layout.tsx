import { Sidebar } from "@/components/Sidebar";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar workspace={s.workspaceNome} usuario={s.nome} papel={s.papel} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
