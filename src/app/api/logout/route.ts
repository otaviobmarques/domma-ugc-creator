import { NextResponse } from "next/server";
import { encerrarSessao } from "@/lib/sessao";

export async function POST(req: Request) {
  await encerrarSessao();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
