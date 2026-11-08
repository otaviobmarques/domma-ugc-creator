-- Domma UGC Creator — esquema do banco (Postgres / Supabase)
-- Todas as tabelas de negócio têm workspace_id (preparação para SaaS).
-- As políticas de Row Level Security para o Supabase ficam em db/supabase-rls.sql.

-- gen_random_uuid() é nativo no Postgres 13+.

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  plano text not null default 'interno',
  limite_custo_mensal numeric(12,2) not null default 2000,       -- em R$
  config_provedores jsonb not null default '{}'::jsonb,           -- roteamento por etapa
  criado_em timestamptz not null default now()
);

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text not null,
  senha_hash text not null,
  criado_em timestamptz not null default now()
);

create table if not exists membros (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  papel text not null check (papel in ('admin','produtor','revisor','cliente')),
  marcas_permitidas uuid[] not null default '{}',  -- para papel cliente
  primary key (workspace_id, usuario_id)
);

create table if not exists marcas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  nome text not null,
  logo_url text,
  diretrizes text not null default '',
  termos_vetados text[] not null default '{}',
  musicas_permitidas text[] not null default '{}',
  criado_em timestamptz not null default now()
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  marca_id uuid not null references marcas(id) on delete cascade,
  nome text not null,
  descricao text not null default '',
  preco text,
  url_origem text,
  imagens text[] not null default '{}',
  imagem_recortada_url text,
  criado_em timestamptz not null default now()
);

create table if not exists atores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  tipo text not null check (tipo in ('real','sintetico')),
  nome text not null,
  descricao text not null default '',
  foto_url text,
  voz_id text,
  voz_clonada boolean not null default false,
  prompt_origem text,               -- RF-32: atores sintéticos guardam o prompt de origem
  status text not null default 'ativo' check (status in ('ativo','bloqueado','arquivado')),
  criado_em timestamptz not null default now()
);

create table if not exists consentimentos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ator_id uuid not null references atores(id) on delete cascade,
  titular text not null,
  documento_titular text,
  documento_hash text not null,
  finalidade text not null,
  marcas_permitidas uuid[] not null default '{}',   -- vazio = nenhuma
  canais text[] not null default '{}',
  usa_voz boolean not null default true,
  inicio date not null,
  fim date not null,
  assinado_em timestamptz,
  ip text,
  token_assinatura text unique,
  revogado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists projetos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  marca_id uuid not null references marcas(id),
  produto_id uuid not null references produtos(id),
  ator_id uuid not null references atores(id),
  titulo text not null,
  objetivo text not null,
  publico text not null default '',
  tom text not null default '',
  duracao_s int not null check (duracao_s between 10 and 60),
  formato text not null default '9:16' check (formato in ('9:16','1:1','16:9')),
  qualidade text not null default '720p' check (qualidade in ('480p','720p','1080p')),
  n_variacoes int not null check (n_variacoes between 1 and 6),
  voz_id text,
  voz_ritmo text not null default 'natural',
  estado text not null default 'rascunho' check (estado in
    ('rascunho','roteiro_gerado','roteiro_aprovado','em_producao','em_qa',
     'aguardando_revisao','ajuste','aprovado','reprovado','entregue','pausado_custo')),
  limite_custo numeric(12,2) not null default 150,   -- em R$
  custo_estimado_min numeric(12,2),
  custo_estimado_max numeric(12,2),
  token_aprovacao text unique,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists variacoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  projeto_id uuid not null references projetos(id) on delete cascade,
  letra text not null,
  angulo text not null,
  roteiro jsonb not null,
  verificacao jsonb not null default '{}'::jsonb,   -- RF-12
  estado text not null default 'roteiro' check (estado in
    ('roteiro','em_producao','em_qa','aguardando_revisao','ajuste','aprovado','reprovado','falha')),
  nota_qa numeric(4,2),
  audio_url text,
  video_final_url text,
  video_anterior_url text,       -- última versão montada, mantida durante refações
  legendas_srt text,
  musica text not null default 'manter',
  observacao text,
  escolhida_cliente boolean not null default false,
  unique (projeto_id, letra)
);

