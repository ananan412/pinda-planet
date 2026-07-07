CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 创建设置管理员函数（SECURITY DEFINER 绕过 RLS）- 放在前面确保一定创建
CREATE OR REPLACE FUNCTION set_planet_admin(p_email TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO planet_admins (user_id) 
    VALUES ((SELECT id FROM planet_users WHERE email = p_email))
    ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_planet_admin(TEXT) TO anon;

CREATE OR REPLACE FUNCTION init_planet_schema()
RETURNS VOID AS $$
BEGIN
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS username TEXT;
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS gender TEXT;
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS wechat TEXT;
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'citizen';
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE planet_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    
    ALTER TABLE planet_users DROP COLUMN IF EXISTS phone_number;
    ALTER TABLE planet_users DROP COLUMN IF EXISTS wechat_id;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planet_members') THEN
        CREATE TABLE planet_members (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            group_id UUID NOT NULL REFERENCES planets_posts(id),
            user_id UUID NOT NULL REFERENCES planet_users(id),
            status TEXT DEFAULT 'pending',
            joined_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(group_id, user_id)
        );
    ELSE
        ALTER TABLE planet_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planet_admins') THEN
        CREATE TABLE planet_admins (
            user_id UUID PRIMARY KEY REFERENCES planet_users(id)
        );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planets_posts') THEN
        CREATE TABLE planets_posts (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT,
            type TEXT DEFAULT 'game',
            category TEXT DEFAULT '其他',
            status TEXT DEFAULT 'open',
            current_participants INT DEFAULT 0,
            max_participants INT DEFAULT 1,
            creator_id UUID REFERENCES planet_users(id),
            user_id UUID REFERENCES planet_users(id),
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
    ELSE
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '其他';
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS current_participants INT DEFAULT 0;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS max_participants INT DEFAULT 1;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'game';
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES planet_users(id);
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS departure TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS destination TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS departure_time TIMESTAMP;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS cost NUMERIC;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS product_name TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS product_link TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS product_price NUMERIC;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS product_group_price NUMERIC;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS product_type TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS product_location TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS game_type TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS game_location TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS game_time TIMESTAMP;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS game_cost NUMERIC;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS location_name TEXT;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS lat NUMERIC;
        ALTER TABLE planets_posts ADD COLUMN IF NOT EXISTS lng NUMERIC;
    END IF;
    
    -- 创建 GIN 模糊搜索索引
    CREATE INDEX IF NOT EXISTS idx_posts_title_gin ON planets_posts USING gin (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_posts_content_gin ON planets_posts USING gin (content gin_trgm_ops);
    
    -- 创建 category 索引
    CREATE INDEX IF NOT EXISTS idx_posts_category ON planets_posts(category);
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'planet_users_updated_at') THEN
        CREATE TRIGGER planet_users_updated_at
        BEFORE UPDATE ON planet_users
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'planet_groups_updated_at') THEN
        CREATE TRIGGER planet_groups_updated_at
        BEFORE UPDATE ON planet_groups
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION init_planet_schema() TO anon;

SELECT init_planet_schema();

ALTER TABLE planet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE planet_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE planet_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE planet_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE planets_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own profile" ON planet_users;
DROP POLICY IF EXISTS "Users can view their own profile" ON planet_users;
DROP POLICY IF EXISTS "Users can update their own profile" ON planet_users;
DROP POLICY IF EXISTS "Admin can view all users" ON planet_users;
DROP POLICY IF EXISTS "Admin can update all users" ON planet_users;
DROP POLICY IF EXISTS "Admin can delete users" ON planet_users;

DROP POLICY IF EXISTS "Users can view all groups" ON planet_groups;
    DROP POLICY IF EXISTS "Everyone can view all groups" ON planet_groups;
    DROP POLICY IF EXISTS "Users can insert groups" ON planet_groups;
    DROP POLICY IF EXISTS "Creator can update group" ON planet_groups;
    DROP POLICY IF EXISTS "Creator can delete group" ON planet_groups;
    DROP POLICY IF EXISTS "Admin can update all groups" ON planet_groups;
    DROP POLICY IF EXISTS "Admin can delete all groups" ON planet_groups;
    
    DROP POLICY IF EXISTS "Users can view approved members" ON planet_members;
    DROP POLICY IF EXISTS "Everyone can view approved members" ON planet_members;
    DROP POLICY IF EXISTS "Creator can view all members of their group" ON planet_members;
    DROP POLICY IF EXISTS "Admin can view all members" ON planet_members;
    DROP POLICY IF EXISTS "Users can insert member requests" ON planet_members;
    DROP POLICY IF EXISTS "Creator can approve member requests" ON planet_members;
    DROP POLICY IF EXISTS "Admin can update all members" ON planet_members;
    DROP POLICY IF EXISTS "Creator can delete members" ON planet_members;
    DROP POLICY IF EXISTS "Admin can delete all members" ON planet_members;
    
    DROP POLICY IF EXISTS "Admin self check" ON planet_admins;
    DROP POLICY IF EXISTS "Everyone can view admin list" ON planet_admins;
    
    DROP POLICY IF EXISTS "Everyone can view posts" ON planets_posts;
    DROP POLICY IF EXISTS "Users can insert posts" ON planets_posts;
    DROP POLICY IF EXISTS "Authenticated can view posts" ON planets_posts;
    DROP POLICY IF EXISTS "Authenticated can insert posts" ON planets_posts;
    DROP POLICY IF EXISTS "Creator can update posts" ON planets_posts;
    DROP POLICY IF EXISTS "Creator can delete posts" ON planets_posts;
    DROP POLICY IF EXISTS "Admin can update all posts" ON planets_posts;
    DROP POLICY IF EXISTS "Admin can delete all posts" ON planets_posts;

CREATE POLICY "Users can insert own profile" ON planet_users
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own profile" ON planet_users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON planet_users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin can view all users" ON planet_users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Admin can update all users" ON planet_users
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Admin can delete users" ON planet_users
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Everyone can view all groups" ON planet_groups
    FOR SELECT USING (true);

CREATE POLICY "Users can insert groups" ON planet_groups
    FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creator can update group" ON planet_groups
    FOR UPDATE USING (auth.uid() = creator_id);

CREATE POLICY "Creator can delete group" ON planet_groups
    FOR DELETE USING (auth.uid() = creator_id);

CREATE POLICY "Admin can update all groups" ON planet_groups
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Admin can delete all groups" ON planet_groups
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Everyone can view approved members" ON planet_members
    FOR SELECT USING (status = 'approved');

CREATE POLICY "Creator can view all members of their group" ON planet_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM planets_posts p 
            WHERE p.id = planet_members.group_id 
            AND p.creator_id = auth.uid()
        )
    );

