-- TAGBACKLY Persistent Cloud Schema for Supabase (PostgreSQL)
-- Run this script once in your Supabase Dashboard -> SQL Editor.
-- Then set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Render Environment Variables.

CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  display_alias TEXT NOT NULL,
  profile_image TEXT,
  phone TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);

CREATE TABLE IF NOT EXISTS public.password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  reset_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_phone ON public.password_resets(phone, used, created_at DESC);

CREATE TABLE IF NOT EXISTS public.items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  public_slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SAFE',
  owner_message TEXT NOT NULL DEFAULT '',
  reward_type TEXT NOT NULL DEFAULT 'none',
  reward_amount TEXT NOT NULL DEFAULT '',
  reward_description TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_owner_id ON public.items(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_public_slug ON public.items(public_slug);

CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  finder_token TEXT NOT NULL,
  finder_label TEXT NOT NULL DEFAULT 'Finder',
  status TEXT NOT NULL DEFAULT 'active',
  blocked_by_owner INTEGER NOT NULL DEFAULT 0,
  blocked_by_finder INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON public.conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_item_token ON public.conversations(item_id, finder_token);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  sender_label TEXT NOT NULL,
  body TEXT NOT NULL,
  read_status INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  item_id TEXT,
  conversation_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.abuse_reports (
  id TEXT PRIMARY KEY,
  item_id TEXT,
  conversation_id TEXT,
  reporter_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security so anon/public Supabase keys cannot access private owner data directly.
-- The TAGBACKLY Node/Express backend uses SUPABASE_SERVICE_ROLE_KEY which safely bypasses RLS for verified routes.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_reports ENABLE ROW LEVEL SECURITY;
