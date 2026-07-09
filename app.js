window.supabaseClient = null;
window.currentUser = null;
let isLoginMode = true;
let isAdminMode = false;
let pendingAction = null;

const SUPABASE_URL = 'https://kjinvmhqxejplvbvrsug.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaW52bWhxeGVqcGx2YnZyc3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTE5OTcsImV4cCI6MjA5ODI4Nzk5N30.E664tVoPfwvBVsugcEig7VtMDRy8xVRZZyczFoZUt6w';
const ADMIN_EMAIL = 'admin@cdtu.edu.cn';

const requestCache = {};

const typeIcons = {
    carpool: '🚀',
    food: '🧋',
    game: '🎮'
};

const typeNames = {
    carpool: '穿梭机拼车',
    food: '能量站拼单',
    game: '娱乐舱组局'
};

let currentMainCategory = 'carpool';
let currentSubCategory = '全部';

async function waitForSupabase() {
    return new Promise((resolve, reject) => {
        const maxAttempts = 50;
        let attempts = 0;
        
        const check = () => {
            attempts++;
            console.log(`🔍 等待 Supabase SDK 加载... 尝试次数: ${attempts}/${maxAttempts}`);
            
            if (window.supabase) {
                console.log('✅ Supabase SDK 已加载');
                resolve();
                return;
            }
            
            if (attempts >= maxAttempts) {
                console.error('❌ Supabase SDK 加载超时');
                reject(new Error('Supabase SDK 加载超时'));
                return;
            }
            
            setTimeout(check, 200);
        };
        
        check();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔄 DOMContentLoaded 事件触发');
    
    try {
        const isProfilePage = window.location.pathname.endsWith('profile.html');
        
        if (isProfilePage) {
            console.log('🔍 当前是个人主页');
        } else {
            console.log('🔍 当前是首页');
            console.log('🔍 步骤1: 同步绑定按钮事件');
            initTabs();
            initModal();
            initForm();
            initHeaderButtons();
            initAuthModal();
        }
        
        console.log('🔍 步骤2: 恢复缓存用户');
        const storedUser = localStorage.getItem('pinda_user');
        if (storedUser) {
            window.currentUser = JSON.parse(storedUser);
            console.log('✅ 从缓存恢复用户:', window.currentUser.email);
            updateHeaderUser();
        }
        
        console.log('🔍 步骤3: 等待 Supabase SDK 加载');
        await waitForSupabase();
        
        if (isProfilePage) {
            console.log('🔍 步骤4: 个人主页，等待认证完成');
            await initSupabase();
            console.log('✅ 认证完成，初始化个人主页');
        } else {
            console.log('🔍 步骤4: 首页，后台初始化 Supabase');
            initSupabase();
            console.log('🔍 步骤5: 立即加载拼搭数据（不等待认证）');
            await loadData();
        }
        
    } catch (error) {
        console.error('❌ DOMContentLoaded 全局异常:', error);
        const isProfilePage = window.location.pathname.endsWith('profile.html');
        if (!isProfilePage) {
            console.log('🔍 即使异常也尝试加载数据');
            await loadData();
        }
    }
});

let authTokenCache = null;
let authTokenExpiry = 0;

async function getAuthToken() {
    const now = Date.now();
    if (authTokenCache && now < authTokenExpiry) {
        return authTokenCache;
    }
    
    if (window.userAccessToken) {
        authTokenCache = window.userAccessToken;
        authTokenExpiry = now + 300000;
        return authTokenCache;
    }
    
    if (window.supabaseClient) {
        try {
            const sessionResult = await window.supabaseClient.auth.getSession();
            if (sessionResult.data.session?.access_token) {
                authTokenCache = sessionResult.data.session.access_token;
                window.userAccessToken = authTokenCache;
                authTokenExpiry = now + 300000;
                return authTokenCache;
            }
        } catch (e) {
            console.warn('⚠️ 获取 session 失败，使用 anon key:', e.message);
        }
    }
    
    authTokenCache = SUPABASE_KEY;
    authTokenExpiry = now + 300000;
    return authTokenCache;
}

async function supabaseFetch(table, options = {}) {
    const {
        select = '*',
        filter = {},
        order,
        limit,
        offset,
        method = 'GET',
        body,
        inFilter = {},
        upsert = false,
        useAuthToken = false
    } = options;
    
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    
    if (method === 'GET') {
        url += `?select=${encodeURIComponent(select)}`;
        
        if (limit) url += `&limit=${limit}`;
        if (offset) url += `&offset=${offset}`;
        if (order) url += `&order=${encodeURIComponent(order)}`;
        
        for (const [key, value] of Object.entries(filter)) {
            url += `&${key}=${encodeURIComponent(value)}`;
        }
        
        for (const [key, value] of Object.entries(inFilter)) {
            const encodedValues = value.map(v => encodeURIComponent(v)).join(',');
            url += `&${key}=in.(${encodedValues})`;
        }
    } else {
        url += `?select=${encodeURIComponent(select)}`;
        for (const [key, value] of Object.entries(filter)) {
            url += `&${key}=${encodeURIComponent(value)}`;
        }
    }
    
    if (method === 'GET') {
        const cacheKey = url;
        if (requestCache[cacheKey]) {
            return { data: requestCache[cacheKey], error: null, status: 200, ok: true };
        }
    }
    
    try {
        const authToken = await getAuthToken();
        
        const headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        };
        
        if (method !== 'GET') {
            if (upsert) {
                headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
            } else {
                headers['Prefer'] = 'return=representation';
            }
        }
        
        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        
        const data = await response.json();
        
        if (response.status >= 400) {
            console.error('❌ supabaseFetch 失败:', response.status, data);
            return { data: [], error: new Error(JSON.stringify(data)), status: response.status };
        }
        
        if (method !== 'GET' && Array.isArray(data) && data.length === 0) {
            console.warn('⚠️ supabaseFetch: PATCH/POST 返回空数组，可能没有匹配的行');
        }
        
        if (method === 'GET') {
            const cacheKey = url;
            requestCache[cacheKey] = data;
        }
        
        return { data, error: null, status: response.status, ok: response.ok };
        
    } catch (error) {
        console.error('❌ supabaseFetch 异常:', error);
        return { data: [], error, status: 0 };
    }
}

async function testNetworkConnection() {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/planets_posts?select=id&limit=1`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function initSupabase() {
    try {
        if (!window.supabase) {
            console.error('❌ Supabase SDK 未加载');
            alert('Supabase SDK 加载失败，请检查网络连接');
            showEmptyState();
            return;
        }

        let createClientFn = null;
        if (typeof window.supabase.createClient === 'function') {
            createClientFn = window.supabase.createClient;
        } else if (window.supabase.default && typeof window.supabase.default.createClient === 'function') {
            createClientFn = window.supabase.default.createClient;
        } else if (typeof window.supabase === 'function') {
            createClientFn = window.supabase;
        } else if (window.supabase.SupabaseClient) {
            createClientFn = (url, key) => new window.supabase.SupabaseClient(url, key);
        } else {
            for (const key of Object.keys(window.supabase)) {
                const val = window.supabase[key];
                if (typeof val === 'function' || (typeof val === 'object' && val.createClient)) {
                    if (typeof val.createClient === 'function') {
                        createClientFn = val.createClient;
                        break;
                    }
                }
            }
        }

        if (!createClientFn) {
            console.error('❌ 无法找到 createClient 方法');
            alert('无法初始化 Supabase，请检查 CDN 是否正常加载');
            showEmptyState();
            return;
        }

        window.supabaseClient = createClientFn(SUPABASE_URL, SUPABASE_KEY);
        
        if (typeof window.supabaseClient.from !== 'function') {
            console.error('❌ window.supabaseClient.from 不是函数');
            alert('Supabase 客户端初始化异常，请检查控制台');
            showEmptyState();
            return;
        }
        
        setupAuthListener();
        
        initDetailModal();
        
        setTimeout(() => {
            checkAuthStatus().catch(() => {});
        }, 1000);
        
    } catch (error) {
        console.error('❌ Supabase 初始化异常:', error);
        console.error('❌ 堆栈:', error.stack);
        alert('Supabase 初始化失败: ' + error.message);
        showEmptyState();
    }
}

let currentLocation = null;

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function formatDistance(km) {
    if (km < 1) {
        return Math.round(km * 1000) + 'm';
    }
    return km.toFixed(1) + 'km';
}

async function reverseGeocode(lat, lng) {
    return null;
}

async function requestLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持地理位置'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log('📍 获取位置成功:', currentLocation);
                resolve(currentLocation);
            },
            (error) => {
                console.warn('⚠️ 获取位置失败:', error.message);
                if (error.code === 1) {
                    console.warn('⚠️ 用户拒绝定位权限');
                } else if (error.code === 2) {
                    console.warn('⚠️ 无法获取位置信息');
                } else if (error.code === 3) {
                    console.warn('⚠️ 定位超时');
                }
                reject(error);
            },
            {
                enableHighAccuracy: false,
                timeout: 3000,
                maximumAge: 300000
            }
        );
    });
}

async function fetchCurrentLocation() {
    const locationInput = document.getElementById('form-location');
    const latInput = document.getElementById('form-lat');
    const lngInput = document.getElementById('form-lng');
    
    if (!locationInput) return;
    
    locationInput.value = '定位中...';
    
    try {
        const pos = await requestLocation();
        
        latInput.value = pos.lat;
        lngInput.value = pos.lng;
        
        try {
            const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${pos.lat},${pos.lng}&key=4a8429f877c243f28e39736f0277b0c6`);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                const formatted = result.formatted;
                const city = result.components.city || result.components.state || '';
                const district = result.components.suburb || result.components.neighbourhood || '';
                
                if (city) {
                    locationInput.value = district ? `${city} ${district}` : city;
                } else {
                    locationInput.value = formatted || `纬度 ${pos.lat.toFixed(4)}, 经度 ${pos.lng.toFixed(4)}`;
                }
            } else {
                locationInput.value = `纬度 ${pos.lat.toFixed(4)}, 经度 ${pos.lng.toFixed(4)}`;
            }
        } catch (e) {
            console.warn('⚠️ 逆地理编码失败:', e.message);
            locationInput.value = `纬度 ${pos.lat.toFixed(4)}, 经度 ${pos.lng.toFixed(4)}`;
        }
        
    } catch (error) {
        locationInput.value = '定位失败，请手动输入';
        latInput.value = '';
        lngInput.value = '';
    }
}

async function loadData() {
    showSkeleton();
    
    if (!window.supabaseClient) {
        hideSkeleton();
        showEmptyState();
        return;
    }
    
    try {
        setTimeout(autoExpirePosts, 2000);
        
        if (!currentLocation) {
            requestLocation().then(() => {
                const sort = document.getElementById('sort-select')?.value || 'latest';
                fetchPosts('', 1, 50, getEffectiveCategory(), sort).then(({ data }) => {
                    renderCards(data);
                });
            }).catch(() => {});
        }
        
        const sort = document.getElementById('sort-select')?.value || 'latest';
        const { data } = await fetchPosts('', 1, 50, getEffectiveCategory(), sort);
        
        hideSkeleton();
        await renderCards(data);
        
    } catch (error) {
        console.error('❌ 加载数据失败:', error);
        hideSkeleton();
        showEmptyState();
    }
}

function getEffectiveCategory() {
    return currentMainCategory || '';
}

const gameCategories = ['剧本杀', '密室逃脱', 'Livehouse/演出', '桌游/棋牌', '运动竞技'];

async function fetchPosts(keyword = '', page = 1, pageSize = 20, type = '', sort = 'latest', searchCategory = '') {
    try {
        const filter = {};
        const inFilter = {};
        
        if (type === 'carpool') {
            filter['type'] = 'eq.carpool';
        } else if (type === 'food') {
            filter['type'] = 'eq.food';
        } else if (type === 'game') {
            filter['type'] = 'eq.game';
            if (currentSubCategory && currentSubCategory !== '全部') {
                filter['category'] = `eq.${currentSubCategory}`;
            }
        }
        
        if (keyword && keyword.trim()) {
            const searchTerm = keyword.trim().toLowerCase();
            filter['or'] = `(title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,departure.ilike.%${searchTerm}%,destination.ilike.%${searchTerm}%,product_name.ilike.%${searchTerm}%,product_location.ilike.%${searchTerm}%,game_type.ilike.%${searchTerm}%,game_location.ilike.%${searchTerm}%,location_name.ilike.%${searchTerm}%)`;
        }
        
        const orderParam = sort === 'oldest' ? 'created_at.asc' : 'created_at.desc';
        
        const { data, error } = await supabaseFetch('planets_posts', {
            select: 'id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at',
            filter,
            inFilter,
            order: orderParam,
            limit: pageSize
        });
        
        if (error) {
            console.error('❌ 查询失败:', error);
            throw error;
        }
        
        let filteredData = data || [];
        
        if (currentLocation) {
            filteredData = filteredData.map(item => {
                if (item.lat && item.lng) {
                    item.distance = getDistance(currentLocation.lat, currentLocation.lng, item.lat, item.lng);
                }
                return item;
            });
        }
        
        filteredData.sort((a, b) => {
            const activeStatuses = ['open', 'full'];
            const isActiveA = activeStatuses.includes(a.status);
            const isActiveB = activeStatuses.includes(b.status);
            
            if (isActiveA && !isActiveB) {
                return -1;
            }
            if (!isActiveA && isActiveB) {
                return 1;
            }
            
            if (sort === 'distance' && currentLocation) {
                return (a.distance || Infinity) - (b.distance || Infinity);
            }
            
            if (sort === 'deadline_soon' || sort === 'deadline_later') {
                const deadlineA = new Date(a.departure_time || a.game_time || 0).getTime();
                const deadlineB = new Date(b.departure_time || b.game_time || 0).getTime();
                return sort === 'deadline_later' ? deadlineB - deadlineA : deadlineA - deadlineB;
            }
            
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return sort === 'oldest' ? timeA - timeB : timeB - timeA;
        });
        
        return { data: filteredData, count: filteredData.length };
        
    } catch (error) {
        console.error('❌ fetchPosts 异常:', error);
        return { data: [], count: 0 };
    }
}

let searchTimeout = null;
let sortTimeout = null;

function debounceSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const keyword = document.getElementById('search-input')?.value || '';
        const sort = document.getElementById('sort-select')?.value || 'latest';
        const searchCategory = document.getElementById('search-category')?.value || '';
        
        showSkeleton();
        
        const tabs = document.querySelectorAll('.category-tab');
        
        if (keyword.trim()) {
            tabs.forEach(tab => tab.classList.remove('active'));
        } else if (!searchCategory) {
            const activeTab = tabs[0];
            if (activeTab) activeTab.classList.add('active');
            currentMainCategory = 'carpool';
        }
        
        const effectiveType = searchCategory || getEffectiveCategory();
        const { data } = await fetchPosts(keyword, 1, 50, effectiveType, sort, '');
        hideSkeleton();
        await renderCards(data);
    }, 300);
}

