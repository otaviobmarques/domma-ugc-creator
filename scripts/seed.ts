/** Dados de exemplo: workspace RedBox, marcas, atores (com e sem termo), produtos. */
import "dotenv/config";
import { sql } from "../src/lib/db";
import { hashSenha, sha256, tokenAleatorio } from "../src/lib/crypto";
import { garantirBucket, garantirPasta, publicar } from "../src/lib/storage";
import { ffmpeg, filtroTexto } from "../src/lib/ffmpeg";

async function imagem(chave: string, filtro: string) {
  await ffmpeg(["-f", "lavfi", "-i", filtro, "-frames:v", "1", await garantirPasta(chave)]);
  return publicar(chave);
}

async function retrato(ws: string, nome: string, cor: string) {
  // Retrato ilustrativo (silhueta) — substitua por fotos reais com termo.
  return imagem(
    `${ws}/atores/${nome.toLowerCase().replace(/\W+/g, "-")}.png`,
    `color=c=${cor}:s=768x1024,drawbox=x=234:y=180:w=300:h=360:color=0xf1d4c0:t=fill,drawbox=x=134:y=560:w=500:h=464:color=0x3b3366:t=fill,` +
      await filtroTexto([{ texto: nome, tamanho: 56, x: 384, y: 1024 - 130 }], 768, 1024),
  );
}

async function frasco(ws: string, nome: string, rotulo: string, cor: string) {
  return imagem(
    `${ws}/produtos/${nome}.png`,
    `color=c=0xf4f2fb:s=800x800,drawbox=x=320:y=120:w=160:h=90:color=0x222222:t=fill,drawbox=x=260:y=200:w=280:h=480:color=${cor}:t=fill,` +
      `drawbox=x=280:y=330:w=240:h=200:color=white:t=fill,` + (await filtroTexto([{ texto: rotulo, tamanho: 34, x: 400, y: 410, cor: "222222" }], 800, 800)),
  );
}

