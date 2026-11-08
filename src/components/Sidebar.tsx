"use client";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { Home, Plus, Folder, Users, Package, Tag, Wallet, Settings, LogOut } from "lucide-react";
import { Logo } from "./ui";

const ITENS = [
  { href: "/", t: "Painel", i: Home },
  { href: "/novo", t: "Novo UGC", i: Plus },
  { href: "/projetos", t: "Projetos", i: Folder },
  { href: "/atores", t: "Atores e consentimentos", i: Users },
  { href: "/produtos", t: "Produtos", i: Package },
  { href: "/marcas", t: "Marcas e clientes", i: Tag },
  { href: "/custos", t: "Custos", i: Wallet, papeis: ["admin", "produtor"] },
  { href: "/configuracoes", t: "Configurações", i: Settings, papeis: ["admin"] },
];

export function Sidebar({ workspace, usuario, papel }: { workspace: string; usuario: string; papel: string }) {
  const path = usePathname();
  const ativo = (h: string) => (h === "/" ? path === "/" : path.startsWith(h) || (h === "/novo" && /\/projetos\/[^/]+\//.test(path)));
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-borda bg-lavanda px-4 py-5 md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
      <Logo />
      <span className="mt-3 w-fit rounded-full bg-roxo-claro px-2 py-0.5 text-[11px] font-medium text-roxo">UGC Creator</span>
      <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col">
        {ITENS.filter((i) => !i.papeis || i.papeis.includes(papel)).map(({ href, t, i: I }) => (
          <a key={href} href={href}
            className={clsx("flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px]", ativo(href) ? "bg-roxo-claro font-medium text-roxo" : "text-tinta hover:bg-white")}>
            <I size={15} strokeWidth={1.8} /> {t}
          </a>
        ))}
      </nav>
      <div className="mt-6 hidden border-t border-borda pt-4 text-xs md:block">
        <div className="text-cinza">Workspace</div>
        <div className="font-semibold">{workspace}</div>
        <div className="mt-3 text-cinza">{usuario} · {papel}</div>
        <form action="/api/logout" method="post">
          <button className="mt-2 flex items-center gap-1.5 text-cinza hover:text-roxo"><LogOut size={13} /> Sair</button>
        </form>
      </div>
    </aside>
  );
}
