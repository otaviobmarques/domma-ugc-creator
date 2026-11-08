export type Etapa = "roteiro" | "narracao" | "imagem" | "lipsync" | "broll" | "montagem" | "qa";

export interface Ctx {
  workspaceId: string;
  projetoId: string;
  /** chave de API decifrada (null no simulador) */
  apiKey: string | null;
}

export interface Uso {
  custoUsd: number;
  unidade: string;
  quantidade: number;
}

export interface ResultadoArquivo extends Uso {
  /** chave no armazenamento */
  chave: string;
  duracaoS?: number;
}

export interface ProvedorTTS {
  id: string;
  gerarNarracao(
    p: { texto: string; vozId: string | null; ritmo: "animada" | "natural" | "calma" },
    ctx: Ctx,
  ): Promise<ResultadoArquivo>;
}

export interface ProvedorImagem {
  id: string;
  gerarImagemChave(
    p: { fotoAtor: string | null; fotosProduto: string[]; cena: string; formato: string },
    ctx: Ctx,
  ): Promise<ResultadoArquivo>;
}

export type StatusExterno =
  | { status: "gerando"; progresso: number }
  | { status: "concluido"; chave: string; duracaoS: number; uso: Uso }
  | { status: "falha"; erro: string };

/** Contrato de vídeo assíncrono — igual ao descrito na seção 5.3. */
export interface ProvedorVideo {
  id: string;
  /** gerarFala({ imagemUrl, audioUrl, resolucao, prompt? }) -> { jobExternoId } */
  gerarFala?(
    p: { imagem: string; audio: string; resolucao: string; prompt?: string; duracaoS: number; formato: string },
    ctx: Ctx,
  ): Promise<{ jobExternoId: string }>;
  gerarBroll?(
    p: { imagem: string; prompt: string; duracaoS: number; resolucao: string; formato: string },
    ctx: Ctx,
  ): Promise<{ jobExternoId: string }>;
  /** consultar(jobExternoId) -> { status, videoUrl?, duracao, custoReal, erro? } */
  consultar(jobExternoId: string, ctx: Ctx): Promise<StatusExterno>;
}

export class ErroProvedor extends Error {
  constructor(
    msg: string,
    public readonly codigo: "chave_invalida" | "saldo" | "limite" | "temporario" | "entrada" | "desconhecido" = "desconhecido",
  ) {
    super(msg);
  }
}
