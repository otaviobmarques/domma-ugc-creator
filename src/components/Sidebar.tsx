"use client";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { Home, Plus, Folder, Users, Package, Tag, Wallet, Settings, LogOut, Monitor, Download } from "lucide-react";
import { Logo } from "./ui";

type Item = { href: string; t: string; i: typeof Home; papeis?: string[] };
const GRUPOS: { t: string; itens: Item[] }[] = [
  { t: "Produção", itens: [
    { href: "/", t: "Painel", i: Home },
    { href: "/projetos", t: "Projetos", i: Folder },
  ] },
  { t: "Biblioteca", itens: [
    { href: "/atores", t: "Atores e consentimentos", i: Users },
    { href: "/produtos", t: "Produtos", i: Package },
    { href: "/marcas", t: "Marcas e clientes", i: Tag },
  ] },
  { t: "Administração", itens: [
    { href: "/custos", t: "Custos", i: Wallet, papeis: ["admin", "produtor"] },
    { href: "/configuracoes", t: "Configurações", i: Settings, papeis: ["admin"] },
  ] },
];

const PAPEL: Record<string, string> = { admin: "Administrador", produtor: "Produtor", revisor: "Revisor", cliente: "Cliente" };

export function Sidebar({ workspace, usuario, papel, versaoPC }: { workspace: string; usuario: string; papel: string; versaoPC: string | null }) {
  const path = usePathname();
  const ativo = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const novoAtivo = path.startsWith("/novo") || /\/projetos\/[^/]+\//.test(path);
  const iniciais = usuario.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const podeCriar = ["admin", "produtor"].includes(papel);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-borda bg-white md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-5 pt-5 md:block">
        <Logo />
        <span className="mt-0 inline-block rounded-full bg-roxo-claro px-2 py-0.5 text-[11px] font-medium text-roxo md:mt-3">UGC Creator</span>
      </div>

      {podeCriar && (
        <div className="px-4 pt-5">
          <a href="/novo" className={clsx("btn-primario w-full", novoAtivo && "ring-4 ring-roxo/15")}>
            <Plus size={16} /> Novo UGC
          </a>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 pt-4 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto md:pb-4">
        {GRUPOS.map((g) => {
          const itens = g.itens.filter((i) => !i.papeis || i.papeis.includes(papel));
          if (!itens.length) return null;
          return (
            <div key={g.t} className="flex gap-1 md:mb-4 md:block">
              <div className="hidden px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cinza/80 md:block">{g.t}</div>
              {itens.map(({ href, t, i: I }) => (
                <a key={href} href={href}
                  className={clsx(
                    "relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition md:mb-0.5",
                    ativo(href) ? "bg-roxo-claro font-semibold text-roxo" : "text-tinta-2 hover:bg-fundo",
                  )}>
                  {ativo(href) && <span className="absolute left-0 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-r-full bg-roxo md:block" />}
                  <I size={16} strokeWidth={ativo(href) ? 2.2 : 1.8} /> {t}
                </a>
              ))}
            </div>
          );
        })}
        {/* No celular, a Versão para PC também aparece na barra de navegação. */}
        <a href="/versao-pc" className={clsx("flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[13px] md:hidden", ativo("/versao-pc") ? "bg-roxo-claro font-semibold text-roxo" : "text-tinta-2")}>
          <Monitor size={16} /> Versão para PC
        </a>
      </nav>

      <div className="hidden px-4 pb-4 md:block">
        <a href="/versao-pc"
          className={clsx(
            "group block rounded-2xl bg-gradient-to-br from-roxo to-[#8a7bff] p-4 text-white shadow-[0_10px_24px_-12px_rgba(101,81,251,0.8)] transition hover:brightness-105",
            ativo("/versao-pc") && "ring-4 ring-roxo/20",
          )}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Monitor size={18} /></span>
            <div>
              <div className="text-sm font-semibold leading-tight">Versão para PC</div>
              <div className="text-[11px] text-white/75">Windows 10 e 11{versaoPC ? ` · v${versaoPC}` : ""}</div>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] leading-snug text-white/80">Instale no computador e monte os vídeos nele, sem custo de servidor.</p>
          <span className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-xs font-semibold text-roxo transition group-hover:bg-white/95">
            <Download size={13} /> Instalar no Windows
          </span>
        </a>

        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-borda p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tinta text-xs font-semibold text-white">{iniciais || "?"}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{usuario}</div>
            <div className="truncate text-[11px] text-cinza">{PAPEL[papel] ?? papel} · {workspace}</div>
          </div>
          <form action="/api/logout" method="post">
            <button title="Sair" aria-label="Sair" className="rounded-lg p-1.5 text-cinza hover:bg-fundo hover:text-erro"><LogOut size={15} /></button>
          </form>
        </div>
      </div>
    </aside>
  );
}