async function main() {
  const [ja] = await sql`select id from workspaces where nome = 'RedBox'`;
  if (ja) {
    console.log("seed já aplicado (workspace RedBox existe)");
    return sql.end();
  }
  await garantirBucket().catch(() => false);
  const senha = process.env.SENHA_ADMIN ?? "domma123";
  const [ws] = await sql`insert into workspaces (nome, limite_custo_mensal) values ('RedBox', 3000) returning id`;
  const W = ws.id as string;
  const [admin] = await sql`insert into usuarios (email, nome, senha_hash) values ('admin@redbox.com.br', 'Caio', ${hashSenha(senha)}) returning id`;
  const [rev] = await sql`insert into usuarios (email, nome, senha_hash) values ('revisor@redbox.com.br', 'Bruna', ${hashSenha(senha)}) returning id`;
  await sql`insert into membros (workspace_id, usuario_id, papel) values (${W}, ${admin.id}, 'admin'), (${W}, ${rev.id}, 'revisor')`;

  // Música de exemplo (trilha calma gerada) para testar a mixagem.
  const musica = `${W}/musicas/trilha-calma.mp3`;
  await ffmpeg([
    "-f", "lavfi", "-i", "aevalsrc=0.15*sin(2*PI*261.6*t)+0.12*sin(2*PI*329.6*t)+0.1*sin(2*PI*392*t):s=44100:d=20",
    "-af", "afade=t=in:d=1,volume=0.6", "-c:a", "libmp3lame", "-b:a", "96k", await garantirPasta(musica),
  ]);
  await publicar(musica);

  const marcas = [
    { nome: "Royal Vistorias", diretrizes: "Tom próximo e confiável. Falar de praticidade e cuidado com a pele.", vetados: ["barato", "milagroso"] },
    { nome: "Master Laudo", diretrizes: "Linguagem simples, foco em segurança na compra de carro usado.", vetados: ["garantia total"] },
    { nome: "Operação iFood", diretrizes: "Descontraído, apetitoso, chamada para pedir agora.", vetados: [] },
    { nome: "Auto Visão", diretrizes: "Rapidez: vistoria em 20 minutos.", vetados: [] },
  ];
  const ids: Record<string, string> = {};
  for (const m of marcas) {
    const [r] = await sql`insert into marcas (workspace_id, nome, diretrizes, termos_vetados, musicas_permitidas)
      values (${W}, ${m.nome}, ${m.diretrizes}, ${m.vetados}, ${[musica]}) returning id`;
    ids[m.nome] = r.id;
  }

  const fotoSerum = await frasco(W, "serum-vitamina-c", "VITAMINA C", "0xf2a541");
  await sql`insert into produtos (workspace_id, marca_id, nome, descricao, preco, imagens)
    values (${W}, ${ids["Royal Vistorias"]}, 'Sérum vitamina C', 'Sérum facial leve com vitamina C. Aplicar de manhã, antes do protetor. Não deixa a pele grudando.', 'R$ 89,90', ${[fotoSerum]})`;
  const fotoLaudo = await frasco(W, "laudo-cautelar", "LAUDO", "0x5b3df5");
  await sql`insert into produtos (workspace_id, marca_id, nome, descricao, preco, imagens)
    values (${W}, ${ids["Master Laudo"]}, 'Laudo cautelar', 'Laudo cautelar completo do veículo antes da compra: estrutura, chassi, histórico.', 'R$ 249,00', ${[fotoLaudo]})`;
  const fotoCombo = await frasco(W, "combo-burger", "BURGER", "0xd9480f");
  await sql`insert into produtos (workspace_id, marca_id, nome, descricao, preco, imagens)
    values (${W}, ${ids["Operação iFood"]}, 'Combo burger', 'Burger artesanal, batata e refri. Entrega rápida.', 'R$ 39,90', ${[fotoCombo]})`;

  const hoje = new Date();
  const d = (dias: number) => new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10);
  const todasMarcas = Object.values(ids);

  const [ju] = await sql`insert into atores (workspace_id, tipo, nome, descricao, foto_url, voz_clonada)
    values (${W}, 'real', 'Juliana', 'Mulher de 30 anos, cabelo castanho, estilo natural', ${await retrato(W, "Juliana", "0x7c6bd6")}, true) returning id`;
  await sql`insert into consentimentos (workspace_id, ator_id, titular, finalidade, marcas_permitidas, canais, inicio, fim, assinado_em, ip, documento_hash)
    values (${W}, ${ju.id}, 'Juliana Souza', 'Vídeos publicitários UGC', ${todasMarcas}, ${["meta_ads", "tiktok"]}, ${d(-30)}, '2027-12-31', now(), '127.0.0.1', ${sha256("termo-juliana")})`;

  const [ma] = await sql`insert into atores (workspace_id, tipo, nome, descricao, foto_url)
    values (${W}, 'real', 'Marcos', 'Homem de 40 anos, barba, camisa polo', ${await retrato(W, "Marcos", "0x3d8b7d")}) returning id`;
  await sql`insert into consentimentos (workspace_id, ator_id, titular, finalidade, marcas_permitidas, canais, inicio, fim, assinado_em, ip, documento_hash)
    values (${W}, ${ma.id}, 'Marcos Lima', 'Vídeos publicitários UGC', ${[ids["Master Laudo"], ids["Auto Visão"]]}, ${["todos"]}, ${d(-300)}, ${d(9)}, now(), '127.0.0.1', ${sha256("termo-marcos")})`;

  await sql`insert into atores (workspace_id, tipo, nome, descricao, foto_url)
    values (${W}, 'real', 'Envio sem nome', 'Foto enviada sem termo', ${await retrato(W, "Sem termo", "0x888888")})`;

  for (const [nome, desc, cor] of [
    ["Rafa", "Ator sintético, 30 a 35 anos, estilo casual", "0x4c6ef5"],
    ["Dona Célia", "Atriz sintética, 60+, simpática, cozinha de casa", "0xc2255c"],
    ["Bia", "Atriz sintética, 20 a 25 anos, estilo jovem", "0xe8590c"],
  ]) {
    await sql`insert into atores (workspace_id, tipo, nome, descricao, foto_url, prompt_origem)
      values (${W}, 'sintetico', ${nome}, ${desc}, ${await retrato(W, nome, cor)}, ${`Retrato fotorrealista: ${desc}`})`;
  }
  // um termo pendente de assinatura para demonstrar o fluxo
  await sql`insert into consentimentos (workspace_id, ator_id, titular, finalidade, marcas_permitidas, canais, inicio, fim, token_assinatura, documento_hash)
    select ${W}, id, 'Titular a confirmar', 'Vídeos publicitários UGC', ${todasMarcas}, ${["meta_ads"]}, ${d(0)}, ${d(365)}, ${tokenAleatorio()}, ${sha256("pendente")}
    from atores where nome = 'Envio sem nome'`;

  console.log(`seed ok. Login: admin@redbox.com.br / ${senha}  (revisor@redbox.com.br / ${senha})`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
