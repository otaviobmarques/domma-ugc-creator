import { NextResponse, type NextRequest } from "next/server";

// Checagem leve de presença do cookie; a validação real (assinatura, papel,
// workspace) acontece no servidor em exigirSessao()/exigirApi().
const PUBLICAS = ["/login", "/aprovar", "/termo", "/api/login", "/api/aprovacao", "/api/termo", "/api/midia", "/api/webhooks"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/")) || pathname.startsWith("/_next")) return NextResponse.next();
  if (!req.cookies.get("ugc_sessao")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