function debounceSort() {
    if (sortTimeout) clearTimeout(sortTimeout);
    sortTimeout = setTimeout(async () => {
        const keyword = document.getElementById('search-input')?.value || '';
        const sort = document.getElementById('sort-select')?.value || 'latest';
        const searchCategory = document.getElementById('search-category')?.value || '';
        
        showSkeleton();
        
        const effectiveType = searchCategory || getEffectiveCategory();
        const { data } = await fetchPosts(keyword, 1, 50, effectiveType, sort, '');
        hideSkeleton();
        await renderCards(data);
    }, 300);
}

async function handleSearch() {
    debounceSearch();
}

async function handleSort() {
    debounceSort();
}

function showSkeleton() {
    const container = document.getElementById('cards-container');
    if (container) {
        container.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-title"></div><div class="skeleton-desc"></div><div class="skeleton-progress"></div></div>
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-title"></div><div class="skeleton-desc"></div><div class="skeleton-progress"></div></div>
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-title"></div><div class="skeleton-desc"></div><div class="skeleton-progress"></div></div>
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-title"></div><div class="skeleton-desc"></div><div class="skeleton-progress"></div></div>
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-title"></div><div class="skeleton-desc"></div><div class="skeleton-progress"></div></div>
            <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-title"></div><div class="skeleton-desc"></div><div class="skeleton-progress"></div></div>
        `;
    }
}

function hideSkeleton() {
}

const creatorCache = {};

async function renderCards(data) {
    const container = document.getElementById('cards-container');
    
    if (!container) {
        return;
    }
    
    if (!data || data.length === 0) {
        container.innerHTML = renderEmptyState(typeIcons[currentMainCategory] || '📋');
        return;
    }
    
    try {
        let memberStatusMap = {};
        
        if (window.supabaseClient && window.currentUser) {
            const postIds = data.map(item => item.id);
            const { data: memberData } = await window.supabaseClient
                .from('planet_members')
                .select('group_id, status')
                .in('group_id', postIds)
                .eq('user_id', window.currentUser.id);
            
            memberStatusMap = (memberData || []).reduce((acc, m) => {
                acc[m.group_id] = m.status;
                return acc;
            }, {});
        }
        
        const creatorIds = [...new Set(data.map(item => item.creator_id))];
        const missingCreatorIds = creatorIds.filter(id => !creatorCache[id]);
        
        if (missingCreatorIds.length > 0 && window.supabaseClient) {
            const { data: creatorData } = await window.supabaseClient
                .from('planet_users')
                .select('id, username, avatar_url')
                .in('id', missingCreatorIds);
            
            (creatorData || []).forEach(c => {
                creatorCache[c.id] = { username: c.username, avatar_url: c.avatar_url };
            });
        }
        
        const cardHtml = await Promise.all(data.map(item => renderCard(item, memberStatusMap)));
        container.innerHTML = cardHtml.join('');
        
        bindCardClickEvents();
    } catch (error) {
        console.error('❌ renderCards 失败:', error);
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><p class="empty-state-text">渲染失败</p><p class="empty-state-hint">${error.message}</p></div>`;
    }
}

function bindCardClickEvents() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) {
                return;
            }
            const postId = card.dataset.id;
            if (postId) {
                showPostDetail(postId);
            }
        });
    });
}

function getParticipantCount(post) {
    if (!post) return 0;
    
    let count = parseInt(post.current_participants);
    if (isNaN(count) || count < 0) {
        count = 0;
    }
    
    return count;
}

function getMaxParticipantCount(post) {
    if (!post) return 10;
    
    let count = parseInt(post.max_participants);
    if (isNaN(count) || count < 1) {
        count = 10;
    }
    
    return count;
}

async function renderCard(item, memberStatusMap = {}) {
    try {
        const maxMembers = getMaxParticipantCount(item);
        const currentMembers = getParticipantCount(item);
        const progress = Math.min((currentMembers / maxMembers) * 100, 100);
        const isFull = currentMembers >= maxMembers;
        const isCreator = window.currentUser && item.creator_id === window.currentUser.id;
        
        const deadlineTime = item.departure_time || item.game_time || null;
        const isExpired = deadlineTime ? (new Date() > new Date(deadlineTime)) : false;
        
        let joinButton = '';
    
    if (isCreator) {
        if (item.status === 'completed') {
            joinButton = '<button class="join-btn btn-disabled">已完成</button>';
        } else if (item.status === 'cancelled') {
            joinButton = '<button class="join-btn btn-disabled">已取消</button>';
        } else if (isExpired) {
            joinButton = '<button class="join-btn btn-disabled">已过期</button>';
        } else {
            joinButton = `
                <div class="creator-actions">
                    <button class="join-btn btn-confirm" onclick="confirmPost('${item.id}')">确认订单</button>
                    <button class="join-btn btn-cancel" onclick="cancelPost('${item.id}')">取消拼搭</button>
                </div>
            `;
        }
    } else if (!window.currentUser) {
        joinButton = '<button class="join-btn btn-disabled" onclick="showAuthOverlay()">登录申请</button>';
    } else {
        const memberStatus = memberStatusMap[item.id];
        
        if (memberStatus === 'pending') {
            joinButton = '<button class="join-btn btn-disabled">⏳ 审核中</button>';
        } else if (memberStatus === 'approved') {
            joinButton = '<button class="join-btn btn-disabled">✅ 已加入</button>';
        } else if (memberStatus === 'rejected') {
            joinButton = '<button class="join-btn btn-disabled">❌ 已拒绝</button>';
        } else if (item.status === 'completed') {
            joinButton = '<button class="join-btn btn-disabled">已完成</button>';
        } else if (item.status === 'cancelled') {
            joinButton = '<button class="join-btn btn-disabled">已取消</button>';
        } else if (isExpired) {
            joinButton = '<button class="join-btn btn-disabled">已过期</button>';
        } else if (isFull) {
            joinButton = '<button class="join-btn btn-disabled">已满</button>';
        } else {
            joinButton = `<button class="join-btn" onclick="showJoinModal('${item.id}', '${item.creator_id}', ${currentMembers}, ${maxMembers})">申请加入</button>`;
        }
    }
    
    const categoryIcons = {
        '剧本杀': '🎭',
        '密室逃脱': '🗝️',
        'Livehouse/演出': '🎸',
        '桌游/棋牌': '🎲',
        '饭搭子': '🍱',
        '运动竞技': '🏀',
        '其他': '✨'
    };
    
    const categoryNames = {
        '剧本杀': '剧本杀',
        '密室逃脱': '密室逃脱',
        'Livehouse/演出': 'Livehouse',
        '桌游/棋牌': '桌游棋牌',
        '饭搭子': '饭搭子',
        '运动竞技': '运动竞技',
        '其他': '其他'
    };
    
    const type = item.type || 'game';
    let cardClass = type;
    
    const typeIcons = {
        'carpool': '🚀',
        'food': '🧋',
        'game': categoryIcons[item.category] || '🎮'
    };
    
    const typeNames = {
        'carpool': '穿梭机拼车',
        'food': '能量站拼单',
        'game': categoryNames[item.category] || '娱乐舱组局'
    };
    
    const mainCategoryLabels = {
        'carpool': { label: '🚗 拼车', class: 'category-carpool' },
        'food': { label: '🍔 拼单', class: 'category-food' },
        'game': { label: '🎮 组局', class: 'category-game' }
    };
    
    let extraInfo = '';
    
    const deadlineStr = deadlineTime ? new Date(deadlineTime).toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : null;
    
    const createdAtStr = item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : null;
    
    if (type === 'carpool') {
        if (item.departure || item.destination) {
            extraInfo = `
                <div class="card-extra">
                    <div class="extra-item">
                        <span class="extra-icon">🚗</span>
                        <span class="extra-text">${item.departure || '未设置'}</span>
                    </div>
                    <div class="extra-arrow">→</div>
                    <div class="extra-item">
                        <span class="extra-icon">📍</span>
                        <span class="extra-text">${item.destination || '未设置'}</span>
                    </div>
                </div>
            `;
        }
        if (deadlineStr) {
            extraInfo += `<div class="card-time">⏰ 出发 ${deadlineStr}</div>`;
        }
    } else if (type === 'food') {
        if (item.product_name) {
            extraInfo = `<div class="card-extra"><div class="extra-item"><span class="extra-icon">🛒</span><span class="extra-text">${item.product_name}</span></div></div>`;
        }
        if (item.product_price && item.product_group_price) {
            extraInfo += `<div class="card-price">💰 ¥${item.product_group_price} <span class="original-price">¥${item.product_price}</span></div>`;
        } else if (item.product_group_price) {
            extraInfo += `<div class="card-price">💰 ¥${item.product_group_price}</div>`;
        }
        if (item.product_location) {
            extraInfo += `<div class="card-location">📍 ${item.product_location}</div>`;
        }
        if (deadlineStr) {
            extraInfo += `<div class="card-time">⏰ 截止 ${deadlineStr}</div>`;
        }
    } else if (type === 'game') {
        if (item.game_location) {
            extraInfo = `<div class="card-location">📍 ${item.game_location}</div>`;
        }
        if (deadlineStr) {
            extraInfo += `<div class="card-time">⏰ 开始 ${deadlineStr}</div>`;
        }
    }
    
    if (createdAtStr) {
        extraInfo += `<div class="card-created-at">📅 发布于 ${createdAtStr}</div>`;
    }
    
    let distanceInfo = '';
    if (currentLocation && item.lat && item.lng) {
        const distance = item.distance || getDistance(currentLocation.lat, currentLocation.lng, item.lat, item.lng);
        const formattedDistance = formatDistance(distance);
        
        if (item.location_name) {
            distanceInfo = `<div class="card-distance">📍 ${item.location_name} · 距离您 ${formattedDistance}</div>`;
        } else {
            distanceInfo = `<div class="card-distance">📍 距离您 ${formattedDistance}</div>`;
        }
    } else if (item.location_name) {
        distanceInfo = `<div class="card-distance">📍 ${item.location_name}</div>`;
    }
    
    let statusInfo;
    if (isExpired || item.status === 'expired') {
        statusInfo = { text: '⚠️ 已过期', class: 'status-expired' };
    } else if (item.status === 'completed') {
        statusInfo = { text: '✓ 已完成', class: 'status-completed' };
    } else if (item.status === 'cancelled') {
        statusInfo = { text: '✕ 已取消', class: 'status-cancelled' };
    } else if (currentMembers >= maxMembers) {
        statusInfo = { text: '⏰ 已满', class: 'status-full' };
    } else {
        statusInfo = { text: '', class: '' };
    }
    
    const mainCategory = mainCategoryLabels[type] || { label: '', class: '' };
    
    return `
        <div class="card ${cardClass}" data-id="${item.id}">
            ${mainCategory.label ? `<div class="main-category-tag ${mainCategory.class}">${mainCategory.label}</div>` : ''}
            <div class="card-header">
                <div class="card-icon">${typeIcons[type]}</div>
                <div>
                    <div class="card-category">${typeNames[type]}</div>
                    <h3 class="card-title">${item.title}</h3>
                </div>
                ${statusInfo.text ? `<div class="card-status ${statusInfo.class}">${statusInfo.text}</div>` : ''}
            </div>
            <div class="card-creator-tag">👤 发起人</div>
            ${(() => {
                const creator = creatorCache[item.creator_id];
                if (creator && creator.username) {
                    return `<div class="card-creator-name">${creator.username}</div>`;
                }
                return '';
            })()}
            ${distanceInfo}
            ${extraInfo}
            <p class="card-content">${item.content || '暂无描述'}</p>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="card-footer">
                <div class="card-participants">已参与: ${currentMembers} / ${maxMembers}</div>
                ${joinButton}
            </div>
        </div>
    `;
    } catch (error) {
        console.error('❌ renderCard failed for item:', item.id || 'unknown', 'Error:', error);
        console.error('❌ Item data:', JSON.stringify(item));
        return `<div class="card error-card">渲染失败: ${error.message}</div>`;
    }
}

function renderEmptyState(icon) {
    return `
        <div class="empty-state">
            <div class="empty-state-icon">${icon}</div>
            <p class="empty-state-text">暂无相关拼搭</p>
            <p class="empty-state-hint">快来发起第一个拼搭吧！</p>
        </div>
    `;
}

function showEmptyState() {
    console.log('📭 showEmptyState: 显示空状态');
    
    const container = document.getElementById('cards-container');
    if (container) {
        container.innerHTML = renderEmptyState(typeIcons[currentMainCategory] || '📋');
    }
}

function isExpired(eventTime) {
    if (!eventTime) return false;
    const eventDate = new Date(eventTime);
    return eventDate < new Date();
}

function getDescriptionWithHiddenContact(description, showContact) {
    if (!description) return '';
    const lockMarker = '🔒 ';
    const contactPlaceholder = '📞 联系方式：点击加入后解锁';
    
    const idx = description.indexOf(lockMarker);
    if (idx !== -1) {
        if (showContact) {
            return description.replace('\n\n' + contactPlaceholder, '');
        } else {
            const baseText = description.substring(0, idx).replace('\n\n' + contactPlaceholder, '');
            return baseText + '\n\n' + contactPlaceholder;
        }
    }
    return description;
}

async function fetchUserInfo(userId) {
    if (!userId) return null;
    
    if (userInfoCache[userId]) {
        return userInfoCache[userId];
    }
    
    try {
        const authToken = window.userAccessToken || SUPABASE_KEY;
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/planet_users?select=id,username,avatar_url,email&id=eq.${userId}&limit=1`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${authToken}`
                }
            }
        );
        
        const data = await response.json();
        if (data && data.length > 0) {
            const email = data[0].email || '';
            const userInfo = {
                id: userId,
                username: data[0].username || (email ? email.split('@')[0] : `用户-${userId.substring(0, 8)}`),
                avatar_url: data[0].avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`
            };
            userInfoCache[userId] = userInfo;
            return userInfo;
        }
    } catch (e) {
        console.error('❌ 获取用户信息失败:', e);
    }
    
    const fallbackInfo = {
        id: userId,
        username: `用户-${userId.substring(0, 8)}`,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`
    };
    userInfoCache[userId] = fallbackInfo;
    return fallbackInfo;
}

