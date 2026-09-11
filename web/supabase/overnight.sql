-- Run once: chained batches and the overnight cover queue.
alter table jobs add column if not exists chain text default '';
create table if not exists queue (
  id         bigserial primary key,
  kind       text,               -- 'cover'
  plan_id    text,
  status     text default 'pending',
  note       text default '',
  created_at timestamptz default now()
);
alter table queue enable row level security;
