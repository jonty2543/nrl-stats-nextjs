create schema if not exists shortside;

create table if not exists shortside.articles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  display_name text,
  author_image_url text,
  is_anonymous boolean not null default false,
  title text not null check (char_length(title) between 1 and 120),
  slug text not null unique,
  body text not null check (char_length(body) between 1 and 12000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  header_image_1 text,
  header_image_2 text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text
);

create index if not exists articles_status_created_at_idx on shortside.articles (status, created_at desc);
create index if not exists articles_clerk_user_id_created_at_idx on shortside.articles (clerk_user_id, created_at desc);

alter table shortside.articles add column if not exists author_image_url text;
alter table shortside.articles add column if not exists is_anonymous boolean not null default false;

create or replace function shortside.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_articles_updated_at on shortside.articles;
create trigger set_articles_updated_at
before update on shortside.articles
for each row execute function shortside.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-images',
  'article-images',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