async function showPostDetail(postId) {
    console.log('🔍 showPostDetail: 查看详情，postId:', postId);
    
    const overlay = document.getElementById('detail-modal-overlay');
    const content = document.getElementById('detail-content');
    
    content.innerHTML = '<div class="text-center py-8"><div class="loading-spinner"></div><p>加载中...</p></div>';
    overlay.classList.add('active');
    
    try {
        const { data: postData, error: postError } = await supabaseFetch('planets_posts', {
            select: 'id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_link,product_price,product_group_price,product_type,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at',
            filter: { 'id': `eq.${postId}` }
        });
        
        if (postError || !postData || postData.length === 0) {
            content.innerHTML = '<div class="text-center py-8"><p>无法加载拼搭信息</p></div>';
            return;
        }
        
        const post = postData[0];
        const creatorId = post.creator_id;
        
        const [creatorInfo, membersData] = await Promise.all([
            fetchUserInfo(creatorId),
            window.supabaseClient
                .from('planet_members')
                .select('user_id, status')
                .eq('group_id', postId)
                .eq('status', 'approved')
        ]);
        
        const memberUserIds = membersData.data?.map(m => m.user_id) || [];
        const filteredMemberIds = memberUserIds.filter(id => id !== creatorId);
        const memberInfos = await Promise.all(filteredMemberIds.map(fetchUserInfo));
        
        const maxMembers = getMaxParticipantCount(post);
        const currentMembers = getParticipantCount(post);
        const isFull = currentMembers >= maxMembers;
        
        const deadlineTime = post.departure_time || post.game_time || null;
        const isExpired = deadlineTime && new Date() > new Date(deadlineTime);
        
        let memberStatus = null;
        if (window.currentUser) {
            try {
                const { data: statusData } = await window.supabaseClient
                    .from('planet_members')
                    .select('status')
                    .eq('group_id', postId)
                    .eq('user_id', window.currentUser.id)
                    .limit(1);
                
                if (statusData && statusData.length > 0) {
                    memberStatus = statusData[0].status;
                }
            } catch (e) {
                console.warn('⚠️ 查询成员状态失败:', e);
            }
        }
        
        let joinButton = '';
        const isCreator = window.currentUser && creatorId === window.currentUser.id;
        
        if (isCreator) {
            if (isExpired) {
                joinButton = '<button class="join-btn btn-disabled">已过期</button>';
            } else {
                joinButton = '<button class="join-btn btn-disabled">自己创建</button>';
            }
        } else if (!window.currentUser) {
            joinButton = '<button class="join-btn btn-disabled" onclick="showAuthOverlay()">登录申请</button>';
        } else if (memberStatus === 'pending') {
            joinButton = '<button class="join-btn btn-disabled">⏳ 审核中</button>';
        } else if (memberStatus === 'approved') {
            joinButton = '<button class="join-btn btn-disabled">✅ 已加入</button>';
        } else if (memberStatus === 'rejected') {
            joinButton = '<button class="join-btn btn-disabled">❌ 已拒绝</button>';
        } else if (isExpired) {
            joinButton = '<button class="join-btn btn-disabled">已过期</button>';
        } else if (isFull || post.status === 'full') {
            joinButton = '<button class="join-btn btn-disabled">已满</button>';
        } else {
            joinButton = `<button class="join-btn" onclick="showJoinModal('${post.id}', '${creatorId}', ${currentMembers}, ${maxMembers}); closeDetailModal();">申请加入</button>`;
        }
        
        const typeNames = {
            'carpool': '穿梭机拼车',
            'food': '能量站拼单',
            'game': post.category || '娱乐舱组局'
        };
        
        let extraInfoHtml = '';
        
        if (post.type === 'carpool') {
            extraInfoHtml = `
                <div class="detail-info-grid">
                    ${post.departure ? `<div class="detail-info-item"><div class="detail-info-value">🚗 ${post.departure}</div><div class="detail-info-label">出发地</div></div>` : ''}
                    ${post.destination ? `<div class="detail-info-item"><div class="detail-info-value">📍 ${post.destination}</div><div class="detail-info-label">目的地</div></div>` : ''}
                    ${post.departure_time ? `<div class="detail-info-item"><div class="detail-info-value">⏰ ${new Date(post.departure_time).toLocaleString('zh-CN')}</div><div class="detail-info-label">出发时间</div></div>` : ''}
                    ${post.cost ? `<div class="detail-info-item"><div class="detail-info-value">💰 ¥${post.cost}</div><div class="detail-info-label">费用</div></div>` : ''}
                </div>
            `;
        } else if (post.type === 'food') {
            extraInfoHtml = `
                <div class="detail-info-grid">
                    ${post.product_name ? `<div class="detail-info-item"><div class="detail-info-value">🛒 ${post.product_name}</div><div class="detail-info-label">商品名称</div></div>` : ''}
                    ${post.product_group_price ? `<div class="detail-info-item"><div class="detail-info-value">💰 ¥${post.product_group_price}</div><div class="detail-info-label">拼单价</div></div>` : ''}
                    ${post.product_price ? `<div class="detail-info-item"><div class="detail-info-value">💵 ¥${post.product_price}</div><div class="detail-info-label">原价</div></div>` : ''}
                    ${post.product_location ? `<div class="detail-info-item"><div class="detail-info-value">📍 ${post.product_location}</div><div class="detail-info-label">取货地点</div></div>` : ''}
                    ${post.departure_time ? `<div class="detail-info-item"><div class="detail-info-value">⏰ ${new Date(post.departure_time).toLocaleString('zh-CN')}</div><div class="detail-info-label">截止时间</div></div>` : ''}
                </div>
            `;
        } else if (post.type === 'game') {
            extraInfoHtml = `
                <div class="detail-info-grid">
                    ${post.game_location ? `<div class="detail-info-item"><div class="detail-info-value">📍 ${post.game_location}</div><div class="detail-info-label">活动地点</div></div>` : ''}
                    ${post.game_time ? `<div class="detail-info-item"><div class="detail-info-value">⏰ ${new Date(post.game_time).toLocaleString('zh-CN')}</div><div class="detail-info-label">活动时间</div></div>` : ''}
                    ${post.game_cost ? `<div class="detail-info-item"><div class="detail-info-value">💰 ¥${post.game_cost}</div><div class="detail-info-label">费用</div></div>` : ''}
                </div>
            `;
        }
        
        const creatorHtml = creatorInfo ? `
            <div class="detail-person-item cursor-pointer" onclick="viewUserProfile('${creatorId}')">
                <img src="${creatorInfo.avatar_url}" alt="${creatorInfo.username}" class="detail-person-avatar">
                <div class="detail-person-name">${creatorInfo.username}</div>
                <div class="detail-person-role">发起人</div>
                <div class="detail-person-hint">👆 点击查看主页</div>
            </div>
        ` : '';
        
        const membersHtml = memberInfos.map(m => `
            <div class="detail-person-item cursor-pointer" onclick="viewUserProfile('${m.id}')">
                <img src="${m.avatar_url}" alt="${m.username}" class="detail-person-avatar">
                <div class="detail-person-name">${m.username}</div>
                <div class="detail-person-role">成员</div>
                <div class="detail-person-hint">👆 点击查看主页</div>
            </div>
        `).join('');
        
        const isAdmin = window.currentUser?.role === 'admin';
        const adminEditBtn = isAdmin ? `<button class="admin-edit-btn" onclick="showAdminEditModal('${post.id}')">✏️ 管理员编辑</button>` : '';
        
        content.innerHTML = `
            <div class="detail-header">
                <span class="detail-category ${post.type || 'game'}">${typeNames[post.type] || '拼搭'}</span>
                <h2 class="detail-title">${post.title}</h2>
                <div class="detail-meta">
                    <span class="detail-meta-item">👤 发起人</span>
                    <span class="detail-meta-item">👥 已参与: ${currentMembers} / ${maxMembers}</span>
                    <span class="detail-meta-item">📅 ${new Date(post.created_at).toLocaleDateString('zh-CN')}</span>
                    ${post.location_name ? `<span class="detail-meta-item">📍 ${post.location_name}</span>` : ''}
                </div>
            </div>
            
            ${extraInfoHtml}
            
            <div class="detail-content-section">
                <div class="detail-content-label">描述</div>
                <div class="detail-content-text">${post.content || '暂无描述'}</div>
            </div>
            
            <div class="detail-person-section">
                <div class="detail-person-title">👤 发起人</div>
                <div class="detail-person-list">${creatorHtml}</div>
            </div>
            
            ${membersHtml ? `
                <div class="detail-person-section">
                    <div class="detail-person-title">👥 已加入成员</div>
                    <div class="detail-person-list">${membersHtml}</div>
                </div>
            ` : ''}
            
            <div class="detail-footer">
                ${adminEditBtn}
                ${joinButton}
            </div>
        `;
        
    } catch (error) {
        console.error('❌ 加载详情失败:', error);
        content.innerHTML = `<div class="text-center py-8"><p>加载失败: ${error.message}</p></div>`;
    }
}

function closeDetailModal() {
    const overlay = document.getElementById('detail-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function viewUserProfile(userId) {
    console.log('👤 viewUserProfile: 查看用户主页, userId:', userId);
    
    if (!window.currentUser) {
        showAuthOverlay();
        return;
    }
    
    closeDetailModal();
    
    const currentPath = window.location.pathname;
    if (currentPath.includes('profile')) {
        window.location.href = `profile.html?user_id=${encodeURIComponent(userId)}`;
    } else {
        window.open(`profile.html?user_id=${encodeURIComponent(userId)}`, '_blank');
    }
}

function initDetailModal() {
    const overlay = document.getElementById('detail-modal-overlay');
    const closeBtn = document.getElementById('detail-modal-close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDetailModal);
    }
    
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeDetailModal();
            }
        });
    }
}

let joinGroupData = null;

function showJoinModal(groupId, creatorId, currentMembers, maxMembers) {
    joinGroupData = { groupId, creatorId, currentMembers, maxMembers };
    
    const joinCountInput = document.getElementById('join-count');
    const joinRemaining = document.getElementById('join-remaining');
    
    const maxJoin = maxMembers - currentMembers;
    joinCountInput.max = maxJoin;
    joinCountInput.value = Math.min(1, maxJoin);
    joinCountInput.min = 1;
    
    joinRemaining.textContent = `当前已参与 ${currentMembers} 人，还剩 ${maxJoin} 个名额`;
    
    joinCountInput.addEventListener('input', function() {
        const val = parseInt(this.value);
        if (val > maxJoin) {
            this.value = maxJoin;
        }
        joinRemaining.textContent = `当前已参与 ${currentMembers} 人，选择加入 ${val} 人，还剩 ${maxJoin - val} 个名额`;
    });
    
    const overlay = document.getElementById('join-modal-overlay');
    const card = overlay.querySelector('.detail-modal-card');
    
    overlay.classList.remove('opacity-0', 'invisible');
    card.classList.remove('scale-90');
    card.classList.add('scale-100');
    
    document.getElementById('join-modal-close').onclick = closeJoinModal;
}

function closeJoinModal() {
    const overlay = document.getElementById('join-modal-overlay');
    const card = overlay.querySelector('.detail-modal-card');
    
    overlay.classList.add('opacity-0', 'invisible');
    card.classList.remove('scale-100');
    card.classList.add('scale-90');
    joinGroupData = null;
}

let editingPostId = null;

async function showAdminEditModal(postId) {
    editingPostId = postId;
    
    try {
        const { data: postData, error } = await window.supabaseClient
            .from('planets_posts')
            .select('*')
            .eq('id', postId)
            .limit(1);
        
        if (error || !postData || postData.length === 0) {
            alert('获取帖子信息失败');
            return;
        }
        
        const post = postData[0];
        
        document.getElementById('admin-edit-title').value = post.title || '';
        document.getElementById('admin-edit-content-text').value = post.content || '';
        document.getElementById('admin-edit-status').value = post.status || 'open';
        document.getElementById('admin-edit-current').value = post.current_participants || 1;
        document.getElementById('admin-edit-max').value = post.max_participants || 4;
        document.getElementById('admin-edit-departure').value = post.departure || '';
        document.getElementById('admin-edit-destination').value = post.destination || '';
        
        const timeValue = post.departure_time || post.game_time;
        if (timeValue) {
            const date = new Date(timeValue);
            document.getElementById('admin-edit-time').value = date.toISOString().slice(0, 16);
        } else {
            document.getElementById('admin-edit-time').value = '';
        }
        
        document.getElementById('admin-edit-cost').value = post.cost || '';
        document.getElementById('admin-edit-product-name').value = post.product_name || '';
        document.getElementById('admin-edit-product-group-price').value = post.product_group_price || '';
        document.getElementById('admin-edit-location').value = post.game_location || post.product_location || post.location_name || '';
        
        const overlay = document.getElementById('admin-edit-modal-overlay');
        const card = overlay.querySelector('.detail-modal-card');
        
        overlay.classList.remove('opacity-0', 'invisible');
        card.classList.remove('scale-90');
        card.classList.add('scale-100');
        
        document.getElementById('admin-edit-modal-close').onclick = closeAdminEditModal;
        
        document.getElementById('admin-edit-form').onsubmit = async function(e) {
            e.preventDefault();
            await submitAdminEdit();
        };
        
    } catch (error) {
        console.error('❌ 加载编辑信息失败:', error);
        alert('加载编辑信息失败');
    }
}

function closeAdminEditModal() {
    const overlay = document.getElementById('admin-edit-modal-overlay');
    if (!overlay) {
        editingPostId = null;
        return;
    }
    const card = overlay.querySelector('.detail-modal-card');
    
    overlay.classList.add('opacity-0', 'invisible');
    if (card) {
        card.classList.remove('scale-100');
        card.classList.add('scale-90');
    }
    editingPostId = null;
}

async function submitAdminEdit() {
    if (!editingPostId) return;
    
    const title = document.getElementById('admin-edit-title').value;
    const content = document.getElementById('admin-edit-content-text').value;
    const status = document.getElementById('admin-edit-status').value;
    const currentParticipants = parseInt(document.getElementById('admin-edit-current').value);
    const maxParticipants = parseInt(document.getElementById('admin-edit-max').value);
    const departure = document.getElementById('admin-edit-departure').value;
    const destination = document.getElementById('admin-edit-destination').value;
    const timeValue = document.getElementById('admin-edit-time').value;
    const cost = parseFloat(document.getElementById('admin-edit-cost').value);
    const productName = document.getElementById('admin-edit-product-name').value;
    const productGroupPrice = parseFloat(document.getElementById('admin-edit-product-group-price').value);
    const location = document.getElementById('admin-edit-location').value;
    
    if (!title) {
        alert('请填写标题');
        return;
    }
    
    const updateData = {
        title,
        content,
        status,
        current_participants: currentParticipants,
        max_participants: maxParticipants
    };
    
    if (departure) updateData.departure = departure;
    if (destination) updateData.destination = destination;
    if (timeValue) {
        updateData.departure_time = new Date(timeValue).toISOString();
        updateData.game_time = new Date(timeValue).toISOString();
    }
    if (!isNaN(cost)) updateData.cost = cost;
    if (productName) updateData.product_name = productName;
    if (!isNaN(productGroupPrice)) updateData.product_group_price = productGroupPrice;
    if (location) {
        updateData.game_location = location;
        updateData.product_location = location;
        updateData.location_name = location;
    }
    
    try {
        const { error } = await window.supabaseClient
            .from('planets_posts')
            .update(updateData)
            .eq('id', editingPostId);
        
        if (error) {
            console.error('❌ 管理员编辑失败:', error);
            alert('编辑失败：' + error.message);
            return;
        }
        
        alert('✅ 修改成功！');
        closeAdminEditModal();
        closeDetailModal();
        await loadData();
        
        if (window.location.pathname.includes('admin')) {
            if (typeof loadGroupsList === 'function') {
                await loadGroupsList();
            }
            if (typeof loadDashboardStats === 'function') {
                await loadDashboardStats();
            }
        }
        
    } catch (error) {
        console.error('❌ 管理员编辑异常:', error);
        alert('编辑失败：' + error.message);
    }
}

