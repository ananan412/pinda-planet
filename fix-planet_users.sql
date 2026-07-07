-- 为 planet_users 表添加缺失的列
-- 请在 Supabase 控制台的 SQL Editor 中运行此脚本

-- 添加昵称字段
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS username TEXT;

-- 添加性别字段 (male/female/other)
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS gender TEXT;

-- 添加手机号字段
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- 添加微信号字段
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS wechat TEXT;

-- 添加头像URL字段
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 添加角色字段 (citizen/admin)
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'citizen';

-- 添加创建时间字段
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 添加更新时间字段
ALTER TABLE planet_users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'planet_users_updated_at') THEN
    CREATE TRIGGER planet_users_updated_at
    BEFORE UPDATE ON planet_users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 查看当前表结构
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'planet_users';

-- 查询现有数据（确认是否有数据）
SELECT * FROM planet_users LIMIT 5;