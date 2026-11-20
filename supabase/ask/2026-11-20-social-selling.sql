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