async function submitJoinRequest() {
    if (!joinGroupData) return;
    
    const { groupId, creatorId, currentMembers, maxMembers } = joinGroupData;
    const joinCount = parseInt(document.getElementById('join-count').value) || 1;
    
    if (!window.currentUser) {
        alert('请先登录！');
        return;
    }
    
    if (!window.supabaseClient) {
        console.error('❌ 数据库连接失败');
        alert('数据库连接失败');
        return;
    }
    
    try {
        const { data: existingMembers, error: checkError } = await window.supabaseClient
            .from('planet_members')
            .select('status')
            .eq('group_id', groupId)
            .eq('user_id', window.currentUser.id);
        
        if (checkError) {
            console.error('❌ 检查成员状态失败:', checkError);
            throw checkError;
        }
        
        if (existingMembers && existingMembers.length > 0) {
            const status = existingMembers[0].status;
            if (status === 'approved') {
                alert('您已加入该拼搭！');
            } else if (status === 'pending') {
                alert('您的申请正在审核中，请耐心等待！');
            } else if (status === 'rejected') {
                alert('您的申请已被拒绝，无法再次申请');
            }
            return;
        }
        
        const { error: insertError } = await window.supabaseClient
            .from('planet_members')
            .insert([{
                group_id: groupId,
                user_id: window.currentUser.id,
                status: 'pending',
                joined_at: new Date().toISOString(),
                party_size: joinCount
            }]);
        
        if (insertError) {
            console.error('❌ 插入成员记录失败:', insertError);
            throw insertError;
        }
        
        alert('📝 申请已提交，请等待发起人审核');
        closeJoinModal();
        await loadData();
        
        if (window.location.pathname.includes('profile')) {
            await loadProfileCounts(window.currentUser.id);
        }
        
    } catch (error) {
        console.error('❌ 申请异常:', error);
        alert('申请失败：' + error.message);
    }
}

async function cancelPost(postId) {
    console.log('❌ cancelPost:', postId);
    
    if (!window.currentUser) {
        alert('请先登录！');
        return;
    }
    
    if (!confirm('确定要取消这个拼搭吗？取消后将无法恢复。')) {
        return;
    }
    
    try {
        const { error: updateError } = await supabaseFetch('planets_posts', {
            method: 'PATCH',
            body: {
                status: 'cancelled'
            },
            filter: {
                'id': `eq.${postId}`,
                'creator_id': `eq.${window.currentUser.id}`
            }
        });
        
        if (updateError) {
            console.error('❌ 取消拼搭失败:', updateError);
            throw updateError;
        }
        
        alert('✅ 拼搭已取消！');
        await loadData();
        
        if (window.location.pathname.includes('profile')) {
            await loadProfileCounts(window.currentUser.id);
        }
        
    } catch (error) {
        console.error('❌ 取消拼搭异常:', error);
        alert('取消失败：' + error.message);
    }
}

async function confirmPost(postId) {
    console.log('✅ confirmPost:', postId);
    
    if (!window.currentUser) {
        alert('请先登录！');
        return;
    }
    
    if (!confirm('确定要确认这个订单吗？确认后将移入已完成列表，无法撤销。')) {
        return;
    }
    
    try {
        const { error: updateError } = await supabaseFetch('planets_posts', {
            method: 'PATCH',
            body: {
                status: 'completed'
            },
            filter: {
                'id': `eq.${postId}`,
                'creator_id': `eq.${window.currentUser.id}`
            }
        });
        
        if (updateError) {
            console.error('❌ 确认订单失败:', updateError);
            throw updateError;
        }
        
        alert('✅ 订单已确认！');
        await loadData();
        
        if (window.location.pathname.includes('profile')) {
            await loadProfileCounts(window.currentUser.id);
        }
        
    } catch (error) {
        console.error('❌ 确认订单异常:', error);
        alert('确认失败：' + error.message);
    }
}

function openModal(type) {
    console.log('🔓 openModal:', type);
    
    const modal = document.getElementById('profile-list-modal');
    const title = document.getElementById('profile-modal-title');
    const body = document.getElementById('profile-modal-body');
    
    if (!modal || !title || !body) {
        console.error('❌ 模态框元素不存在');
        return;
    }
    
    const titles = {
        'created': '🚀 我发起的拼搭',
        'pending': '⏳ 审核中',
        'completed': '✅ 已完成',
        'joined': '👥 我参与的拼搭'
    };
    
    title.textContent = titles[type] || '📋 列表';
    body.innerHTML = '<div class="loading">加载中...</div>';
    
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
    
    loadModalData(type);
}