create table if not exists cenas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  variacao_id uuid not null references variacoes(id) on delete cascade,
  ordem int not null,
  tipo text not null check (tipo in ('fala','broll','imagem')),
  inicio_s numeric(6,2) not null,
  fim_s numeric(6,2) not null,
  prompt text not null default '',
  texto text,
  midia_url text,
  tentativas int not null default 0,
  forcar_provedor text
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  projeto_id uuid not null references projetos(id) on delete cascade,
  variacao_id uuid references variacoes(id) on delete cascade,
  cena_id uuid references cenas(id) on delete cascade,
  etapa text not null check (etapa in ('narracao','imagem','lipsync','broll','montagem','qa')),
  provedor text,
  job_externo_id text,
  estado text not null default 'na_fila' check (estado in ('na_fila','gerando','concluido','falha','cancelado','aguardando_aprovacao')),
  progresso int not null default 0,
  tentativa int not null default 1,
  entrada jsonb not null default '{}'::jsonb,
  saida jsonb,
  erro text,
  custo_estimado numeric(12,4),
  custo_real numeric(12,4),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists jobs_projeto_idx on jobs(projeto_id);
create index if not exists jobs_variacao_idx on jobs(variacao_id, etapa);

create table if not exists avaliacoes_qa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  variacao_id uuid not null references variacoes(id) on delete cascade,
  criterios jsonb not null,
  defeitos jsonb not null default '[]'::jsonb,
  checagens jsonb not null default '{}'::jsonb,
  nota numeric(4,2) not null,
  decisao text not null,
  criado_em timestamptz not null default now()
);

create table if not exists revisoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  variacao_id uuid not null references variacoes(id) on delete cascade,
  autor text not null,
  acao text not null check (acao in ('aprovar','ajuste','reprovar')),
  comentario text,
  criado_em timestamptz not null default now()
);

create table if not exists custos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  projeto_id uuid references projetos(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  etapa text,
  provedor text not null,
  unidade text not null,
  quantidade numeric(12,4) not null,
  valor_usd numeric(12,4) not null,
  valor_brl numeric(12,4) not null,
  cambio numeric(8,4) not null,
  data timestamptz not null default now()
);
create index if not exists custos_ws_data_idx on custos(workspace_id, data);

create table if not exists chaves_api (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provedor text not null,
  nome text not null,
  chave_cifrada text not null,          -- AES-256-GCM; nunca retorna ao navegador
  ultimos4 text not null,
  status text not null default 'conectado' check (status in ('conectado','saldo_baixo','chave_invalida')),
  limite_mensal_usd numeric(12,2),
  testada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (workspace_id, provedor)
);

-- Trilha de auditoria imutável (RF-53)
create table if not exists auditoria (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  projeto_id uuid references projetos(id) on delete cascade,
  ator text not null,              -- 'usuario:<email>' | 'agente' | 'sistema' | 'cliente'
  acao text not null,
  alvo text,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_projeto_idx on auditoria(projeto_id, criado_em);

create or replace function auditoria_imutavel() returns trigger language plpgsql as $$
begin
  raise exception 'auditoria é imutável';
end $$;
drop trigger if exists auditoria_sem_update on auditoria;
create trigger auditoria_sem_update before update or delete on auditoria
  for each row execute function auditoria_imutavel();

-- Arquivos de mídia na nuvem: registro de onde está cada objeto
-- (Supabase Storage) ou o próprio conteúdo (fallback sem chave de serviço).
create table if not exists arquivos (
  chave text primary key,
  onde text not null check (onde in ('supabase','postgres')),
  tamanho bigint not null,
  mime text not null,
  dados bytea,
  criado_em timestamptz not null default now()
);

-- Supabase expõe o schema public pela API REST. O app não usa essa API:
-- RLS ligado em todas as tabelas, sem políticas = nenhum acesso por anon/authenticated.
-- O papel do app é dono das tabelas e por isso não é afetado.
do $$
declare t text;
begin
  foreach t in array array['workspaces','usuarios','membros','marcas','produtos','atores','consentimentos','projetos',
    'variacoes','cenas','jobs','avaliacoes_qa','revisoes','custos','chaves_api','auditoria','arquivos']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Migrações incrementais (idempotentes)
alter table variacoes add column if not exists video_anterior_url text;
