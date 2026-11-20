-- Desfazer: drop table public.social_selling_diario;
-- Social selling (T-20261120-001, Bruno 20/11/2026): lançamento diário por vendedor. user_id nulo = total da equipe importado da planilha antiga.
begin;

create table if not exists public.social_selling_diario (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  dia date not null,
  mensagens_enviadas integer not null default 0 check (mensagens_enviadas between 0 and 100000),
  respostas integer not null default 0 check (respostas between 0 and 100000),
  whatsapp integer not null default 0 check (whatsapp between 0 and 100000),
  agendamento integer not null default 0 check (agendamento between 0 and 100000),
  no_show integer not null default 0 check (no_show between 0 and 100000),
  obs text not null default '' check (length(obs) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, dia)
);

create index if not exists social_selling_diario_org_dia_idx on public.social_selling_diario (organization_id, dia);

alter table public.social_selling_diario enable row level security;
drop policy if exists tenant_isolation_social_selling_diario_all on public.social_selling_diario;
create policy tenant_isolation_social_selling_diario_all on public.social_selling_diario
  for select to authenticated using (organization_id in (select public.fn_user_org_ids()));

-- Histórico da planilha (19 a 27/10, só totais da equipe; divisão por vendedor só existe nas observações).
insert into public.social_selling_diario (organization_id, user_id, dia, mensagens_enviadas, respostas, whatsapp, agendamento, no_show, obs) values
  ('049684ef-707d-4b0e-a3ab-42b573a35482', null, '2026-10-19', 6, 2, 0, 0, 0, 'Planilha: Ângelo 61 e João 22 (não bate com o total do dia)'),
  ('049684ef-707d-4b0e-a3ab-42b573a35482', null, '2026-10-20', 20, 3, 2, 0, 0, ''),
  ('049684ef-707d-4b0e-a3ab-42b573a35482', null, '2026-10-21', 47, 13, 1, 0, 0, ''),
  ('049684ef-707d-4b0e-a3ab-42b573a35482', null, '2026-10-22', 10, 3, 1, 1, 0, ''),
  ('049684ef-707d-4b0e-a3ab-42b573a35482', null, '2026-10-23', 6, 2, 1, 1, 3, '3 no-show anotados na planilha'),
  ('049684ef-707d-4b0e-a3ab-42b573a35482', null, '2026-10-26', 41, 3, 1, 1, 0, 'Planilha: Ângelo 32 e João 9'),
  ('049684ef-707d-4b0e-a3ab-42b573a35482', null, '2026-10-27', 26, 4, 2, 0, 0, 'Planilha: Ângelo 21 e João 5')
on conflict do nothing;

commit;

-- 20/11/2026 17h (Bruno: "separar o relatório também por especialidades"): cada lançamento passa a ter especialidade.
-- Desfazer: alter table public.social_selling_diario drop constraint social_selling_diario_org_user_dia_esp_key, drop column especialidade; (e recriar unique (organization_id, user_id, dia)).
begin;
alter table public.social_selling_diario add column if not exists especialidade text not null default '' check (length(especialidade) <= 60);
alter table public.social_selling_diario drop constraint if exists social_selling_diario_organization_id_user_id_dia_key;
alter table public.social_selling_diario drop constraint if exists social_selling_diario_org_user_dia_esp_key;
alter table public.social_selling_diario add constraint social_selling_diario_org_user_dia_esp_key unique (organization_id, user_id, dia, especialidade);
commit;

-- 20/11/2026 18h (Bruno, call com o Ângelo e a Gabi): versão do roteiro no lançamento e reuniões do social selling por reunião.
-- Desfazer: drop table public.social_selling_reunioes; alter table public.social_selling_diario drop constraint social_selling_diario_org_user_dia_esp_versao_key, drop column versao_roteiro; (e recriar unique (organization_id, user_id, dia, especialidade)).
begin;
alter table public.social_selling_diario add column if not exists versao_roteiro text not null default '' check (length(versao_roteiro) <= 20);
alter table public.social_selling_diario drop constraint if exists social_selling_diario_org_user_dia_esp_key;
alter table public.social_selling_diario drop constraint if exists social_selling_diario_org_user_dia_esp_versao_key;
alter table public.social_selling_diario add constraint social_selling_diario_org_user_dia_esp_versao_key unique (organization_id, user_id, dia, especialidade, versao_roteiro);

create table if not exists public.social_selling_reunioes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  dia date not null,
  lead text not null default '' check (length(lead) <= 200),
  especialidade text not null default '' check (length(especialidade) <= 60),
  versao_roteiro text not null default '' check (length(versao_roteiro) <= 20),
  gravada boolean not null default false,
  link_gravacao text not null default '' check (length(link_gravacao) <= 500),
  resultado text not null default 'marcada' check (resultado in ('marcada','no_show','feita','proposta','venda')),
  obs text not null default '' check (length(obs) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_selling_reunioes_org_dia_idx on public.social_selling_reunioes (organization_id, dia);
alter table public.social_selling_reunioes enable row level security;
drop policy if exists tenant_isolation_social_selling_reunioes_all on public.social_selling_reunioes;
create policy tenant_isolation_social_selling_reunioes_all on public.social_selling_reunioes
  for select to authenticated using (organization_id in (select public.fn_user_org_ids()));
commit;
