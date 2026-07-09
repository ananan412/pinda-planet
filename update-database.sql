-- ==============================================
-- 拼搭星球数据库更新脚本
-- 更新时间: 2026-07-09
-- ==============================================

-- ==============================================
-- 1. 创建扩展
-- ==============================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==============================================
-- 2. 创建辅助函数
-- ==============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_planet_admin(p_email TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO planet_admins (user_id) 
    VALUES ((SELECT id FROM planet_users WHERE email = p_email))
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_planet_admin(TEXT) TO anon;

-- ==============================================
-- 3. 更新 planet_users 表
-- ==============================================
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS wechat TEXT;
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'citizen';
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS public.planet_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.planet_users DROP COLUMN IF EXISTS phone_number;
ALTER TABLE IF EXISTS public.planet_users DROP COLUMN IF EXISTS wechat_id;

-- ==============================================
-- 4. 更新 planets_posts 表
-- ==============================================
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'game';
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '其他';
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS current_participants INT DEFAULT 0;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS max_participants INT DEFAULT 1;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES public.planet_users(id);
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.planet_users(id);
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS departure TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS departure_time TIMESTAMP;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS cost NUMERIC;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS product_link TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS product_price NUMERIC;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS product_group_price NUMERIC;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS product_location TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS game_type TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS game_location TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS game_time TIMESTAMP;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS game_cost NUMERIC;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS lng NUMERIC;
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE IF EXISTS public.planets_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ==============================================
-- 5. 更新 planet_members 表 - 添加 party_size 字段
-- ==============================================
ALTER TABLE IF EXISTS public.planet_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE IF EXISTS public.planet_members ADD COLUMN IF NOT EXISTS party_size INT DEFAULT 1;
ALTER TABLE IF EXISTS public.planet_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();

-- ==============================================
-- 6. 创建触发器函数：自动计算 current_participants
-- ==============================================
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

-- ==============================================
-- 7. 创建/更新触发器
-- ==============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'planet_users_updated_at') THEN
        CREATE TRIGGER planet_users_updated_at
        BEFORE UPDATE ON public.planet_users
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'planets_posts_updated_at') THEN
        CREATE TRIGGER planets_posts_updated_at
        BEFORE UPDATE ON public.planets_posts
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'planet_groups_updated_at') THEN
        CREATE TRIGGER planet_groups_updated_at
        BEFORE UPDATE ON public.planet_groups
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;

-- ==============================================
-- 8. 创建索引
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_posts_title_gin ON public.planets_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_content_gin ON public.planets_posts USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.planets_posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.planets_posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_creator_id ON public.planets_posts(creator_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON public.planets_posts(type);

CREATE INDEX IF NOT EXISTS idx_members_group_id ON public.planet_members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON public.planet_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON public.planet_members(status);

-- ==============================================
-- 9. 启用 RLS（先创建策略再启用 RLS）
-- ==============================================

-- ==============================================
-- planet_users RLS 策略
-- ==============================================
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

ALTER TABLE public.planet_users ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- planets_posts RLS 策略
-- ==============================================
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

ALTER TABLE public.planets_posts ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- planet_members RLS 策略
-- ==============================================
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

ALTER TABLE public.planet_members ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- planet_admins RLS 策略
-- ==============================================
DROP POLICY IF EXISTS "Everyone can view admin list" ON public.planet_admins;
CREATE POLICY "Everyone can view admin list" ON public.planet_admins
    FOR SELECT USING (true);

ALTER TABLE public.planet_admins ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- planet_groups RLS 策略（仅当表存在时）
-- ==============================================
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

        ALTER TABLE public.planet_groups ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ==============================================
-- 10. 重新计算所有帖子的 current_participants
-- ==============================================
UPDATE public.planets_posts p
SET current_participants = (
    SELECT COALESCE(SUM(m.party_size), 0)
    FROM public.planet_members m
    WHERE m.group_id = p.id AND m.status = 'approved'
);

-- ==============================================
-- 11. 验证
-- ==============================================
SELECT '✅ planet_users 表结构:' as info;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'planet_users' ORDER BY ordinal_position;

SELECT '✅ planets_posts 表结构:' as info;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'planets_posts' ORDER BY ordinal_position;

SELECT '✅ planet_members 表结构:' as info;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'planet_members' ORDER BY ordinal_position;

SELECT '✅ 帖子人数统计:' as info;
SELECT id, title, current_participants, max_participants, status FROM public.planets_posts;

SELECT '✅ 更新完成!' as info;