-- Run once: cost tracking.
create table if not exists usage (
  id          bigserial primary key,
  at          timestamptz default now(),
  plan_id     text,
  lang        text,
  kind        text,          -- text | text_batch | image | prepare
  provider    text,
  model       text,
  input       integer default 0,
  output      integer default 0,
  cache_read  integer default 0,
  cache_write integer default 0,
  cost_usd    numeric(10,5) default 0
);
alter table usage enable row level security;

-- Prices per million tokens (USD): edit here when they change. Images: per image.
insert into docs (name, content) values ('prices', '{
  "claude-fable-5-1":          {"in": 10,   "out": 50,  "cache_read": 1,    "cache_write": 12.5},
  "claude-opus-5":             {"in": 15,   "out": 75,  "cache_read": 1.5,  "cache_write": 18.75},
  "claude-sonnet-5":           {"in": 3,    "out": 15,  "cache_read": 0.3,  "cache_write": 3.75},
  "claude-haiku-4-5-20251001": {"in": 1,    "out": 5,   "cache_read": 0.1,  "cache_write": 1.25},
  "gpt-5.6-sol":               {"in": 5,    "out": 30},
  "gpt-5.6-mini":              {"in": 0.5,  "out": 3},
  "gpt-5.5":                   {"in": 3,    "out": 15},
  "gemini-3-pro":              {"in": 2,    "out": 12},
  "gemini-3-flash":            {"in": 0.3,  "out": 2.5},
  "gemini-2.5-flash-image":    {"image": 0.04},
  "gpt-image-1":               {"image": 0.04},
  "_batch_discount": 0.5
}') on conflict (name) do nothing;
