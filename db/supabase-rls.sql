-- Row Level Security por workspace (aplicar só no Supabase, depois de schema.sql).
-- Os workers usam a service role (ignora RLS). O painel, se acessar o banco
-- direto com o JWT do usuário, só enxerga linhas do workspace de que é membro.
-- Pressupõe que usuarios.id = auth.uid().

create or replace function public.eh_membro(ws uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from membros m where m.workspace_id = ws and m.usuario_id = auth.uid())
$$;

do $$
declare t text;
begin
  foreach t in array array['marcas','produtos','atores','consentimentos','projetos','variacoes',
    'cenas','jobs','avaliacoes_qa','revisoes','custos','auditoria']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists ws_isolamento on %I', t);
    execute format('create policy ws_isolamento on %I using (public.eh_membro(workspace_id)) with check (public.eh_membro(workspace_id))', t);
  end loop;
end $$;

-- Chaves de API: nunca legíveis pelo navegador, só pela service role.
alter table chaves_api enable row level security;
drop policy if exists sem_acesso on chaves_api;
create policy sem_acesso on chaves_api using (false);

alter table workspaces enable row level security;
drop policy if exists ws_membro on workspaces;
create policy ws_membro on workspaces using (public.eh_membro(id));
