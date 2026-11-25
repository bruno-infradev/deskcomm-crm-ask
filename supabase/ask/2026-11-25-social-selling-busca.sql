-- Desfazer: drop function public.social_selling_consumir_cota(uuid,uuid,date,int,int); drop table public.social_selling_prospectos, public.social_selling_busca_cache, public.social_selling_busca_uso, public.social_selling_config;
-- Busca de perfis do social selling (Bruno, 25/11/2026): cache de 7 dias por termo, cota de perfis por vendedor por dia (20, editável) e fila de prospecção.
begin;

create table if not exists public.social_selling_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  limite_diario integer not null default 20 check (limite_diario between 1 and 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_selling_busca_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  chave text not null check (length(chave) <= 300),
  resultados jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, chave)
);

create table if not exists public.social_selling_busca_uso (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  usados integer not null default 0 check (usados >= 0),
  primary key (organization_id, user_id, dia)
);

create table if not exists public.social_selling_prospectos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  username text not null check (length(username) between 1 and 60),
  nome text not null default '' check (length(nome) <= 200),
  bio text not null default '' check (length(bio) <= 1000),
  seguidores integer,
  especialidade text not null default '' check (length(especialidade) <= 60),
  cidade text not null default '' check (length(cidade) <= 120),
  registro text not null default '' check (length(registro) <= 80),
  nota integer not null default 0 check (nota between 0 and 10),
  motivo text not null default '' check (length(motivo) <= 600),
  produto text not null default '' check (length(produto) <= 30),
  mensagem text not null default '' check (length(mensagem) <= 3000),
  versao_roteiro text not null default '' check (length(versao_roteiro) <= 20),
  origem text not null default 'busca' check (origem in ('busca','base')),
  status text not null default 'fila' check (status in ('base','fila','abordado','respondeu','reuniao','descartado')),
  contado_abordado boolean not null default false,
  contado_respondeu boolean not null default false,
  contado_reuniao boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, username)
);
create index if not exists social_selling_prospectos_org_user_idx on public.social_selling_prospectos (organization_id, user_id, status);

alter table public.social_selling_config enable row level security;
alter table public.social_selling_busca_cache enable row level security;
alter table public.social_selling_busca_uso enable row level security;
alter table public.social_selling_prospectos enable row level security;
drop policy if exists tenant_isolation_social_selling_prospectos_all on public.social_selling_prospectos;
create policy tenant_isolation_social_selling_prospectos_all on public.social_selling_prospectos
  for select to authenticated using (organization_id in (select public.fn_user_org_ids()));

create or replace function public.social_selling_consumir_cota(p_org uuid, p_user uuid, p_dia date, p_pedido integer, p_limite integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_usados integer; v_conceder integer;
begin
  insert into public.social_selling_busca_uso (organization_id, user_id, dia, usados) values (p_org, p_user, p_dia, 0) on conflict do nothing;
  select usados into v_usados from public.social_selling_busca_uso where organization_id = p_org and user_id = p_user and dia = p_dia for update;
  v_conceder := greatest(0, least(p_pedido, p_limite - v_usados));
  update public.social_selling_busca_uso set usados = usados + v_conceder where organization_id = p_org and user_id = p_user and dia = p_dia;
  return v_conceder;
end $$;
revoke all on function public.social_selling_consumir_cota(uuid,uuid,date,integer,integer) from public, anon, authenticated;
grant execute on function public.social_selling_consumir_cota(uuid,uuid,date,integer,integer) to service_role;

commit;
