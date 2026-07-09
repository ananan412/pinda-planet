-- ==============================================
-- 拼搭星球数据库完整备份
-- 生成时间: 2026-07-09
-- ==============================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- ==============================================
-- 1. 创建扩展
-- ==============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==============================================
-- 2. 创建函数
-- ==============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_planet_admin(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO planet_admins (user_id) 
    VALUES ((SELECT id FROM planet_users WHERE email = p_email))
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_planet_admin(TEXT) TO anon;

CREATE OR REPLACE FUNCTION public.update_post_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.planets_posts
    SET current_participants = (
        SELECT COALESCE(SUM(party_size), 0)
        FROM public.planet_members
        WHERE group_id = NEW.group_id AND status = 'approved'
    )
    WHERE id = NEW.group_id;
    RETURN NULL;
END;
$$;

-- ==============================================
-- 3. 创建表结构 (DDL)
-- ==============================================

-- planet_users - 用户表
CREATE TABLE IF NOT EXISTS public.planet_users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_confirmed_at TIMESTAMPTZ,
    phone TEXT,
    phone_confirmed_at TIMESTAMPTZ,
    encrypted_password TEXT NOT NULL,
    reset_password_token TEXT,
    reset_password_sent_at TIMESTAMPTZ,
    remember_created_at TIMESTAMPTZ,
    sign_in_count INT DEFAULT 0,
    current_sign_in_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    current_sign_in_ip TEXT,
    last_sign_in_ip TEXT,
    username TEXT,
    gender TEXT,
    wechat TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'citizen',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.planet_users ENABLE ROW LEVEL SECURITY;

-- planets_posts - 拼搭帖子表
CREATE TABLE IF NOT EXISTS public.planets_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'game',
    category TEXT DEFAULT '其他',
    status TEXT DEFAULT 'open',
    current_participants INT DEFAULT 0,
    max_participants INT DEFAULT 1,
    creator_id UUID REFERENCES public.planet_users(id),
    user_id UUID REFERENCES public.planet_users(id),
    departure TEXT,
    destination TEXT,
    departure_time TIMESTAMP,
    cost NUMERIC,
    product_name TEXT,
    product_link TEXT,
    product_price NUMERIC,
    product_group_price NUMERIC,
    product_type TEXT,
    product_location TEXT,
    game_type TEXT,
    game_location TEXT,
    game_time TIMESTAMP,
    game_cost NUMERIC,
    location_name TEXT,
    lat NUMERIC,
    lng NUMERIC,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE public.planets_posts ENABLE ROW LEVEL SECURITY;

-- planet_members - 成员表
CREATE TABLE IF NOT EXISTS public.planet_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES public.planets_posts(id),
    user_id UUID NOT NULL REFERENCES public.planet_users(id),
    status TEXT DEFAULT 'pending',
    party_size INT DEFAULT 1,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);
ALTER TABLE public.planet_members ENABLE ROW LEVEL SECURITY;

-- 触发器函数：自动计算 current_participants
CREATE OR REPLACE FUNCTION public.update_post_participants()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.planets_posts
    SET current_participants = (
        SELECT COALESCE(SUM(party_size), 0)
        FROM public.planet_members
        WHERE group_id = NEW.group_id AND status = 'approved'
    )
    WHERE id = NEW.group_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 触发器：当 planet_members 发生变化时自动更新 current_participants
DROP TRIGGER IF EXISTS trigger_update_participants ON public.planet_members;
CREATE TRIGGER trigger_update_participants
AFTER INSERT OR UPDATE OR DELETE ON public.planet_members
FOR EACH ROW EXECUTE FUNCTION public.update_post_participants();

-- planet_admins - 管理员表
CREATE TABLE IF NOT EXISTS public.planet_admins (
    user_id UUID PRIMARY KEY REFERENCES public.planet_users(id)
);
ALTER TABLE public.planet_admins ENABLE ROW LEVEL SECURITY;

-- planet_groups - 群组表
CREATE TABLE IF NOT EXISTS public.planet_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    creator_id UUID REFERENCES public.planet_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.planet_groups ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- 4. 创建索引
-- ==============================================

-- 模糊搜索索引
CREATE INDEX IF NOT EXISTS idx_posts_title_gin ON public.planets_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_content_gin ON public.planets_posts USING gin (content gin_trgm_ops);

-- 分类索引
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.planets_posts(category);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.planets_posts(status);