function closeProfileModal() {
    const modal = document.getElementById('profile-list-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

async function loadModalData(type) {
    console.log('📥 loadModalData:', type);
    
    const body = document.getElementById('profile-modal-body');
    if (!body) return;
    
    const userId = window.currentUser?.id;
    if (!userId) {
        body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔓</div><p class="empty-state-text">请先登录</p></div>';
        return;
    }
    
    try {
        let data = [];
        
        switch (type) {
            case 'created':
                if (!window.supabaseClient) {
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔌</div><p class="empty-state-text">数据库连接失败</p></div>';
                    break;
                }
                const { data: createdPosts, error: createdError } = await window.supabaseClient
                    .from('planets_posts')
                    .select('id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at')
                    .eq('creator_id', userId)
                    .in('status', ['open', 'full'])
                    .order('created_at', { ascending: false });
                
                if (createdError) {
                    console.error('❌ 查询我发起的拼搭失败:', createdError);
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p class="empty-state-text">查询失败</p></div>';
                    break;
                }
                
                data = createdPosts || [];
                
                if (currentLocation) {
                    data = data.map(item => {
                        if (item.lat && item.lng) {
                            item.distance = getDistance(currentLocation.lat, currentLocation.lng, item.lat, item.lng);
                        }
                        return item;
                    });
                }
                
                body.innerHTML = renderPostList(data, true);
                break;
                
            case 'completed':
                if (!window.supabaseClient) {
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔌</div><p class="empty-state-text">数据库连接失败</p></div>';
                    break;
                }
                
                const [completedAsCreatorResult, completedAsMemberResult] = await Promise.all([
                    window.supabaseClient
                        .from('planets_posts')
                        .select('id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at')
                        .eq('creator_id', userId)
                        .in('status', ['completed', 'cancelled', 'expired']),
                    window.supabaseClient
                        .from('planet_members')
                        .select('group_id')
                        .eq('user_id', userId)
                        .eq('status', 'approved')
                ]);
                
                const completedAsCreator = completedAsCreatorResult.data || [];
                
                const completedAsMemberGroupIds = (completedAsMemberResult.data || []).map(m => m.group_id);
                const completedAsMemberPostsResult = await window.supabaseClient
                    .from('planets_posts')
                    .select('id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at')
                    .in('id', completedAsMemberGroupIds)
                    .in('status', ['completed', 'cancelled', 'expired', 'full']);
                const completedAsMember = completedAsMemberPostsResult.data || [];
                
                const allPosts = [...completedAsCreator, ...completedAsMember];
                const seen = new Set();
                data = allPosts.filter(post => {
                    if (seen.has(post.id)) return false;
                    seen.add(post.id);
                    return true;
                }).sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                );
                
                if (currentLocation) {
                    data = data.map(item => {
                        if (item.lat && item.lng) {
                            item.distance = getDistance(currentLocation.lat, currentLocation.lng, item.lat, item.lng);
                        }
                        return item;
                    });
                }
                
                body.innerHTML = renderPostList(data, false);
                break;
                
            case 'joined':
                if (!window.supabaseClient) {
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔌</div><p class="empty-state-text">数据库连接失败</p></div>';
                    break;
                }
                const { data: memberData, error: memberError } = await window.supabaseClient
                    .from('planet_members')
                    .select('group_id, status')
                    .eq('user_id', userId)
                    .eq('status', 'approved');
                console.log('🔍 查询到的参与记录:', memberData);
                if (memberError) {
                    console.error('❌ 查询参与记录失败:', memberError);
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p class="empty-state-text">查询失败</p></div>';
                    break;
                }
                if (!memberData || memberData.length === 0) {
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p class="empty-state-text">暂无参与的拼搭</p></div>';
                    break;
                }
                const groupIds = memberData.map(m => m.group_id);
                const postsResult2 = await window.supabaseClient
                    .from('planets_posts')
                    .select('id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at')
                    .in('id', groupIds)
                    .order('created_at', { ascending: false });
                console.log('🔍 查询到的拼搭:', postsResult2.data);
                if (postsResult2.error) {
                    console.error('❌ 查询拼搭失败:', postsResult2.error);
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p class="empty-state-text">查询失败</p></div>';
                    break;
                }
                
                const filteredPosts = (postsResult2.data || []).filter(post => {
                    return post.creator_id !== userId && !['completed', 'cancelled', 'expired', 'full'].includes(post.status);
                });
                
                if (filteredPosts.length === 0) {
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p class="empty-state-text">暂无进行中的拼搭</p></div>';
                    break;
                }
                
                let postsWithMemberStatus = filteredPosts.map(post => {
                    const member = memberData.find(m => m.group_id === post.id);
                    return { ...post, member_status: member?.status || 'approved' };
                });
                
                if (currentLocation) {
                    postsWithMemberStatus = postsWithMemberStatus.map(item => {
                        if (item.lat && item.lng) {
                            item.distance = getDistance(currentLocation.lat, currentLocation.lng, item.lat, item.lng);
                        }
                        return item;
                    });
                }
                
                body.innerHTML = renderPostList(postsWithMemberStatus, false, true);
                break;
                
            case 'pending':
                if (!window.supabaseClient) {
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔌</div><p class="empty-state-text">数据库连接失败</p></div>';
                    break;
                }
                
                const [receivedPostsResult, myPendingResult] = await Promise.all([
                    window.supabaseClient
                        .from('planets_posts')
                        .select('id, title, type')
                        .eq('creator_id', userId)
                        .in('status', ['open', 'full']),
                    window.supabaseClient
                        .from('planet_members')
                        .select('group_id, user_id, status')
                        .eq('user_id', userId)
                        .eq('status', 'pending')
                ]);
                
                const receivedPosts = receivedPostsResult.data || [];
                const myPendingMembers = myPendingResult.data || [];
                
                const groupIds2 = receivedPosts.map(p => p.id);
                const receivedRequestsResult = await window.supabaseClient
                    .from('planet_members')
                    .select('group_id, user_id, status')
                    .in('group_id', groupIds2)
                    .eq('status', 'pending');
                const receivedRequests = receivedRequestsResult.data || [];
                
                let htmlParts = [];
                
                if (receivedRequests.length > 0) {
                    htmlParts.push('<h3 class="text-lg font-semibold mb-3 text-slate-700">📥 有人申请加入，请审核</h3>');
                    const requestHtml = await Promise.all(receivedRequests.map(async (member) => {
                        const post = receivedPosts.find(p => p.id === member.group_id);
                        const shortUserId = member.user_id.substring(0, 8);
                        let username = `用户-${shortUserId}`;
                        let avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.user_id}`;
                        let email = '';
                        let gender = '';
                        let phone = '';
                        let wechat = '';
                        
                        try {
                            const { data: userData, error: userError } = await window.supabaseClient
                                .from('planet_users')
                                .select('username,avatar_url,email,gender,phone,wechat')
                                .eq('id', member.user_id)
                                .limit(1);
                            
                            if (!userError && userData && userData.length > 0) {
                                email = userData[0].email || '';
                                username = userData[0].username || (email ? email.split('@')[0] : `用户-${shortUserId}`);
                                avatarUrl = userData[0].avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;
                                gender = userData[0].gender || '';
                                phone = userData[0].phone || '';
                                wechat = userData[0].wechat || '';
                            }
                        } catch (e) {
                            console.error('❌ 获取申请人信息失败:', e);
                        }
                        
                        return `
                            <div class="pending-request-item">
                                <div class="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                                    <div class="cursor-pointer flex-shrink-0" onclick="viewUserProfile('${member.user_id}')">
                                        <img src="${avatarUrl}" alt="${username}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
                                    </div>
                                    <div class="flex-1 min-w-0 cursor-pointer" onclick="viewUserProfile('${member.user_id}')">
                                        <div class="font-semibold text-slate-800">${username}</div>
                                        <div class="text-sm text-slate-500 mt-1">申请加入 "${post?.title || '未知拼搭'}"</div>
                                        <div class="flex flex-wrap gap-2 mt-2">
                                            ${email ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">📧 ${email}</span>` : ''}
                                            ${gender ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">${gender === 'male' ? '👨' : gender === 'female' ? '👩' : '🧑'} ${gender}</span>` : ''}
                                            ${phone ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">📱 ${phone}</span>` : ''}
                                            ${wechat ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">💬 ${wechat}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-2 flex-shrink-0">
                                        <button class="btn btn-success" onclick="approveRequest('${member.group_id}', '${member.user_id}'); loadModalData('pending');">✅ 同意</button>
                                        <button class="btn btn-danger" onclick="rejectRequest('${member.group_id}', '${member.user_id}'); loadModalData('pending');">❌ 拒绝</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }));
                    htmlParts.push(requestHtml.join(''));
                }
                
                if (myPendingMembers.length > 0) {
                    if (htmlParts.length > 0) htmlParts.push('<hr class="my-4 border-slate-200">');
                    htmlParts.push('<h3 class="text-lg font-semibold mb-3 text-slate-700">📤 你申请了别人，正在等对方审核</h3>');
                    
                    const myPendingGroupIds = myPendingMembers.map(m => m.group_id);
                    const myPendingPostsResult = await window.supabaseClient
                        .from('planets_posts')
                        .select('id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at')
                        .in('id', myPendingGroupIds);
                    const myPendingPosts = myPendingPostsResult.data || [];
                    
                    const myPendingHtml = myPendingPosts.map(post => {
                        return `
                            <div class="pending-request-item p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <div class="font-semibold text-slate-800">${post.title}</div>
                                        <div class="text-sm text-slate-500">状态：⏳ 审核中</div>
                                    </div>
                                    <span class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">审核中</span>
                                </div>
                            </div>
                        `;
                    });
                    htmlParts.push(myPendingHtml.join(''));
                }
                
                if (htmlParts.length === 0) {
                    body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p class="empty-state-text">暂无待处理事项</p></div>';
                } else {
                    body.innerHTML = htmlParts.join('');
                }
                break;
                
            default:
                body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❓</div><p class="empty-state-text">未知类型</p></div>';
        }
        
    } catch (error) {
        console.error('❌ 加载模态框数据失败:', error);
        body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❌</div><p class="empty-state-text">加载失败：' + error.message + '</p></div>';
    }
}

function renderPostList(posts, isCreator, showMemberStatus = false) {
    if (!posts || posts.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">📝</div><p class="empty-state-text">暂无数据</p></div>';
    }
    
    return posts.map(item => {
        const typeLabels = {
            carpool: { icon: '🚗', text: '拼车' },
            groupbuy: { icon: '🧋', text: '拼单' },
            game: { icon: '🎮', text: '组局' }
        };
        const typeInfo = typeLabels[item.type] || { icon: '📦', text: '其他' };
        
        const deadlineTime = item.departure_time || item.game_time || null;
        const isExpired = deadlineTime ? (new Date() > new Date(deadlineTime)) : false;
        
        const maxMembers = item.max_participants || 10;
        const currentMembers = item.current_participants || 0;
        const isActuallyFull = currentMembers >= maxMembers;
        
        let statusInfo;
        if (isExpired || item.status === 'expired') {
            statusInfo = { text: '⚠️ 已过期', class: 'status-expired' };
        } else if (showMemberStatus && item.member_status === 'pending') {
            statusInfo = { text: '⏳ 审核中', class: 'status-pending' };
        } else if (isActuallyFull) {
            statusInfo = { text: '⏰ 已满', class: 'status-full' };
        } else {
            const statusLabels = {
                'completed': { text: '✓ 已完成', class: 'status-completed' },
                'cancelled': { text: '✕ 已取消', class: 'status-cancelled' },
                'expired': { text: '⚠️ 已过期', class: 'status-expired' },
                'full': { text: '', class: '' },
                'open': { text: '', class: '' }
            };
            statusInfo = statusLabels[item.status] || { text: '', class: '' };
        }
        
        let actionButtons = '';
        if (isCreator && item.status !== 'completed' && item.status !== 'cancelled' && item.status !== 'expired') {
            if (isExpired) {
                actionButtons = '<button class="join-btn btn-disabled">已过期</button>';
            } else {
                actionButtons = `
                    <div class="creator-actions">
                        <button class="join-btn btn-confirm" onclick="confirmPost('${item.id}'); closeProfileModal();">确认订单</button>
                        <button class="join-btn btn-cancel" onclick="cancelPost('${item.id}'); closeProfileModal();">取消拼搭</button>
                    </div>
                `;
            }
        } else if (showMemberStatus && item.member_status === 'pending') {
            actionButtons = '<button class="join-btn btn-disabled">审核中</button>';
        } else if (showMemberStatus && item.member_status === 'approved') {
            actionButtons = '<button class="join-btn btn-disabled">已加入</button>';
        } else if (item.status === 'completed') {
            actionButtons = '<button class="join-btn btn-disabled">已完成</button>';
        } else if (item.status === 'cancelled') {
            actionButtons = '<button class="join-btn btn-disabled">已取消</button>';
        } else if (item.status === 'expired' || isExpired) {
            actionButtons = '<button class="join-btn btn-disabled">已过期</button>';
        }
        
        let distanceInfo = '';
        if (item.distance !== undefined && item.distance !== null && item.distance > 0) {
            distanceInfo = `<span>📍 ${item.distance}</span>`;
        } else if (item.location_name) {
            distanceInfo = `<span>📍 ${item.location_name}</span>`;
        }
        
        return `
            <div class="section-card" style="margin-bottom: 16px;">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                    <div style="flex-shrink: 0;">${typeInfo.icon}</div>
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <h3 style="font-weight: 600; color: #1e293b;">${item.title}</h3>
                            ${statusInfo.text ? `<span class="card-status ${statusInfo.class}">${statusInfo.text}</span>` : ''}
                        </div>
                        <p style="font-size: 0.875rem; color: #64748b; margin-bottom: 8px;">${item.content}</p>
                        <div style="display: flex; align-items: center; gap: 16px; font-size: 0.875rem; color: #64748b;">
                            <span>👥 已参与: ${currentMembers} / ${maxMembers}</span>
                            ${distanceInfo}
                            ${item.created_at ? `<span>📅 ${new Date(item.created_at).toLocaleDateString()}</span>` : ''}
                        </div>
                        ${item.departure && item.destination ? `<div style="font-size: 0.875rem; color: #64748b; margin-top: 4px;">🚗 ${item.departure} → ${item.destination}</div>` : ''}
                        ${item.product_name ? `<div style="font-size: 0.875rem; color: #64748b; margin-top: 4px;">🛒 ${item.product_name} - ¥${item.product_group_price || item.cost}</div>` : ''}
                        ${item.departure_time ? `<div style="font-size: 0.875rem; color: #64748b; margin-top: 4px;">⏰ 截止 ${new Date(item.departure_time).toLocaleString('zh-CN', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</div>` : ''}
                        ${item.game_type ? `<div style="font-size: 0.875rem; color: #64748b; margin-top: 4px;">🎮 ${item.game_type} - ¥${item.game_cost || item.cost}</div>` : ''}
                    </div>
                </div>
                ${actionButtons ? `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9;">${actionButtons}</div>` : ''}
            </div>
        `;
    }).join('');
}

async function handleLogout() {
    localStorage.clear();
    sessionStorage.clear();
    window.currentUser = null;
    updateHeaderUser();
    
    if (window.supabaseClient) {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) {
            console.error('❌ Sign out failed:', error);
        }
    }
    
    window.location.href = 'index.html';
}

function initHeaderButtons() {
    console.log('🔄 initHeaderButtons: 开始初始化头部按钮');
    
    const loginTriggerBtn = document.getElementById('login-trigger-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const profileBtn = document.getElementById('profile-btn');
    
    console.log('🔄 initHeaderButtons: loginTriggerBtn:', loginTriggerBtn);
    console.log('🔄 initHeaderButtons: logoutBtn:', logoutBtn);
    console.log('🔄 initHeaderButtons: profileBtn:', profileBtn);
    
    if (loginTriggerBtn) {
        loginTriggerBtn.addEventListener('click', () => {
            console.log('🖱️ loginTriggerBtn clicked');
            showAuthOverlay();
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    window.handleLogout = handleLogout;
    
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            console.log('🖱️ profileBtn clicked');
            window.location.href = 'profile.html';
        });
    }
    
    console.log('✅ initHeaderButtons: 头部按钮绑定完成');
}

function showAuthOverlay() {
    const authOverlay = document.getElementById('auth-modal-overlay');
    if (authOverlay) {
        authOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideAuthOverlay() {
    const authOverlay = document.getElementById('auth-modal-overlay');
    if (authOverlay) {
        authOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function initAuthModal() {
    console.log('🔄 initAuthModal: 开始初始化认证模态框');
    
    const authOverlay = document.getElementById('auth-modal-overlay');
    const authForm = document.getElementById('auth-form');
    const authSubmitBtn = document.getElementById('auth-submit');
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    
    if (!authOverlay || !authForm) {
        console.error('❌ Auth modal elements not found');
        return;
    }
    
    authOverlay.addEventListener('click', (e) => {
        if (e.target === authOverlay) {
            hideAuthOverlay();
        }
    });
    
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('auth-email')?.value || '';
        const password = document.getElementById('auth-password')?.value || '';
        
        if (!email || !password) {
            alert('请填写完整信息');
            return;
        }
        
        try {
            if (isLoginMode) {
                await handleLogin(email, password);
            } else {
                await handleRegister(email, password);
            }
        } catch (error) {
            console.error('❌ Auth failed:', error);
            const errorEl = document.getElementById('auth-error');
            if (errorEl) {
                errorEl.textContent = error.message;
                errorEl.style.display = 'block';
            }
        }
    });
    
    if (loginTab) {
        loginTab.addEventListener('click', () => {
            isLoginMode = true;
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
            authSubmitBtn.textContent = '登录';
        });
    }
    
    if (registerTab) {
        registerTab.addEventListener('click', () => {
            isLoginMode = false;
            registerTab.classList.add('active');
            loginTab.classList.remove('active');
            authSubmitBtn.textContent = '注册';
        });
    }
    
    const closeBtn = document.getElementById('auth-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideAuthOverlay);
    }
    
    console.log('✅ initAuthModal: 认证模态框绑定完成');
}

async function handleLogin(email, password) {
    console.log('🔐 handleLogin:', email);
    
    if (!window.supabaseClient) {
        throw new Error('数据库连接失败');
    }
    
    console.log('🚀 Calling signInWithPassword...');
    const startTime = Date.now();
    
    try {
        const testUsers = {
            'test1@example.com': { password: 'password123', username: '星际旅行者', role: 'citizen', userId: 'test_test1' },
            'test2@example.com': { password: 'password123', username: '宇宙探险家', role: 'citizen', userId: 'test_test2' },
            'test3@example.com': { password: 'password123', username: '银河守护者', role: 'citizen', userId: 'test_test3' },
            'admin@example.com': { password: 'password123', username: '星际管理员', role: 'admin', userId: 'test_admin' }
        };
        
        if (testUsers[email] && testUsers[email].password === password) {
            console.log('✅ 使用测试账号登录:', email);
            
            const testUser = testUsers[email];
            
            window.currentUser = {
                id: testUser.userId,
                email: email,
                username: testUser.username,
                role: testUser.role
            };
            localStorage.setItem('pinda_user', JSON.stringify(window.currentUser));
            updateHeaderUser();
            
            const insertResult = await supabaseFetch('planet_users', {
                method: 'POST',
                body: {
                    id: testUser.userId,
                    email: email,
                    username: testUser.username,
                    role: testUser.role
                },
                upsert: true
            });
            
            if (insertResult.error) {
                console.warn('⚠️ Insert user failed:', insertResult.error);
            } else {
                console.log('✅ 用户信息保存成功');
            }
            
            hideAuthOverlay();
            alert(`登录成功！欢迎 ${testUser.username} 🪐`);
            executePendingAction();
            return;
        }
        
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        const endTime = Date.now();
        console.log(`⏱️ signInWithPassword completed in ${endTime - startTime}ms`);
        
        if (error) {
            console.error('❌ Login failed:', JSON.stringify(error));
            console.error('❌ Error code:', error.code);
            console.error('❌ Error message:', error.message);
            throw error;
        }
        
        console.log('✅ Login success, data:', JSON.stringify(data));
        
        if (data.user) {
            console.log('✅ User found:', data.user.email);
            console.log('🔍 Fetching user role...');
            
            try {
                await fetchUserRoleAndLogin(data.user);
            } catch (roleError) {
                console.warn('⚠️ Failed to fetch role, using default:', roleError.message);
                window.currentUser = {
                    id: data.user.id,
                    email: data.user.email,
                    role: 'citizen'
                };
                localStorage.setItem('pinda_user', JSON.stringify(window.currentUser));
                updateHeaderUser();
            }
            
            hideAuthOverlay();
            
            try {
                const { session } = await window.supabaseClient.auth.getSession();
                if (session) {
                    window.userAccessToken = session.access_token;
                }
                
                const insertResult = await supabaseFetch('planet_users', {
                    method: 'POST',
                    body: {
                        id: data.user.id,
                        email: data.user.email,
                        role: 'citizen',
                        username: data.user.email?.split('@')[0] || '用户'
                    },
                    upsert: true,
                    useAuthToken: true
                });
                
                if (insertResult.error) {
                    console.warn('⚠️ Lazy insert failed (may already exist):', insertResult.error);
                } else {
                    console.log('✅ 用户记录创建/更新成功');
                }
            } catch (insertError) {
                console.warn('⚠️ Lazy insert exception:', insertError.message);
            }
            
            alert('登录成功！欢迎来到拼搭星球 🪐');
            executePendingAction();
        } else {
            console.error('❌ Login returned no user');
            throw new Error('登录失败：未返回用户信息');
        }
        
    } catch (error) {
        console.error('❌ handleLogin exception:', error);
        throw error;
    }
}

async function handleRegister(email, password) {
    console.log('📝 handleRegister:', email);
    
    if (!window.supabaseClient) {
        throw new Error('数据库连接失败');
    }
    
    const { data, error } = await window.supabaseClient.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: window.location.origin + '/',
            skipConfirmation: true
        }
    });
    
    if (error) {
        console.error('❌ Register failed:', error);
        
        if (error.code === '23505' || error.message.includes('already exists')) {
            alert('⚠️ 该邮箱已注册，请直接登录');
            isLoginMode = true;
            const authSubmitBtn = document.getElementById('auth-submit');
            const loginTab = document.getElementById('login-tab');
            const registerTab = document.getElementById('register-tab');
            if (authSubmitBtn) authSubmitBtn.textContent = '登录';
            if (loginTab) loginTab.classList.add('active');
            if (registerTab) registerTab.classList.remove('active');
            return;
        }
        
        throw error;
    }
    
    console.log('✅ Register success, data:', JSON.stringify(data));
    
    if (data.user) {
        window.currentUser = {
            id: data.user.id,
            email: data.user.email,
            role: 'citizen'
        };
        localStorage.setItem('pinda_user', JSON.stringify(window.currentUser));
        updateHeaderUser();
        
        try {
            const { session } = await window.supabaseClient.auth.getSession();
            if (session) {
                window.userAccessToken = session.access_token;
                console.log('🔑 获取注册后的 session token');
            }
            
            const insertResult = await supabaseFetch('planet_users', {
                method: 'POST',
                body: {
                    id: data.user.id,
                    email: data.user.email,
                    role: 'citizen'
                },
                upsert: true
            });
            
            if (insertResult.error) {
                console.warn('⚠️ Insert user failed:', insertResult.error);
                alert('注册成功，但用户信息保存失败，请登录后尝试');
            } else {
                console.log('✅ 用户信息保存成功');
            }
        } catch (insertError) {
            console.warn('⚠️ Insert user exception:', insertError.message);
            alert('注册成功，但用户信息保存失败，请登录后尝试');
        }
        
        hideAuthOverlay();
        alert('注册成功！请登录验证邮箱');
    }
}

async function fetchUserRoleAndLogin(user) {
    console.log('🔍 fetchUserRoleAndLogin:', user.email);
    
    let role = 'citizen';
    
    console.log('🔍 使用 supabaseFetch 查询角色');
    const { data, error } = await supabaseFetch('planet_users', {
        select: 'role',
        filter: {
            'id': `eq.${user.id}`
        },
        limit: 1,
        useAuthToken: true
    });
    
    if (error) {
        console.warn('⚠️ 查询用户角色失败:', error.message);
    } else if (data && data.length > 0) {
        role = data[0].role;
        console.log('✅ 角色查询成功:', role);
    } else {
        console.warn('⚠️ 未找到用户记录，尝试创建...');
        try {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/planet_users`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation,resolution=merge-duplicates'
                    },
                    body: JSON.stringify({
                        id: user.id,
                        email: user.email,
                        role: 'citizen',
                        username: user.email?.split('@')[0] || '用户'
                    })
                }
            );
            
            const result = await response.json();
            console.log('✅ 用户记录创建成功:', result);
        } catch (e) {
            console.warn('⚠️ 创建用户记录失败:', e);
        }
    }
    
    console.log('🔍 查询 planet_admins 表判断管理员身份');
    const adminResult = await supabaseFetch('planet_admins', {
        select: 'user_id',
        filter: {
            'user_id': `eq.${user.id}`
        },
        limit: 1,
        useAuthToken: true
    });
    
    if (adminResult.data && adminResult.data.length > 0) {
        role = 'admin';
        console.log('✅ 用户是管理员');
        
        console.log('📝 同步管理员角色到 planet_users 表');
        await supabaseFetch('planet_users', {
            method: 'PATCH',
            body: { role: 'admin' },
            filter: { 'id': `eq.${user.id}` }
        });
    } else {
        console.log('ℹ️ 用户不是管理员');
    }
    
    window.currentUser = {
        id: user.id,
        email: user.email,
        role: role
    };
    
    localStorage.setItem('pinda_user', JSON.stringify(window.currentUser));
    updateHeaderUser();
    
    console.log('✅ 用户角色查询成功:', role);
}

async function checkAuthStatus() {
    console.log('🔍 checkAuthStatus: 检查认证状态');
    
    if (!window.supabaseClient) {
        console.warn('⚠️ supabaseClient 未初始化');
        return;
    }
    
    console.log('📋 supabaseClient.auth:', typeof window.supabaseClient.auth);
    console.log('📋 supabaseClient.auth.getSession:', typeof window.supabaseClient.auth.getSession);
    
    try {
        console.log('🔍 调用 getSession()...');
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );
        
        const { data, error } = await Promise.race([
            window.supabaseClient.auth.getSession(),
            timeoutPromise
        ]);
        const session = data?.session;
        
        console.log('✅ getSession() 调用完成');
        
        if (error) {
            console.error('❌ 检查会话失败:', error);
            return;
        }
        
        if (session && session.user) {
            console.log('✅ 发现活跃会话:', session.user.email);
            try {
                await fetchUserRoleAndLogin(session.user);
            } catch (error) {
                console.warn('⚠️ 获取用户角色失败:', error.message);
            }
        } else {
            console.log('🔓 无活跃会话');
        }
    } catch (error) {
        console.error('❌ getSession() 异常:', error);
        console.log('🔍 继续执行后续逻辑，认证失败不影响数据加载');
    }
}

function setupAuthListener() {
    if (!window.supabaseClient) return;
    
    const isProfilePage = window.location.pathname.endsWith('profile.html');
    
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('🔄 Auth state changed:', event);
        
        if (session && session.user) {
            console.log('✅ 用户已登录:', session.user.email);
            window.userAccessToken = session.access_token;
            console.log('🔑 保存用户 access_token');
            
            await fetchUserRoleAndLogin(session.user);
            
            if (isProfilePage) {
                console.log('🔍 onAuthStateChange 触发个人主页初始化');
                initProfilePage();
            } else {
                executePendingAction();
            }
        } else {
            console.log('🔓 Auth会话失效');
            window.userAccessToken = null;
            if (!isProfilePage) {
                window.currentUser = null;
                localStorage.removeItem('pinda_user');
                updateHeaderUser();
            }
        }
    });
}

