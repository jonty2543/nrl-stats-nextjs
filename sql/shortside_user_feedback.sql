create schema if not exists shortside;

create table if not exists shortside.user_feedback (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text null,
  rating integer not null check (rating between 1 and 5),
  interest text not null check (interest in ('Fantasy', 'Draft', 'Betting', 'Lineups', 'Stats')),
  change_request text null,
  path text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_created_at_idx
  on shortside.user_feedback (created_at desc);

create index if not exists user_feedback_clerk_user_id_idx
  on shortside.user_feedback (clerk_user_id);