-- 创建者索引
CREATE INDEX IF NOT EXISTS idx_posts_creator_id ON public.planets_posts(creator_id);

-- 成员表索引
CREATE INDEX IF NOT EXISTS idx_members_group_id ON public.planet_members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON public.planet_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON public.planet_members(status);

-- ==============================================
-- 5. 创建触发器
-- ==============================================

CREATE TRIGGER planet_users_updated_at
BEFORE UPDATE ON public.planet_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER planets_posts_updated_at
BEFORE UPDATE ON public.planets_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER planet_groups_updated_at
BEFORE UPDATE ON public.planet_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_update_participants ON public.planet_members;
CREATE TRIGGER trigger_update_participants
AFTER INSERT OR UPDATE OR DELETE ON public.planet_members
FOR EACH ROW EXECUTE FUNCTION public.update_post_participants();

-- ==============================================
-- 6. 创建 RLS 策略
-- ==============================================

-- planet_users 策略
DROP POLICY IF EXISTS "Users can insert own profile" ON public.planet_users;
CREATE POLICY "Users can insert own profile" ON public.planet_users
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.planet_users;
DROP POLICY IF EXISTS "Everyone can view public profile" ON public.planet_users;
CREATE POLICY "Everyone can view public profile" ON public.planet_users
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.planet_users;
CREATE POLICY "Users can update their own profile" ON public.planet_users
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin can view all users" ON public.planet_users;
CREATE POLICY "Admin can view all users" ON public.planet_users
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admin can update all users" ON public.planet_users;
CREATE POLICY "Admin can update all users" ON public.planet_users
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admin can delete users" ON public.planet_users;
CREATE POLICY "Admin can delete users" ON public.planet_users
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

-- planets_posts 策略
DROP POLICY IF EXISTS "Authenticated can view posts" ON public.planets_posts;
DROP POLICY IF EXISTS "Everyone can view posts" ON public.planets_posts;
CREATE POLICY "Everyone can view posts" ON public.planets_posts
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can insert posts" ON public.planets_posts;
CREATE POLICY "Authenticated can insert posts" ON public.planets_posts
    FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creator can update posts" ON public.planets_posts;
CREATE POLICY "Creator can update posts" ON public.planets_posts
    FOR UPDATE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Creator can delete posts" ON public.planets_posts;
CREATE POLICY "Creator can delete posts" ON public.planets_posts
    FOR DELETE USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "Admin can update all posts" ON public.planets_posts;
CREATE POLICY "Admin can update all posts" ON public.planets_posts
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admin can delete all posts" ON public.planets_posts;
CREATE POLICY "Admin can delete all posts" ON public.planets_posts
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admin can insert all posts" ON public.planets_posts;
CREATE POLICY "Admin can insert all posts" ON public.planets_posts
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

-- planet_members 策略
DROP POLICY IF EXISTS "Everyone can view approved members" ON public.planet_members;
CREATE POLICY "Everyone can view approved members" ON public.planet_members
    FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "Creator can view all members of their group" ON public.planet_members;
CREATE POLICY "Creator can view all members of their group" ON public.planet_members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.planets_posts p WHERE p.id = planet_members.group_id AND p.creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admin can view all members" ON public.planet_members;
CREATE POLICY "Admin can view all members" ON public.planet_members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert member requests" ON public.planet_members;
CREATE POLICY "Users can insert member requests" ON public.planet_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Creator can approve member requests" ON public.planet_members;
CREATE POLICY "Creator can approve member requests" ON public.planet_members
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.planets_posts p WHERE p.id = planet_members.group_id AND p.creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admin can update all members" ON public.planet_members;
CREATE POLICY "Admin can update all members" ON public.planet_members
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Creator can delete members" ON public.planet_members;
CREATE POLICY "Creator can delete members" ON public.planet_members
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.planets_posts p WHERE p.id = planet_members.group_id AND p.creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admin can delete all members" ON public.planet_members;
CREATE POLICY "Admin can delete all members" ON public.planet_members
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
    );

-- planet_admins 策略
DROP POLICY IF EXISTS "Everyone can view admin list" ON public.planet_admins;
CREATE POLICY "Everyone can view admin list" ON public.planet_admins
    FOR SELECT USING (true);