function executePendingAction() {
    if (pendingAction) {
        console.log('⏳ 执行延迟操作');
        pendingAction();
        pendingAction = null;
    }
}

function switchAuthMode(isLogin) {
    isLoginMode = isLogin;
    const authSubmitBtn = document.getElementById('auth-submit');
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    
    if (authSubmitBtn) authSubmitBtn.textContent = isLogin ? '登录' : '注册';
    if (loginTab) loginTab.classList.toggle('active', isLogin);
    if (registerTab) registerTab.classList.toggle('active', !isLogin);
}

function initModal() {
    console.log('🔄 initModal: 开始初始化模态框');
    
    const modalOverlay = document.getElementById('modal-overlay');
    const modalClose = document.getElementById('modal-close');
    const fabButton = document.getElementById('fab-button');
    
    if (fabButton) {
        fabButton.addEventListener('click', () => {
            if (!window.currentUser) {
                showAuthOverlay();
                return;
            }
            modalOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
    
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
    
    console.log('✅ initModal: 模态框绑定完成');
}

function initForm() {
    console.log('🔄 initForm: 开始初始化表单');
    
    const createForm = document.getElementById('create-form');
    if (!createForm) return;
    
    const formType = document.getElementById('form-type');
    const fieldsCarpool = document.getElementById('form-fields-carpool');
    const fieldsFood = document.getElementById('form-fields-food');
    const fieldsGame = document.getElementById('form-fields-game');
    
    if (formType) {
        formType.addEventListener('change', (e) => {
            const type = e.target.value;
            
            if (fieldsCarpool) fieldsCarpool.style.display = type === 'carpool' ? 'block' : 'none';
            if (fieldsFood) fieldsFood.style.display = type === 'food' ? 'block' : 'none';
            if (fieldsGame) fieldsGame.style.display = type === 'game' ? 'block' : 'none';
        });
    }
    
    let isSubmitting = false;

    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (isSubmitting) {
            return;
        }
        
        if (!window.currentUser) {
            alert('请先登录！');
            return;
        }
        
        const type = document.getElementById('form-type').value;
        const title = document.getElementById('form-title').value;
        const content = document.getElementById('form-content').value;
        const partySize = parseInt(document.getElementById('form-current').value) || 1;
        const maxParticipants = parseInt(document.getElementById('form-max').value) || 4;
        
        if (!type || !title || !content) {
            alert('请填写完整信息！');
            return;
        }
        
        if (partySize >= maxParticipants) {
            alert('携带人数不能大于总人数！');
            return;
        }
        
        isSubmitting = true;
        const submitBtn = createForm.querySelector('button[type="submit"]');
        const originalText = submitBtn?.textContent || '发布';
        if (submitBtn) submitBtn.textContent = '发布中...';
        
        const locationName = document.getElementById('form-location').value;
        const lat = document.getElementById('form-lat').value ? parseFloat(document.getElementById('form-lat').value) : null;
        const lng = document.getElementById('form-lng').value ? parseFloat(document.getElementById('form-lng').value) : null;
        
        const postData = {
            title,
            content,
            type,
            category: '',
            status: partySize >= maxParticipants ? 'full' : 'open',
            current_participants: 0,
            max_participants: maxParticipants,
            creator_id: window.currentUser.id,
            created_at: new Date().toISOString(),
            location_name: locationName,
            lat: lat,
            lng: lng
        };
        
        if (type === 'carpool') {
            postData.category = '其他';
            postData.departure = document.getElementById('form-departure').value;
            postData.destination = document.getElementById('form-destination').value;
            const departureTimeVal = document.getElementById('form-departure-time').value;
            postData.departure_time = departureTimeVal ? departureTimeVal : null;
            postData.cost = document.getElementById('form-cost').value ? parseFloat(document.getElementById('form-cost').value) : null;
        } else if (type === 'food') {
            postData.category = '商品拼单';
            postData.product_name = document.getElementById('form-product-name').value;
            const productLinkVal = document.getElementById('form-product-link').value;
            postData.product_link = productLinkVal ? productLinkVal : null;
            postData.product_price = document.getElementById('form-product-price').value ? parseFloat(document.getElementById('form-product-price').value) : null;
            postData.product_group_price = document.getElementById('form-product-group-price').value ? parseFloat(document.getElementById('form-product-group-price').value) : null;
            postData.product_type = document.getElementById('form-product-type').value;
            postData.product_location = document.getElementById('form-product-location').value;
            const productDeadlineVal = document.getElementById('form-product-deadline').value;
            postData.departure_time = productDeadlineVal ? productDeadlineVal : null;
        } else if (type === 'game') {
            postData.category = document.getElementById('form-game-type').value || '其他';
            postData.game_location = document.getElementById('form-game-location').value;
            const gameTimeVal = document.getElementById('form-game-time').value;
            postData.game_time = gameTimeVal ? gameTimeVal : null;
            postData.game_cost = document.getElementById('form-game-cost').value ? parseFloat(document.getElementById('form-game-cost').value) : null;
        }
        
        try {
            console.log('📝 开始创建拼搭:', postData);
            
            const { data: postDataResult, error: postError } = await window.supabaseClient
                .from('planets_posts')
                .insert([postData])
                .select();
            
            if (postError) {
                console.error('❌ 创建拼搭失败:', postError);
                throw postError;
            }
            
            const postId = postDataResult && postDataResult[0] ? postDataResult[0].id : null;
            console.log('✅ 拼搭创建成功，post_id:', postId);
            
            if (postId) {
                console.log('📝 创建发起人成员记录');
                const { error: memberError } = await window.supabaseClient
                    .from('planet_members')
                    .insert([{
                        group_id: postId,
                        user_id: window.currentUser.id,
                        status: 'approved',
                        party_size: partySize
                    }]);
                
                if (memberError) {
                    console.warn('⚠️ 创建发起人成员记录失败:', memberError);
                } else {
                    console.log('✅ 发起人成员记录创建完成，party_size:', partySize);
                }
                
                console.log('✅ 关联表记录创建完成');
            }
            
            document.getElementById('modal-overlay').classList.remove('active');
            document.body.style.overflow = '';
            createForm.reset();
            
            if (fieldsCarpool) fieldsCarpool.style.display = 'none';
            if (fieldsFood) fieldsFood.style.display = 'none';
            if (fieldsGame) fieldsGame.style.display = 'none';
            
            alert('🎉 拼搭创建成功！');
            await loadData();
            
        } catch (error) {
            console.error('❌ 创建拼搭异常:', error);
            alert('创建失败：' + error.message);
        } finally {
            isSubmitting = false;
            if (submitBtn) submitBtn.textContent = originalText;
        }
    });
    
    console.log('✅ initForm: 表单绑定完成');
}

function initTabs() {
    console.log('🔄 initTabs: 开始初始化标签页');
    
    const categoryTabs = document.querySelectorAll('.category-tab');
    console.log('🔄 initTabs: 找到分类标签数量:', categoryTabs.length);
    
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            console.log('🖱️ Category tab clicked:', tab.dataset.category);
            const categoryId = tab.dataset.category;
            
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            currentMainCategory = categoryId;
            currentSubCategory = '全部';
            
            const subCategoryBar = document.getElementById('sub-category-bar');
            if (subCategoryBar) {
                if (categoryId === 'game') {
                    subCategoryBar.style.display = 'flex';
                    subCategoryBar.querySelectorAll('.sub-category-tab').forEach(t => t.classList.remove('active'));
                    subCategoryBar.querySelector('[data-sub-category="全部"]')?.classList.add('active');
                } else {
                    subCategoryBar.style.display = 'none';
                }
            }
            
            showSkeleton();
            const sort = document.getElementById('sort-select')?.value || 'latest';
            const { data } = await fetchPosts('', 1, 50, getEffectiveCategory(), sort);
            hideSkeleton();
            await renderCards(data);
        });
    });
    
    const subCategoryBar = document.getElementById('sub-category-bar');
    if (subCategoryBar) {
        subCategoryBar.addEventListener('wheel', (e) => {
            e.preventDefault();
            subCategoryBar.scrollBy({
                left: e.deltaY > 0 ? 100 : -100,
                behavior: 'smooth'
            });
        });
        
        subCategoryBar.addEventListener('mouseenter', () => {
            subCategoryBar.style.cursor = 'grab';
        });
        
        subCategoryBar.addEventListener('mouseleave', () => {
            subCategoryBar.style.cursor = 'default';
        });
        
        const subCategoryTabs = subCategoryBar.querySelectorAll('.sub-category-tab');
        subCategoryTabs.forEach(tab => {
            tab.addEventListener('click', async () => {
                console.log('🖱️ Sub-category tab clicked:', tab.dataset.subCategory);
                const subCategory = tab.dataset.subCategory;
                
                subCategoryTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                currentSubCategory = subCategory;
                
                showSkeleton();
                const sort = document.getElementById('sort-select')?.value || 'latest';
                const { data } = await fetchPosts('', 1, 50, getEffectiveCategory(), sort);
                hideSkeleton();
                await renderCards(data);
            });
        });
    }
    
    console.log('✅ initTabs: 标签页绑定完成');
}

