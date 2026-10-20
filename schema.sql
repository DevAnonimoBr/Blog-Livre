-- Execute no SQL Editor do Supabase. Faça backup antes de adaptar a um projeto existente.
create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 3000),
  image_url text,
  created_at timestamptz not null default now(),
  constraint posts_content_or_image check (char_length(trim(content)) > 0 or image_url is not null)
);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_user_id_idx on public.posts(user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1500),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_id_created_idx on public.comments(post_id,created_at);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.chat_messages enable row level security;

-- Conteúdo comunitário é visível apenas a usuários autenticados.
create policy "Authenticated users can read posts" on public.posts for select to authenticated using (true);
create policy "Users create own posts" on public.posts for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own posts" on public.posts for delete to authenticated using (auth.uid() = user_id);
create policy "Users update own posts" on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Authenticated users can read comments" on public.comments for select to authenticated using (true);
create policy "Users create comments as themselves" on public.comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own comments" on public.comments for delete to authenticated using (auth.uid() = user_id);

create policy "Authenticated users can read chat" on public.chat_messages for select to authenticated using (true);
create policy "Users send chat as themselves" on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own messages" on public.chat_messages for delete to authenticated using (auth.uid() = user_id);

-- Bucket público para imagens anexadas a posts. O bucket deve ser limitado a 5 MB.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('post-images','post-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

-- Upload só para pasta cujo primeiro segmento seja o ID do próprio usuário.
create policy "Users upload images to own folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Authenticated users read post images" on storage.objects
for select to authenticated using (bucket_id = 'post-images');
create policy "Users delete own images" on storage.objects
for delete to authenticated
using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime para atualizações de feed e mensagens. Em projetos novos, adicione as tabelas
-- à publicação supabase_realtime se ainda não estiverem nela:
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then alter publication supabase_realtime add table public.posts; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then alter publication supabase_realtime add table public.chat_messages; end if;
end $$;