-- planet_groups 策略
-- planet_groups 策略（仅当表存在时）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planet_groups') THEN
        DROP POLICY IF EXISTS "Everyone can view all groups" ON public.planet_groups;
        CREATE POLICY "Everyone can view all groups" ON public.planet_groups
            FOR SELECT USING (true);

        DROP POLICY IF EXISTS "Users can insert groups" ON public.planet_groups;
        CREATE POLICY "Users can insert groups" ON public.planet_groups
            FOR INSERT WITH CHECK (auth.uid() = creator_id);

        DROP POLICY IF EXISTS "Creator can update group" ON public.planet_groups;
        CREATE POLICY "Creator can update group" ON public.planet_groups
            FOR UPDATE USING (auth.uid() = creator_id);

        DROP POLICY IF EXISTS "Creator can delete group" ON public.planet_groups;
        CREATE POLICY "Creator can delete group" ON public.planet_groups
            FOR DELETE USING (auth.uid() = creator_id);

        DROP POLICY IF EXISTS "Admin can update all groups" ON public.planet_groups;
        CREATE POLICY "Admin can update all groups" ON public.planet_groups
            FOR UPDATE USING (
                EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
            );

        DROP POLICY IF EXISTS "Admin can delete all groups" ON public.planet_groups;
        CREATE POLICY "Admin can delete all groups" ON public.planet_groups
            FOR DELETE USING (
                EXISTS (SELECT 1 FROM public.planet_admins a WHERE a.user_id = auth.uid())
            );
    END IF;
END $$;

-- ==============================================
-- 8. 插入数据 (INSERT)
-- ==============================================

-- 注意：实际数据需要从 Supabase 数据库导出
-- 以下为示例数据结构，实际数据请通过 Supabase SQL Editor 执行查询获取

-- planet_users 表无数据
-- ==============================================
-- planets_posts 数据
-- ==============================================
INSERT INTO public.planets_posts (id, title, content, status, current_participants, max_participants, creator_id, created_at, updated_at, category, type, departure, destination, departure_time, cost, product_name, product_link, product_price, product_group_price, product_type, product_location, game_type, game_location, game_time, game_cost, location_name, lat, lng) VALUES ('03d994a9-044f-417f-ac0b-c3f9e1fe5e60', '拼车', '无', 'expired', 1, 2, '4016d2fe-2151-4ff5-b89e-edc46399602a', '2026-07-03T07:15:16.706', '2026-07-03T07:15:16.811676', '其他', 'carpool', '成都东', '重庆西', '2026-07-03T15:16:00', 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '纬度 30.7897, 经度 103.8850', 30.789688688261656, 103.88504757776889);
INSERT INTO public.planets_posts (id, title, content, status, current_participants, max_participants, creator_id, created_at, updated_at, category, type, departure, destination, departure_time, cost, product_name, product_link, product_price, product_group_price, product_type, product_location, game_type, game_location, game_time, game_cost, location_name, lat, lng) VALUES ('bd54f61a-07c7-43da-90ae-c704b3f1f8d6', '拼车', '限女', 'open', 2, 4, 'c150d8a7-1f54-416f-bed1-8944c2e2f7d1', '2026-07-03T08:46:13.685', '2026-07-03T08:46:14.495089', '其他', 'carpool', '成都工业学院', '成都东站', '2026-07-11T18:45:00', 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '纬度 30.7897, 经度 103.8851', 30.78970541915654, 103.88513329036192);
INSERT INTO public.planets_posts (id, title, content, status, current_participants, max_participants, creator_id, created_at, updated_at, category, type, departure, destination, departure_time, cost, product_name, product_link, product_price, product_group_price, product_type, product_location, game_type, game_location, game_time, game_cost, location_name, lat, lng) VALUES ('ceecb753-e641-4a07-a527-4417b59d1e65', '密室', '无', 'open', 6, 7, 'e835c96d-0430-4319-8264-2f23d0b7847d', '2026-07-03T08:50:25.766', '2026-07-03T08:50:25.44304', '密室逃脱', 'game', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '春熙路', '2026-07-22T16:49:00', 30, '纬度 30.7897, 经度 103.8851', 30.789696617572268, 103.88513002513123);
INSERT INTO public.planets_posts (id, title, content, status, current_participants, max_participants, creator_id, created_at, updated_at, category, type, departure, destination, departure_time, cost, product_name, product_link, product_price, product_group_price, product_type, product_location, game_type, game_location, game_time, game_cost, location_name, lat, lng) VALUES ('17a57263-000f-4079-9267-104266d3f8b5', '零食', '无', 'expired', 1, 3, '4016d2fe-2151-4ff5-b89e-edc46399602a', '2026-07-03T07:33:04.632', '2026-07-03T07:33:05.416934', '商品拼单', 'food', NULL, NULL, '2026-07-04T15:32:00', NULL, 'xxx', NULL, 54, 45, '零食', '无', NULL, NULL, NULL, NULL, '纬度 30.7898, 经度 103.8852', 30.789846342362853, 103.88523182444148);

