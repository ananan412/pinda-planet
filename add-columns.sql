-- 添加 planets_posts 表缺少的字段
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

-- 验证字段是否添加成功
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'planets_posts' ORDER BY ordinal_position;