CREATE POLICY "Admin can view all members" ON planet_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert member requests" ON planet_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Creator can approve member requests" ON planet_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM planets_posts p 
            WHERE p.id = planet_members.group_id 
            AND p.creator_id = auth.uid()
        )
    );

CREATE POLICY "Admin can update all members" ON planet_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Creator can delete members" ON planet_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM planets_posts p 
            WHERE p.id = planet_members.group_id 
            AND p.creator_id = auth.uid()
        )
    );

CREATE POLICY "Admin can delete all members" ON planet_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM planet_admins a 
            WHERE a.user_id = auth.uid()
        )
    );

CREATE POLICY "Everyone can view admin list" ON planet_admins
    FOR SELECT USING (true);
    
    CREATE POLICY "Authenticated can view posts" ON planets_posts
        FOR SELECT USING (auth.role() = 'authenticated');
    
    CREATE POLICY "Authenticated can insert posts" ON planets_posts
        FOR INSERT WITH CHECK (auth.uid() = creator_id);
    
    CREATE POLICY "Creator can update posts" ON planets_posts
        FOR UPDATE USING (auth.uid() = creator_id);
    
    CREATE POLICY "Creator can delete posts" ON planets_posts
        FOR DELETE USING (auth.uid() = creator_id);
    
    CREATE POLICY "Admin can update all posts" ON planets_posts
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM planet_admins a 
                WHERE a.user_id = auth.uid()
            )
        );
    
    CREATE POLICY "Admin can delete all posts" ON planets_posts
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM planet_admins a 
                WHERE a.user_id = auth.uid()
            )
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION init_planet_schema() TO anon;

SELECT init_planet_schema();