function updateHeaderUser() {
    const userStatus = document.getElementById('user-status');
    const loginTriggerBtn = document.getElementById('login-trigger-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const profileBtn = document.getElementById('profile-btn');
    const adminToggleBtn = document.getElementById('admin-mode-toggle');

    if (window.currentUser) {
        const emailPrefix = window.currentUser.email.split('@')[0];
        if (userStatus) {
            userStatus.textContent = `🪐 居民: ${emailPrefix}`;
            userStatus.classList.add('logged-in');
        }
        if (loginTriggerBtn) loginTriggerBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (profileBtn) profileBtn.style.display = 'block';
        
        const isAdmin = window.currentUser.role === 'admin';
        if (adminToggleBtn) {
            adminToggleBtn.style.display = isAdmin ? 'flex' : 'none';
        }
    } else {
        if (userStatus) {
            userStatus.textContent = '👤 游客居民';
            userStatus.classList.remove('logged-in');
        }
        if (loginTriggerBtn) loginTriggerBtn.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (profileBtn) profileBtn.style.display = 'none';
        if (adminToggleBtn) adminToggleBtn.style.display = 'none';
    }
}

function initProfilePage() {
    const userId = window.currentUser?.id;
    if (!userId) {
        window.location.href = 'index.html';
        return;
    }
    
    const params = new URLSearchParams(window.location.search);
    const targetUserId = params.get('user_id');
    const isViewingOther = targetUserId && targetUserId !== userId;
    
    if (isViewingOther) {
        const navbarTitle = document.getElementById('navbar-title');
        const navbarActions = document.getElementById('navbar-actions');
        
        if (navbarTitle) navbarTitle.textContent = '用户主页';
        if (navbarActions) navbarActions.style.display = 'none';
        
        document.querySelectorAll('.action-card').forEach(card => {
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.6';
        });
    } else {
        if (window.currentUser) {
            fillUserInfo({
                id: window.currentUser.id,
                email: window.currentUser.email,
                username: window.currentUser.email?.split('@')[0],
                avatar_url: window.currentUser.avatar_url,
                role: window.currentUser.role || 'citizen'
            });
        }
    }
    
    loadUserInfo(isViewingOther ? targetUserId : userId);
    loadProfileCounts(isViewingOther ? targetUserId : userId);
    
    if (!isViewingOther) {
        initProfileEditButtons();
    }
}

let lastExpireCheck = 0;
const userInfoCache = {};

async function autoExpirePosts() {
    const now = Date.now();
    if (now - lastExpireCheck < 30000) {
        return;
    }
    lastExpireCheck = now;
    
    console.log('🔄 autoExpirePosts: 自动处理过期帖子');
    
    if (!window.supabaseClient) {
        console.error('❌ 数据库连接失败');
        return;
    }
    
    try {
        const { data: openPosts, error: openError } = await window.supabaseClient
            .from('planets_posts')
            .select('id, departure_time, game_time, status')
            .in('status', ['open', 'full']);
        
        if (openError || !openPosts) {
            console.error('❌ 查询待过期帖子失败:', openError);
            return;
        }
        
        const expiredIds = [];
        
        openPosts.forEach(post => {
            const deadlineTime = post.departure_time || post.game_time || null;
            if (deadlineTime && new Date(deadlineTime) < new Date()) {
                expiredIds.push(post.id);
            }
        });
        
        if (expiredIds.length > 0) {
            console.log('🔄 发现过期帖子:', expiredIds.length, '个');
            const { error: updateError } = await window.supabaseClient
                .from('planets_posts')
                .update({ status: 'expired' })
                .in('id', expiredIds);
            
            if (updateError) {
                console.error('❌ 更新过期状态失败:', updateError);
            } else {
                console.log('✅ 成功将', expiredIds.length, '个帖子标记为过期');
            }
        }
    } catch (error) {
        console.error('❌ 自动过期处理异常:', error);
    }
}

async function loadProfileCounts(userId) {
    console.log('📥 loadProfileCounts: 加载个人主页统计数据');
    
    try {
        if (!window.supabaseClient) {
            console.error('❌ 数据库连接失败');
            return;
        }
        
        await autoExpirePosts();
        
        const [allCreatedPostsResult, myPendingRequestsResult, joinedMembersResult] = await Promise.all([
            window.supabaseClient
                .from('planets_posts')
                .select('id, status')
                .eq('creator_id', userId),
            
            window.supabaseClient
                .from('planet_members')
                .select('group_id')
                .eq('user_id', userId)
                .eq('status', 'pending'),
            
            window.supabaseClient
                .from('planet_members')
                .select('group_id')
                .eq('user_id', userId)
                .eq('status', 'approved')
        ]);
        
        const allCreatedPosts = allCreatedPostsResult.data || [];
        
        const activeCreatedPosts = allCreatedPosts.filter(p => ['open', 'full'].includes(p.status));
        const createdCount = activeCreatedPosts.length;
        
        const activeCreatedPostIds = activeCreatedPosts.map(p => p.id);
        
        const [receivedPendingMembersResult, myPendingPostsResult, joinedPostsResult] = await Promise.all([
            activeCreatedPostIds.length > 0 ? window.supabaseClient
                .from('planet_members')
                .select('id')
                .in('group_id', activeCreatedPostIds)
                .eq('status', 'pending') : { data: [] },
            
            (myPendingRequestsResult.data || []).length > 0 ? window.supabaseClient
                .from('planets_posts')
                .select('id')
                .in('id', (myPendingRequestsResult.data || []).map(r => r.group_id))
                .in('status', ['open', 'full']) : { data: [] },
            
            (joinedMembersResult.data || []).length > 0 ? window.supabaseClient
                .from('planets_posts')
                .select('id, status, creator_id')
                .in('id', (joinedMembersResult.data || []).map(m => m.group_id)) : { data: [] }
        ]);
        
        const receivedPendingCount = (receivedPendingMembersResult.data || []).length;
        const myPendingCount = (myPendingPostsResult.data || []).length;
        const pendingCount = receivedPendingCount + myPendingCount;
        
        const joinedPosts = joinedPostsResult.data || [];
        const activeJoinedPosts = joinedPosts.filter(post => {
            return post.creator_id !== userId && !['completed', 'cancelled', 'expired', 'full'].includes(post.status);
        });
        const joinedCount = activeJoinedPosts.length;
        
        const completedAsCreatorIds = new Set(
            allCreatedPosts
                .filter(p => ['completed', 'cancelled', 'expired'].includes(p.status))
                .map(p => p.id)
        );
        
        const completedAsMemberIds = new Set(
            joinedPosts
                .filter(post => post.creator_id !== userId && ['completed', 'cancelled', 'expired', 'full'].includes(post.status))
                .map(post => post.id)
        );
        
        completedAsMemberIds.forEach(id => completedAsCreatorIds.add(id));
        const completedCount = completedAsCreatorIds.size;
        
        const countCreated = document.getElementById('count-created');
        const countJoined = document.getElementById('count-joined');
        const countPending = document.getElementById('count-pending');
        const countCompleted = document.getElementById('count-completed');
        
        if (countCreated) countCreated.textContent = createdCount;
        if (countJoined) countJoined.textContent = joinedCount;
        if (countPending) countPending.textContent = pendingCount;
        if (countCompleted) countCompleted.textContent = completedCount;
        
        console.log(`📊 统计数据: created=${createdCount}, joined=${joinedCount}, pending=${pendingCount}, completed=${completedCount}`);
        
    } catch (error) {
        console.error('❌ 加载统计数据失败:', error);
    }
}

async function loadUserInfo(userId) {
    try {
        let userData = null;
        
        const fetchResult = await supabaseFetch('planet_users', {
            select: 'id,username,avatar_url,email,gender,phone,wechat,role,created_at',
            filter: {
                'id': `eq.${userId}`
            },
            limit: 1,
            useAuthToken: true
        });
        
        if (fetchResult.data && fetchResult.data.length > 0) {
            userData = fetchResult.data[0];
            console.log('✅ 用户信息加载成功:', userData);
            fillUserInfo(userData);
            return;
        }
        
        console.log('⚠️ 未找到用户记录，使用 Upsert 模式创建/更新...');
        
        const cachedUser = window.currentUser;
        if (!cachedUser) {
            console.error('❌ 无法创建用户记录，无缓存用户信息');
            return;
        }
        
        const upsertData = {
            id: cachedUser.id,
            email: cachedUser.email || '',
            role: cachedUser.role || 'citizen',
            username: cachedUser.email?.split('@')[0] || '用户'
        };
        
        console.log('📥 Upsert 用户记录:', upsertData);
        
        const upsertResult = await supabaseFetch('planet_users', {
            method: 'POST',
            body: upsertData,
            upsert: true,
            useAuthToken: true
        });
        
        console.log('📋 Upsert 结果:', upsertResult);
        
        if (!upsertResult.error && upsertResult.ok && upsertResult.data && upsertResult.data.length > 0) {
            console.log('✅ 用户记录 Upsert 成功');
            fillUserInfo(upsertResult.data[0]);
        } else if (upsertResult.status === 409) {
            console.warn('⚠️ Upsert 冲突，尝试 PATCH 更新...');
            
            const patchResult = await supabaseFetch('planet_users', {
                method: 'PATCH',
                body: upsertData,
                filter: {
                    'id': `eq.${cachedUser.id}`
                },
                useAuthToken: true
            });
            
            console.log('📋 PATCH 结果:', patchResult);
            
            if (!patchResult.error && patchResult.ok && patchResult.data && patchResult.data.length > 0) {
                console.log('✅ 用户记录 PATCH 更新成功');
                fillUserInfo(patchResult.data[0]);
            } else {
                console.error('❌ 更新用户记录失败:', patchResult.error);
                fillUserInfo({
                    id: cachedUser.id,
                    username: cachedUser.email?.split('@')[0] || '用户',
                    email: cachedUser.email || '',
                    role: cachedUser.role || 'citizen',
                    phone: '',
                    wechat: '',
                    created_at: ''
                });
            }
        } else {
            console.error('❌ Upsert 用户记录失败:', upsertResult.error);
            fillUserInfo({
                id: cachedUser.id,
                username: cachedUser.email?.split('@')[0] || '用户',
                email: cachedUser.email || '',
                role: cachedUser.role || 'citizen',
                phone: '',
                wechat: '',
                created_at: ''
            });
        }
        
    } catch (error) {
        console.error('❌ 加载用户信息异常:', error);
        
        console.log('📥 使用缓存的用户信息回退...');
        const cachedUser = window.currentUser;
        if (cachedUser) {
            fillUserInfo({
                id: cachedUser.id,
                username: cachedUser.email?.split('@')[0] || '用户',
                email: cachedUser.email || '',
                role: cachedUser.role || 'citizen',
                phone: '',
                wechat: '',
                created_at: ''
            });
        }
    }
}

function fillUserInfo(user) {
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const roleEl = document.getElementById('user-role');
    const genderEl = document.getElementById('user-gender');
    const phoneEl = document.getElementById('user-phone');
    const wechatEl = document.getElementById('user-wechat');
    const createdEl = document.getElementById('user-created');
    const avatarEl = document.getElementById('profile-avatar');
    
    const displayName = user.username || user.nickname || user.email?.split('@')[0] || '用户';
    
    const effectiveRole = user.role;
    
    const genderMap = {
        'male': '👨 男',
        'female': '👩 女',
        'other': '⚧️ 其他'
    };
    
    if (nameEl) nameEl.innerText = displayName;
    if (emailEl) emailEl.innerText = user.email || '';
    if (roleEl) roleEl.innerText = effectiveRole === 'admin' ? '管理员' : '普通用户';
    if (genderEl) genderEl.innerText = genderMap[user.gender] || '未填写';
    if (phoneEl) phoneEl.innerText = user.phone || '未填写';
    if (wechatEl) wechatEl.innerText = user.wechat || '未填写';
    if (createdEl) createdEl.innerText = user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '';
    
    if (avatarEl) {
        const container = avatarEl.parentElement;
        if (container) container.classList.remove('loaded');
        
        const loadAvatar = (src) => {
            avatarEl.onload = () => {
                if (container) container.classList.add('loaded');
            };
            avatarEl.onerror = () => {
                const seed = user.avatar_seed || user.username || user.email || 'user';
                avatarEl.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
                if (container) container.classList.add('loaded');
            };
            avatarEl.src = src;
            avatarEl.alt = displayName;
        };
        
        if (user.avatar_url) {
            loadAvatar(user.avatar_url);
        } else {
            const seed = user.avatar_seed || user.username || user.email || 'user';
            loadAvatar(`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`);
        }
    }
    
    const editUsernameEl = document.getElementById('edit-username');
    const editAvatarSeedEl = document.getElementById('edit-avatar-seed');
    const phoneInputEl = document.getElementById('phone-input');
    const wechatInputEl = document.getElementById('wechat-input');
    
    if (editUsernameEl) editUsernameEl.value = user.username || '';
    if (editAvatarSeedEl) editAvatarSeedEl.value = '';
    if (phoneInputEl) phoneInputEl.value = user.phone || '';
    if (wechatInputEl) wechatInputEl.value = user.wechat || '';
    
    if (user.gender) {
        const genderRadio = document.querySelector(`input[name="gender"][value="${user.gender}"]`);
        if (genderRadio) genderRadio.checked = true;
    }
    
    if (user.avatar_seed) {
        document.querySelectorAll('.avatar-option').forEach(el => {
            el.classList.remove('selected');
        });
        const selectedEl = document.querySelector(`.avatar-option[data-seed="${user.avatar_seed}"]`);
        if (selectedEl) {
            selectedEl.classList.add('selected');
        }
    }
    
    if (window.currentUser && effectiveRole) {
        window.currentUser.role = effectiveRole;
        localStorage.setItem('pinda_user', JSON.stringify(window.currentUser));
    }
    
    checkAdminMode(effectiveRole);
}

async function loadUserPosts(userId) {
    console.log('📥 loadUserPosts: 加载用户发布的拼搭');
    
    try {
        const { data, error } = await supabaseFetch('planets_posts', {
            select: 'id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at',
            filter: {
                'creator_id': `eq.${userId}`
            },
            inFilter: {
                'status': ['open', 'full']
            },
            order: 'created_at.desc'
        });
        
        if (error) {
            console.error('❌ 加载用户发布失败:', error);
            return;
        }
        
        const container = document.getElementById('user-posts');
        if (container) {
            if (data && data.length > 0) {
                container.innerHTML = (await Promise.all(data.map(renderCard))).join('');
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p class="empty-state-text">暂无发布的拼搭</p></div>';
            }
        }
        
    } catch (error) {
        console.error('❌ 加载用户发布异常:', error);
    }
}

async function loadUserJoinedGroups(userId) {
    console.log('📥 loadUserJoinedGroups: 加载用户加入的拼搭');
    
    try {
        const { data: memberData, error: memberError } = await supabaseFetch('planet_members', {
            select: 'group_id, status',
            filter: {
                'user_id': `eq.${userId}`
            },
            inFilter: {
                'status': ['pending', 'approved']
            },
            useAuthToken: true
        });
        
        if (memberError) {
            console.error('❌ 加载成员记录失败:', memberError);
            return;
        }
        
        const groupIds = (memberData || []).map(m => m.group_id);
        
        if (groupIds.length === 0) {
            const container = document.getElementById('user-joined');
            if (container) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p class="empty-state-text">暂无加入的拼搭</p></div>';
            }
            return;
        }
        
        const { data: postsData, error: postsError } = await supabaseFetch('planets_posts', {
            select: 'id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at',
            inFilter: {
                'id': groupIds
            },
            order: 'created_at.desc'
        });
        
        if (postsError) {
            console.error('❌ 加载加入的拼搭失败:', postsError);
            return;
        }
        
        const container = document.getElementById('user-joined');
        if (container) {
            if (postsData && postsData.length > 0) {
                const postsWithMemberStatus = postsData.map(post => {
                    const member = memberData.find(m => m.group_id === post.id);
                    return { ...post, member_status: member?.status || 'approved' };
                });
                container.innerHTML = renderPostList(postsWithMemberStatus, false, true);
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p class="empty-state-text">暂无加入的拼搭</p></div>';
            }
        }
        
    } catch (error) {
        console.error('❌ 加载用户加入拼搭异常:', error);
    }
}

