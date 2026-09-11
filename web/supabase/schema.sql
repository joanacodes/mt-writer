-- Maison Tarot writer — run this once in the Supabase SQL editor.

create table if not exists plan (
  id            text primary key,
  origin        text,
  type          text,
  category      text,
  tags          text,
  title_en      text,
  title_fr      text,
  keyword_en    text,
  keyword_fr    text,
  slug_en       text,
  path_en       text,
  slug_fr       text,
  path_fr       text,
  length        integer default 900,
  angle         text,
  notes         text default '',
  pair_of       text,
  status_en     text default 'todo',
  status_fr     text default 'todo',
  merged_into   text,
  cover         text default '',
  sort          integer,
  updated_at    timestamptz default now()
);
create index if not exists plan_category_idx on plan (category);
create index if not exists plan_type_idx on plan (type);

create table if not exists articles (
  plan_id      text references plan(id) on delete cascade,
  lang         text check (lang in ('en','fr')),
  slug         text not null,
  body         text not null,
  words        integer,
  warnings     text default '',
  edited       boolean default false,
  published_at timestamptz,
  updated_at   timestamptz default now(),
  primary key (plan_id, lang)
);

create table if not exists covers (
  plan_id      text primary key references plan(id) on delete cascade,
  slug         text,
  mime         text default 'image/jpeg',
  data         text,
  prompt       text,
  published_at timestamptz,
  created_at   timestamptz default now()
);

create table if not exists docs (
  name       text primary key,
  content    text,
  updated_at timestamptz default now()
);

create table if not exists jobs (
  id         uuid primary key default gen_random_uuid(),
  kind       text,
  provider   text,
  batch_id   text,
  items      jsonb,
  status     text default 'submitted',
  note       text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists settings (
  key   text primary key,
  value text
);
insert into settings (key, value) values ('provider','anthropic'), ('model','claude-fable-5-1'),
  ('image_provider','google'), ('image_model','gemini-2.5-flash-image')
on conflict (key) do nothing;

create table if not exists logs (
  id   bigserial primary key,
  at   timestamptz default now(),
  line text
);

alter table plan     enable row level security;
alter table articles enable row level security;
alter table covers   enable row level security;
alter table docs     enable row level security;
alter table jobs     enable row level security;
alter table settings enable row level security;
alter table logs     enable row level security;
