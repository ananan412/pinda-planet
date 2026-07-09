-- ==============================================
-- 允许游客（未登录用户）查看帖子和用户信息
-- ==============================================

-- 1. 允许所有人查看帖子（包括游客）
DROP POLICY IF EXISTS "Authenticated can view posts" ON public.planets_posts;
DROP POLICY IF EXISTS "Everyone can view posts" ON public.planets_posts;
CREATE POLICY "Everyone can view posts" ON public.planets_posts
    FOR SELECT USING (true);

-- 2. 允许所有人查看用户公开信息（包括游客）
DROP POLICY IF EXISTS "Users can view their own profile" ON public.planet_users;
DROP POLICY IF EXISTS "Everyone can view public profile" ON public.planet_users;
CREATE POLICY "Everyone can view public profile" ON public.planet_users
    FOR SELECT USING (true);

-- 3. 允许所有人查看已批准的成员信息
DROP POLICY IF EXISTS "Everyone can view approved members" ON public.planet_members;
CREATE POLICY "Everyone can view approved members" ON public.planet_members
    FOR SELECT USING (status = 'approved');

-- 4. 允许所有人查看管理员列表
DROP POLICY IF EXISTS "Everyone can view admin list" ON public.planet_admins;
CREATE POLICY "Everyone can view admin list" ON public.planet_admins
    FOR SELECT USING (true);

-- 5. 允许所有人查看群组信息
DROP POLICY IF EXISTS "Everyone can view all groups" ON public.planet_groups;
CREATE POLICY "Everyone can view all groups" ON public.planet_groups
    FOR SELECT USING (true);

SELECT '✅ 游客查看权限已启用！' as result;