async function loadPendingRequests(userId) {
    console.log('📥 loadPendingRequests: 加载收到的申请（作为发起人）');
    console.log('🔍 当前用户ID:', userId);
    
    try {
        if (!window.supabaseClient) {
            console.error('❌ 数据库连接失败');
            const container = document.getElementById('pending-requests-list');
            if (container) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔌</div><p class="empty-state-text">数据库连接失败</p></div>';
            }
            return;
        }
        
        const { data: postsData, error: postsError } = await window.supabaseClient
            .from('planets_posts')
            .select('id, title, type, creator_id')
            .eq('creator_id', userId)
            .eq('status', 'open');
        
        console.log('🔍 查询到的拼搭:', postsData);
        
        if (postsError) {
            console.error('❌ 加载发起的拼搭失败:', postsError);
            return;
        }
        
        if (!postsData || postsData.length === 0) {
            const container = document.getElementById('pending-requests-list');
            if (container) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p class="empty-state-text">暂无收到的申请</p></div>';
            }
            return;
        }
        
        const groupIds = postsData.map(p => p.id);
        console.log('🔍 拼搭ID列表:', groupIds);
        
        const { data: memberData, error: memberError } = await window.supabaseClient
            .from('planet_members')
            .select('group_id, user_id, status')
            .in('group_id', groupIds)
            .eq('status', 'pending');
        
        console.log('🔍 查询到的申请:', memberData);
        
        if (memberError) {
            console.error('❌ 加载成员申请失败:', memberError);
            return;
        }
        
        const container = document.getElementById('pending-requests-list');
        if (container) {
            if (memberData && memberData.length > 0) {
                const requestHtml = await Promise.all(memberData.map(async (member) => {
                    const post = postsData.find(p => p.id === member.group_id);
                    const shortUserId = member.user_id.substring(0, 8);
                    let username = `用户-${shortUserId}`;
                    let avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.user_id}`;
                    
                    try {
                        console.log('🔍 查询申请人信息, member.user_id:', member.user_id);
                        
                        const { data: userData, error: userError } = await window.supabaseClient
                            .from('planet_users')
                            .select('username,avatar_url,email,gender,phone,wechat')
                            .eq('id', member.user_id)
                            .limit(1);
                        
                        console.log('🔍 查询结果:', userData);
                        
                        let email = '';
                        let gender = '';
                        let phone = '';
                        let wechat = '';
                        
                        if (!userError && userData && userData.length > 0) {
                            email = userData[0].email || '';
                            username = userData[0].username || (email ? email.split('@')[0] : `用户-${shortUserId}`);
                            avatarUrl = userData[0].avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;
                            gender = userData[0].gender || '';
                            phone = userData[0].phone || '';
                            wechat = userData[0].wechat || '';
                            console.log('✅ 获取用户信息成功:', username);
                        } else {
                            console.warn('⚠️ 用户信息查询为空或失败，使用默认用户名');
                        }
                    } catch (e) {
                        console.error('❌ 获取用户信息失败:', e);
                    }
                    
                    return `
                        <div class="pending-request-item">
                            <div class="flex items-start gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                                <div class="cursor-pointer flex-shrink-0" onclick="viewUserProfile('${member.user_id}')">
                                    <img src="${avatarUrl}" alt="${username}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
                                </div>
                                <div class="flex-1 min-w-0 cursor-pointer" onclick="viewUserProfile('${member.user_id}')">
                                    <div class="font-semibold text-slate-800">${username}</div>
                                    <div class="text-sm text-slate-500 mt-1">申请加入 "${post?.title || '未知拼搭'}"</div>
                                    <div class="flex flex-wrap gap-2 mt-2">
                                        ${email ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">📧 ${email}</span>` : ''}
                                        ${gender ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">${gender === 'male' ? '👨' : gender === 'female' ? '👩' : '🧑'} ${gender}</span>` : ''}
                                        ${phone ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">📱 ${phone}</span>` : ''}
                                        ${wechat ? `<span class="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">💬 ${wechat}</span>` : ''}
                                    </div>
                                </div>
                                <div class="flex flex-col gap-2 flex-shrink-0">
                                    <button class="btn btn-success" onclick="approveRequest('${member.group_id}', '${member.user_id}')">✅ 同意</button>
                                    <button class="btn btn-danger" onclick="rejectRequest('${member.group_id}', '${member.user_id}')">❌ 拒绝</button>
                                </div>
                            </div>
                        </div>
                    `;
                }));
                
                container.innerHTML = requestHtml.join('');
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p class="empty-state-text">暂无收到的申请</p></div>';
            }
        }
        
    } catch (error) {
        console.error('❌ 加载审核中申请异常:', error);
    }
}

async function approveRequest(groupId, userId) {
    console.log('✅ approveRequest:', groupId, userId);
    
    try {
        const { data: memberData, error: memberError } = await window.supabaseClient
            .from('planet_members')
            .select('party_size')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .limit(1);
        
        const joinCount = memberData && memberData.length > 0 ? (memberData[0].party_size || 1) : 1;
        
        const { error: updateError } = await supabaseFetch('planet_members', {
            method: 'PATCH',
            body: {
                status: 'approved',
                joined_at: new Date().toISOString()
            },
            filter: {
                'group_id': `eq.${groupId}`,
                'user_id': `eq.${userId}`
            }
        });
        
        if (updateError) {
            console.error('❌ 同意申请失败:', updateError);
            throw updateError;
        }
        
        const { data: postData, error: postError } = await window.supabaseClient
            .from('planets_posts')
            .select('current_participants, max_participants')
            .eq('id', groupId)
            .limit(1);
        
        if (!postError && postData && postData.length > 0) {
            const current = postData[0].current_participants || 0;
            const max = postData[0].max_participants || 4;
            const newStatus = current >= max ? 'full' : 'open';
            
            await window.supabaseClient
                .from('planets_posts')
                .update({
                    status: newStatus
                })
                .eq('id', groupId);
        }
        
        alert('✅ 申请已通过！');
        await loadData();
        if (window.location.pathname.includes('profile')) {
            await loadProfileCounts(window.currentUser.id);
        }
        
    } catch (error) {
        console.error('❌ 同意申请异常:', error);
        alert('操作失败：' + error.message);
    }
}

async function rejectRequest(groupId, userId) {
    console.log('❌ rejectRequest:', groupId, userId);
    
    try {
        const { error: updateError } = await supabaseFetch('planet_members', {
            method: 'PATCH',
            body: {
                status: 'rejected'
            },
            filter: {
                'group_id': `eq.${groupId}`,
                'user_id': `eq.${userId}`
            }
        });
        
        if (updateError) {
            console.error('❌ 拒绝申请失败:', updateError);
            throw updateError;
        }
        
        alert('❌ 申请已拒绝！');
        if (window.location.pathname.includes('profile')) {
            await loadProfileCounts(window.currentUser.id);
        }
        
    } catch (error) {
        console.error('❌ 拒绝申请异常:', error);
        alert('操作失败：' + error.message);
    }
}

async function loadCompletedGroups(userId) {
    console.log('📥 loadCompletedGroups: 加载已完成的拼搭');
    
    try {
        const { data, error } = await supabaseFetch('planets_posts', {
            select: 'id,title,content,type,category,status,current_participants,max_participants,creator_id,departure,destination,departure_time,cost,product_name,product_group_price,product_location,game_type,game_location,game_time,game_cost,location_name,lat,lng,created_at',
            filter: {
                'creator_id': `eq.${userId}`
            },
            inFilter: {
                'status': ['completed', 'cancelled']
            },
            order: 'created_at.desc'
        });
        
        if (error) {
            console.error('❌ 加载已完成拼搭失败:', error);
            return;
        }
        
        const container = document.getElementById('completed-groups-list');
        if (container) {
            if (data && data.length > 0) {
                container.innerHTML = (await Promise.all(data.map(renderCard))).join('');
            } else {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p class="empty-state-text">暂无已完成的拼搭</p></div>';
            }
        }
        
    } catch (error) {
        console.error('❌ 加载已完成拼搭异常:', error);
    }
}

function showEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function hideRequestsModal() {
    const modal = document.getElementById('requests-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function initProfileEditButtons() {
    const saveAllBtn = document.getElementById('save-all-btn');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', async () => {
            const username = document.getElementById('edit-username')?.value || '';
            const avatarSeed = document.getElementById('edit-avatar-seed')?.value || '';
            const phone = document.getElementById('phone-input')?.value || '';
            const wechat = document.getElementById('wechat-input')?.value || '';
            const genderRadios = document.querySelectorAll('input[name="gender"]');
            let gender = '';
            genderRadios.forEach(radio => {
                if (radio.checked) gender = radio.value;
            });
            
            if (!window.currentUser) return;
            
            const updateData = {};
            if (username) updateData.username = username;
            if (phone) updateData.phone = phone;
            if (wechat) updateData.wechat = wechat;
            if (gender) updateData.gender = gender;
            if (avatarSeed) updateData.avatar_url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(avatarSeed)}`;
            
            if (Object.keys(updateData).length === 0) {
                alert('请输入要修改的内容');
                return;
            }
            
            console.log('📥 准备保存:', updateData);
            console.log('📥 用户ID:', window.currentUser.id);
            
            const patchResult = await supabaseFetch('planet_users', {
                method: 'PATCH',
                body: updateData,
                filter: {
                    'id': `eq.${window.currentUser.id}`
                }
            });
            
            console.log('📋 PATCH 结果:', patchResult);
            
            if (!patchResult.error && patchResult.ok && (patchResult.data && patchResult.data.length > 0)) {
                alert('保存成功！');
                hideEditProfileModal();
                loadUserInfo(window.currentUser.id);
            } else if (!patchResult.error && patchResult.ok && (!patchResult.data || patchResult.data.length === 0)) {
                console.log('⚠️ PATCH 未找到匹配行，尝试 INSERT...');
                
                const insertData = {
                    id: window.currentUser.id,
                    email: window.currentUser.email || '',
                    role: window.currentUser.role || 'citizen',
                    ...updateData
                };
                
                console.log('📥 INSERT 数据:', insertData);
                
                const insertResult = await supabaseFetch('planet_users', {
                    method: 'POST',
                    body: insertData
                });
                
                console.log('📋 INSERT 结果:', insertResult);
                
                if (!insertResult.error && insertResult.ok) {
                    alert('保存成功！');
                    hideEditProfileModal();
                    loadUserInfo(window.currentUser.id);
                } else {
                    alert('保存失败，请重试');
                    console.error('❌ INSERT 失败:', insertResult.error, insertResult.status);
                }
            } else {
                alert('保存失败，请重试');
                console.error('❌ PATCH 失败:', patchResult.error, patchResult.status);
            }
        });
    }
    
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
        avatarEl.style.cursor = 'pointer';
        avatarEl.title = '点击编辑头像';
        avatarEl.addEventListener('click', () => {
            showEditProfileModal();
        });
    }
    
    const fileInput = document.getElementById('avatar-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleAvatarFileSelect);
    }
}

let cropper = null;
let pendingAvatarFile = null;

function handleAvatarFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    pendingAvatarFile = file;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = document.getElementById('crop-image');
        if (img) {
            img.src = event.target.result;
            showCropModal();
        }
    };
    reader.readAsDataURL(file);
}

function showCropModal() {
    const modal = document.getElementById('avatar-crop-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
            const img = document.getElementById('crop-image');
            if (img && window.Cropper) {
                if (cropper) {
                    cropper.destroy();
                }
                cropper = new window.Cropper(img, {
                    aspectRatio: 1,
                    viewMode: 1,
                    dragMode: 'move',
                    autoCropArea: 0.8,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: false,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: false
                });
            }
        }, 100);
    }
}

function hideCropModal() {
    const modal = document.getElementById('avatar-crop-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    pendingAvatarFile = null;
}

function confirmCrop() {
    if (!cropper) return;
    
    const canvas = cropper.getCroppedCanvas({
        width: 200,
        height: 200,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });
    
    canvas.toBlob(async (blob) => {
        if (blob && window.currentUser) {
            const avatarUrl = await uploadAvatar(blob, window.currentUser.id);
            if (avatarUrl) {
                const avatarEl = document.getElementById('profile-avatar');
                if (avatarEl) {
                    avatarEl.src = avatarUrl;
                }
                
                const hiddenInput = document.getElementById('edit-avatar-seed');
                if (hiddenInput) {
                    hiddenInput.value = '';
                }
                
                await supabaseFetch('planet_users', {
                    method: 'PATCH',
                    body: { avatar_url: avatarUrl },
                    filter: {
                        'id': `eq.${window.currentUser.id}`
                    }
                });
                
                alert('头像上传成功！');
            } else {
                alert('头像上传失败，请重试');
            }
        }
        hideCropModal();
    }, 'image/png', 0.9);
}

function checkAdminMode(role) {
    const adminToggleBtn = document.getElementById('admin-mode-toggle');
    if (role === 'admin' && adminToggleBtn) {
        adminToggleBtn.style.display = 'flex';
    } else if (adminToggleBtn) {
        adminToggleBtn.style.display = 'none';
    }
}

function selectAvatar(seed) {
    const hiddenInput = document.getElementById('edit-avatar-seed');
    if (hiddenInput) {
        hiddenInput.value = seed;
    }
    
    document.querySelectorAll('.avatar-option').forEach(el => {
        el.classList.remove('selected');
    });
    
    const selectedEl = document.querySelector(`.avatar-option[data-seed="${seed}"]`);
    if (selectedEl) {
        selectedEl.classList.add('selected');
    }
}

function toggleAvatarPicker() {
    const container = document.getElementById('avatar-picker-container');
    if (container) {
        container.style.display = container.style.display === 'none' ? 'grid' : 'none';
    }
}

async function uploadAvatar(file, userId) {
    try {
        console.log('🔍 开始上传头像:', file.name, file.size);
        
        let blob = file;
        if (file instanceof File) {
            blob = await resizeImage(file, 200, 200);
        }
        
        console.log('🔍 压缩后大小:', blob.size);
        
        const fileName = `${userId}_${Date.now()}.png`;
        const url = `${SUPABASE_URL}/storage/v1/object/avatars/${fileName}`;
        
        console.log('🔍 上传 URL:', url);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            body: blob
        });
        
        const responseText = await response.text();
        console.log('🔍 上传响应:', response.status, responseText);
        
        if (response.ok) {
            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${fileName}`;
            console.log('✅ 头像上传成功:', publicUrl);
            return publicUrl;
        } else {
            console.error('❌ 头像上传失败:', response.status, responseText);
            return '';
        }
    } catch (error) {
        console.error('❌ 头像上传异常:', error);
        return '';
    }
}

function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('图片转换失败'));
                    }
                }, 'image/png', 0.9);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

