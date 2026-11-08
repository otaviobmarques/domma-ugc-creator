# Domma UGC Creator

Sistema de produção de vídeos UGC com IA, implementado a partir do **Descritivo Técnico v1.1** (Scale360 / Domma Tecnologia).
Foto de uma pessoa + foto de um produto → vídeos curtos em que a pessoa fala, apresenta e demonstra o produto, coordenados por um agente (Claude).

## Rodar localmente

Pré-requisitos: Node 22, Postgres 16, FFmpeg.

```bash
cp .env.example .env          # preencha MASTER_KEY e APP_SECRET (comandos no arquivo)
npm install
npm run db:migrar             # aplica db/schema.sql
npm run db:seed               # workspace RedBox, marcas, atores, produtos de exemplo
npm run dev                   # painel em http://localhost:3000
npm run worker                # em outro terminal: executa a fila de produção
```

Login de exemplo: `admin@redbox.com.br` / `domma123` (revisor: `revisor@redbox.com.br`).

**Sem nenhuma chave de API o sistema funciona ponta a ponta** usando o *simulador*: cada etapa sem chave gera mídia de teste com FFmpeg e registra o custo estimado como "simulado". Cadastre as chaves em **Configurações › Chaves de API** e as etapas passam a usar os provedores reais. `PERMITIR_SIMULADOR=false` exige chaves reais.

Prova de conceito sem interface (Fase 0 do roadmap): `npm run poc -- "Sérum vitamina C" Juliana 20 1`

## O que está implementado (por seção do descritivo)

| Seção | Onde |
|---|---|
| 3.1 Briefing (RF-01 a 05) | `src/app/(painel)/novo`, `src/lib/upload.ts` (importa produto por link via Open Graph/JSON-LD ou upload), estimativa em `providers/catalogo.ts` |
| 3.2 Roteiro e voz (RF-10 a 14) | `src/lib/agent/roteiro.ts` — Claude com saída JSON validada por esquema, ângulos de gancho, verificação de linguagem (proibidas, vetadas, palavras/s, ator sintético), regerar por bloco ou variação, prévia de voz |
| 3.3 Produção (RF-20 a 25) | `src/lib/pipeline/orquestrador.ts` — cenas, jobs na fila, B-roll e lip-sync em paralelo, refação só da cena afetada, notificação (`lib/notificar.ts`) |
| 3.4 Consentimento (RF-30 a 33) | `pipeline/guardas.ts` checa o termo **no servidor antes de cada job**; termo com assinatura eletrônica (data, IP, hash) em `/termo/[token]`; revogação imediata; triagem de figura pública/menor em `agent/foto.ts` |
| 3.5 Revisão e entrega (RF-40 a 45) | Player com troca de variações, relatório de QA, ajuste em linguagem natural, exportação MP4 9:16/1:1/16:9 + SRT, link do cliente sem login, envio ao Adplane |
| 3.6 Custos e administração (RF-50 a 55) | Custo por etapa/projeto/cliente/mês, limites (80% avisa, 100% para e pede aprovação), chaves de API cifradas (AES-256-GCM) com teste antes de salvar, provedor principal/alternativo por etapa, trilha de auditoria imutável |
| 4 Fluxo / estados | Estados de projeto e variação no `db/schema.sql`; falhas ficam no job, com nova tentativa e troca para o alternativo após 2 falhas |
| 5 Arquitetura | Next.js + TypeScript + Tailwind; fila **pg-boss** (no próprio Postgres, sem Redis); worker separado (`src/worker.ts`); adaptadores em `src/lib/providers` |
| 6 Agente | Roteiros, plano de cenas, QA visual por quadros (`agent/qa.ts`) com a tabela de limites da 6.4, interpretação de ajustes; guardrails da 6.2 |
| 8 Modelo de dados | `db/schema.sql` (+ `db/supabase-rls.sql` com Row Level Security por workspace) |
| 9 API interna | `src/app/api/**` (mesmas rotas da tabela) |
| 15 Telas 1 a 8 | Painel, Briefing, Roteiro e voz, Produção, Revisão, Atores, Configurações, Aprovação do cliente |

### Provedores

| Etapa | Principal | Alternativo |
|---|---|---|
| Roteiro e QA | Claude (API Anthropic) | simulador |
| Narração | ElevenLabs | simulador |
| Imagem-chave | Nano Banana (fal.ai) | GPT Image (OpenAI) |
| Lip-sync | Kling Avatar (fal.ai) | OmniHuman (fal.ai) |
| B-roll | Seedance (fal.ai) | Kling imagem-para-vídeo (fal.ai) |

Os IDs de modelo dos agregadores ficam em `src/lib/providers/catalogo.ts` (sobrescrevíveis por variável de ambiente) e **precisam ser confirmados na prova de conceito**, assim como a tabela de preços — o próprio descritivo pede isso.

## Pendências e decisões em aberto

- **Validar na POC com chaves reais**: endpoints/IDs de modelo do fal.ai, qualidade do lip-sync em português, preços reais.
- **API oficial do Kling** (assinatura JWT própria) e **Arcads** (plano B) ainda não têm adaptador; hoje Kling é acessado via fal.ai.
- **Adplane e Domma Chat**: o contrato dessas integrações não está no descritivo; há um envio genérico configurável (`ADPLANE_URL`, `DOMMA_CHAT_WEBHOOK_URL`).
- **Remoção de fundo do produto** e **transcrição** para conferir legenda × fala: hoje a legenda é gerada do texto do roteiro.
- **Armazenamento**: implementado em disco local com URLs assinadas; trocar por Supabase Storage ou R2 em produção (decisão em aberto nº 4).
- **Versão Local (desktop)**: o pipeline é o mesmo; falta empacotar em Tauri/Electron (decisões em aberto nº 1 e 2).
- **Texto do termo** (`src/lib/termo.ts`) precisa de validação jurídica (decisão nº 6).
- Convite de novos usuários e papel *cliente* com login ainda não têm tela (o cliente aprova via link).

## Implantação atual

- **Banco:** Supabase `domma-ugc-creator` (sa-east-1), usuário `ugc_app` (dono das tabelas; RLS ligado em todas).
  - **Painel (Vercel)** conecta pelo pooler em **modo sessão** (`aws-1-sa-east-1.pooler.supabase.com:5432`), no máximo 2 conexões por instância. Não use o modo transação (6543): ele trava com o encadeamento de consultas do `postgres.js`. O pooler em modo sessão aceita 15 clientes no total.
  - **Worker (Railway)** conecta **direto** em `db.<ref>.supabase.co:5432` por IPv6 (saída IPv6 ligada no serviço), fora do limite do pooler: 6 conexões do app + 6 da fila.
  - O papel `ugc_app` encerra transações abandonadas após 60 s e consultas após 120 s.
- **Painel:** Vercel (time REDBOX), funções em `gru1`, domínio `ugccreator.dommasistemas.com.br` (CNAME na HostGator). Deploy automático a cada push na `main`.
- **Worker:** Railway, serviço `worker` (Dockerfile). Na partida aplica o schema e o seed (idempotentes).
- **Arquivos:** tabela `arquivos` no Postgres. Para usar o Supabase Storage, cadastre a chave secreta do Supabase em Configurações › Chaves de API › Supabase Storage.

## Implantação sugerida

- Painel: Vercel ou Railway (`npm start`). Worker: Railway com o `Dockerfile` (`npm run worker`), que já instala FFmpeg e a fonte das legendas.
- Banco: Supabase Postgres — aplicar `db/schema.sql` e depois `db/supabase-rls.sql`.
