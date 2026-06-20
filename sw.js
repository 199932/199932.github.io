// 墨香阁 Service Worker - 版本管理 + 缓存策略
// 每次更新代码请同步修改 CACHE_VERSION
const CACHE_VERSION = 'moxiang_v2_0_0';
const STATIC_CACHE = 'static-' + CACHE_VERSION;
const RUNTIME_CACHE = 'runtime-' + CACHE_VERSION;

// 需要缓存的核心文件（第一次安装时缓存）
const CORE_FILES = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 安装阶段：缓存核心文件
self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache){
      return cache.addAll(CORE_FILES).catch(function(e){
        console.log('SW 缓存核心文件失败（忽略）');
      });
    }).then(function(){
      // 强制激活新 SW
      return self.skipWaiting();
    })
  );
});

// 激活阶段：清除旧版本缓存
self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(cacheNames){
      return Promise.all(
        cacheNames.filter(function(name){
          // 清除其他版本的缓存
          return name !== STATIC_CACHE && name !== RUNTIME_CACHE;
        }).map(function(name){
          return caches.delete(name);
        })
      );
    }).then(function(){
      // 立即接管所有客户端
      return self.clients.claim();
    })
  );
});

// 消息监听：处理更新
self.addEventListener('message', function(event){
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

// 请求拦截：3 种策略
self.addEventListener('fetch', function(event){
  const req = event.request;

  // 只处理 GET 请求
  if(req.method !== 'GET'){return;}

  const url = new URL(req.url);

  // 1. API 请求（GitHub API / 本地 API）：网络优先，失败回退缓存
  if(url.hostname.indexOf('api.github.com') >= 0 || url.pathname.indexOf('/novels') >= 0){
    event.respondWith(
      fetch(req).then(function(response){
        // 不缓存 API 响应
        return response;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || new Response(JSON.stringify({error:'network_offline'}),{status:503,headers:{'Content-Type':'application/json'}});
        });
      })
    );
    return;
  }

  // 2. 导航请求（HTML 页面）：网络优先，失败回退缓存
  if(req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').indexOf('text/html') >= 0)){
    event.respondWith(
      fetch(req).then(function(response){
        // 缓存新版本页面
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then(function(cache){cache.put(req, copy);});
        return response;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // 3. 其他静态资源：缓存优先，失败再网络
  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached){return cached;}
      return fetch(req).then(function(response){
        if(response && response.status === 200 && response.type !== 'opaque'){
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(function(cache){cache.put(req, copy);});
        }
        return response;
      }).catch(function(){
        return cached;
      });
    })
  );
});

console.log('SW 已加载: ' + CACHE_VERSION);