-- ==============================================
-- planet_members 数据
-- ==============================================
INSERT INTO public.planet_members (id, group_id, user_id, joined_at, status) VALUES ('bc839c35-62a6-4d93-9cac-3e6df9ab8703', '03d994a9-044f-417f-ac0b-c3f9e1fe5e60', '4016d2fe-2151-4ff5-b89e-edc46399602a', '2026-07-03T07:15:17.398241+00:00', 'approved');
INSERT INTO public.planet_members (id, group_id, user_id, joined_at, status) VALUES ('6339c5ee-6bc6-4fca-8ee0-a47fcd142c53', '17a57263-000f-4079-9267-104266d3f8b5', '4016d2fe-2151-4ff5-b89e-edc46399602a', '2026-07-03T07:33:05.81874+00:00', 'approved');
INSERT INTO public.planet_members (id, group_id, user_id, joined_at, status) VALUES ('189104c9-691c-4f49-b221-7cb4afd5feb7', '17a57263-000f-4079-9267-104266d3f8b5', 'f3b1d162-768b-4318-8829-d573bb345643', '2026-07-03T08:03:09.641+00:00', 'approved');
INSERT INTO public.planet_members (id, group_id, user_id, joined_at, status) VALUES ('3749b101-0ec7-4d5e-be8d-36f9317ed16a', 'bd54f61a-07c7-43da-90ae-c704b3f1f8d6', 'c150d8a7-1f54-416f-bed1-8944c2e2f7d1', '2026-07-03T08:46:15.115601+00:00', 'approved');
INSERT INTO public.planet_members (id, group_id, user_id, joined_at, status) VALUES ('09103dd8-acef-4452-9863-2c3ba733e7e2', 'bd54f61a-07c7-43da-90ae-c704b3f1f8d6', 'e835c96d-0430-4319-8264-2f23d0b7847d', '2026-07-03T08:47:29.004+00:00', 'approved');
INSERT INTO public.planet_members (id, group_id, user_id, joined_at, status) VALUES ('936dee59-f3a3-462e-88be-6f012986c042', 'ceecb753-e641-4a07-a527-4417b59d1e65', 'e835c96d-0430-4319-8264-2f23d0b7847d', '2026-07-03T08:50:25.80171+00:00', 'approved');
INSERT INTO public.planet_members (id, group_id, user_id, joined_at, status) VALUES ('d1f1f097-67b8-4d5e-be1b-c721889d20a2', 'ceecb753-e641-4a07-a527-4417b59d1e65', 'f3b1d162-768b-4318-8829-d573bb345643', '2026-07-03T08:57:52.768+00:00', 'approved');

-- ==============================================
-- planet_admins 数据
-- ==============================================
INSERT INTO public.planet_admins (user_id) VALUES ('f3b1d162-768b-4318-8829-d573bb345643');


-- ==============================================
-- 9. 恢复数据的方法
-- ==============================================

-- 1. 在 Supabase SQL Editor 中执行此文件的前8部分（DDL + 策略）
-- 2. 通过以下查询导出实际数据并添加到第8部分：

-- 导出用户数据:
-- COPY (SELECT * FROM public.planet_users) TO '/tmp/planet_users.csv' WITH CSV HEADER;
-- 或者使用:
-- SELECT 'INSERT INTO public.planet_users (id, email, ...) VALUES (''' || id || ''', ''' || email || ''', ...);' FROM public.planet_users;

-- 导出帖子数据:
-- SELECT 'INSERT INTO public.planets_posts (...) VALUES (...);' FROM public.planets_posts;

-- 导出成员数据:
-- SELECT 'INSERT INTO public.planet_members (...) VALUES (...);' FROM public.planet_members;

-- 导出管理员数据:
-- SELECT 'INSERT INTO public.planet_admins (user_id) VALUES (''' || user_id || ''');' FROM public.planet_admins;

-- ==============================================
-- 备份完成
-- ==============================================

COMMIT;