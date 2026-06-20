// ================================================================
// 墨香阁 · 核心逻辑
// 基于 GitHub Issues 构建的小说内容发布系统
// ================================================================

// ===== 配置区（请在这里替换你的 Token） =====
const CONFIG = {
    owner: '199932',
    repo: '199932.github.io',
    // ⚠️ 安全提示：Token 已从代码中移除
    // 请在 localStorage 中设置：打开控制台执行 localStorage.setItem('gh_token', '你的新Token')
    // 或直接在此处填入（不推荐，会暴露给访问者）
    token: '',
    label: 'story',
    cacheKey: 'moxiang_cache_v1',
    perPage: 10,
    categoryLabels: ['都市', '玄幻', '言情', '科幻', '悬疑', '历史', '武侠', '原创', '其他']
};

// 从 localStorage 读取 Token（更安全的方式）
CONFIG.token = localStorage.getItem('gh_token') || CONFIG.token;

// ===== 工具函数 =====

/**
 * 从 Issue 中提取分类标签
 * GitHub 的 label 可能是 story + 分类（如：story, 都市, 玄幻等）
 */
function extractCategory(labels) {
    if (!labels || labels.length === 0) return '原创';
    const labelNames = labels.map(l => l.name);
    const category = labelNames.find(name => CONFIG.categoryLabels.includes(name));
    return category || '原创';
}

/**
 * 从 Issue body 中提取摘要（前 60 字）
 */
function extractExcerpt(body, maxLen = 60) {
    if (!body) return '暂无简介';
    // 去掉 Markdown 标记符号
    const clean = body
        .replace(/[#>*`_\-\[\]]/g, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return clean.length > maxLen ? clean.substring(0, maxLen) + '...' : clean;
}

/**
 * 轻量级 Markdown 解析器（支持常用语法）
 */
function parseMarkdown(text) {
    if (!text) return '';

    let html = text;

    // 代码块
    html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
        return '<pre style="background:#f5f0e4;padding:16px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:13px;line-height:1.6;"><code>' + escapeHtml(code) + '</code></pre>';
    });

    // 行内代码
    html = html.replace(/`([^`]+)`/g, function(match, code) {
        return '<code style="background:#f5f0e4;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.9em;">' + escapeHtml(code) + '</code>';
    });

    // 图片 ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');

    // 链接 [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
        return '<a href="' + url + '" target="_blank" style="color:#8b6f47;text-decoration:underline;">' + text + '</a>';
    });

    // 加粗 **text** 或 __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体 *text* 或 _text_
    html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');

    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 列表
    html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.+<\/li>\n?)+/g, function(match) {
        return '<ul style="margin:14px 0;padding-left:20px;">' + match + '</ul>';
    });

    // 引用
    html = html.replace(/^>\s*(.+)$/gm, '<blockquote style="border-left:3px solid #d4c8b0;padding:8px 14px;margin:14px 0;color:#5c4a32;background:#faf8f5;border-radius:4px;">$1</blockquote>');

    // 换行处理 - 仅处理段落分隔
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    return '<p>' + html + '</p>';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 1) return '今天';
    if (days < 7) return days + ' 天前';
    if (days < 30) return Math.floor(days / 7) + ' 周前';
    return d.toLocaleDateString('zh-CN');
}

// ===== API 封装 =====

const api = {
    get headers() {
        const h = { 'Accept': 'application/vnd.github.v3+json' };
        if (CONFIG.token) h['Authorization'] = 'token ' + CONFIG.token;
        return h;
    },

    async getIssues(page = 1) {
        const url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo +
                    '/issues?state=open&labels=' + CONFIG.label +
                    '&per_page=' + CONFIG.perPage + '&page=' + page;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) {
            if (res.status === 403) throw new Error('API 速率超限，请稍后重试或设置 Token');
            if (res.status === 404) throw new Error('仓库未找到或无权访问');
            throw new Error('API 请求失败 (' + res.status + ')');
        }
        return await res.json();
    },

    async getIssueDetail(number) {
        const url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo + '/issues/' + number;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) throw new Error('获取详情失败');
        return await res.json();
    },

    async createIssue(title, body, labels) {
        const url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo + '/issues';
        const res = await fetch(url, {
            method: 'POST',
            headers: Object.assign({}, this.headers, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ title: title, body: body, labels: labels })
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('Token 无效或无写入权限');
            if (res.status === 403) throw new Error('无权限发布（请确认 Token 含 public_repo 权限）');
            throw new Error('发布失败 (' + res.status + ')');
        }
        return await res.json();
    }
};

// ===== 主应用 =====

const app = {
    currentPage: 1,
    currentCategory: '全部',
    allIssues: [],

    init() {
        this.bindEvents();
        this.renderList(1);
    },

    bindEvents() {
        // 加载更多
        const loadMoreBtn = document.getElementById('load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                this.currentPage++;
                this.renderList(this.currentPage, false);
            });
        }

        // 分类筛选
        const tags = document.querySelectorAll('.cat-tag');
        tags.forEach(tag => {
            tag.addEventListener('click', () => {
                tags.forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
                this.currentCategory = tag.dataset.cat;
                this.filterAndRender();
            });
        });

        // 弹窗关闭
        const modal = document.getElementById('modal');
        if (modal) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.style.display === 'block') {
                    modal.style.display = 'none';
                }
            });
        }
    },

    async renderList(page, isReset = true) {
        const listEl = document.getElementById('article-list');
        if (!listEl) return;

        const loadMoreBtn = document.getElementById('load-more');

        if (isReset) {
            listEl.innerHTML = '<div class="loading"><div class="spinner"></div><p>正在从云端加载故事...</p></div>';
            this.allIssues = [];
            this.currentPage = 1;
            page = 1;
        }

        try {
            const issues = await api.getIssues(page);

            if (isReset) listEl.innerHTML = '';

            if (issues.length === 0 && this.allIssues.length === 0) {
                listEl.innerHTML = '<div class="empty-msg"><p style="font-size:3em;margin-bottom:12px;">📚</p><p>暂无故事</p><p style="font-size:13px;color:#b5a88e;margin-top:8px;">请先在仓库创建带有 ' + CONFIG.label + ' 标签的 Issue</p></div>';
                return;
            }

            // 累积所有 Issue
            issues.forEach(issue => {
                if (!this.allIssues.find(i => i.number === issue.number)) {
                    this.allIssues.push(issue);
                }
            });

            // 应用筛选渲染
            this.filterAndRender();

            // 判断是否还有更多
            if (issues.length < CONFIG.perPage) {
                loadMoreBtn.style.display = 'none';
            } else {
                loadMoreBtn.style.display = 'inline-block';
            }

        } catch (e) {
            listEl.innerHTML = '<div class="error-msg"><strong>❌ 加载失败</strong><p style="margin-top:8px;">' + e.message + '</p></div>';
            console.error(e);
        }
    },

    filterAndRender() {
        const listEl = document.getElementById('article-list');
        if (!listEl) return;

        listEl.innerHTML = '';

        let filtered = this.allIssues;
        if (this.currentCategory !== '全部') {
            filtered = this.allIssues.filter(issue => extractCategory(issue.labels) === this.currentCategory);
        }

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="empty-msg"><p style="font-size:2em;margin-bottom:12px;">🔍</p><p>该分类下暂无故事</p></div>';
            return;
        }

        filtered.forEach(issue => {
            const card = this.createCard(issue);
            listEl.appendChild(card);
        });
    },

    createCard(issue) {
        const category = extractCategory(issue.labels);
        const excerpt = extractExcerpt(issue.body);
        const author = issue.user ? issue.user.login : '未知';

        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = '<h3>' + escapeHtml(issue.title) + '</h3>' +
            '<div class="meta">' +
                '<span class="category-badge">' + escapeHtml(category) + '</span>' +
                '<span>作者：' + escapeHtml(author) + '</span>' +
                '<span>' + formatDate(issue.created_at) + '</span>' +
            '</div>' +
            '<p class="excerpt">' + escapeHtml(excerpt) + '</p>' +
            '<button class="read-btn">阅读全文 →</button>';

        div.addEventListener('click', () => this.showDetail(issue.number));
        return div;
    },

    async showDetail(number) {
        const modal = document.getElementById('modal');
        const modalBody = document.getElementById('modal-body');

        modalBody.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div></div>';
        modal.style.display = 'block';

        try {
            const detail = await api.getIssueDetail(number);
            const category = extractCategory(detail.labels);

            modalBody.innerHTML =
                '<h2>' + escapeHtml(detail.title) + '</h2>' +
                '<div class="meta">' +
                    '<span class="category-badge">' + escapeHtml(category) + '</span>' +
                    '<span>作者：' + escapeHtml(detail.user ? detail.user.login : '未知') + '</span>' +
                    '<span>' + new Date(detail.created_at).toLocaleDateString('zh-CN') + '</span>' +
                '</div>' +
                '<div class="content">' + parseMarkdown(detail.body) + '</div>';

        } catch (e) {
            modalBody.innerHTML = '<div class="status-msg error">' + e.message + '</div>';
        }
    },

    // ===== 发布功能 =====
    initPublish() {
        const form = document.getElementById('publish-form');
        if (!form) return;

        // 字数统计
        const textarea = document.getElementById('story-body');
        const charCount = document.getElementById('char-count');
        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                charCount.textContent = textarea.value.length + ' 字';
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const title = document.getElementById('story-title').value.trim();
            const body = document.getElementById('story-body').value.trim();
            const category = document.getElementById('story-category').value;
            const statusEl = document.getElementById('status');
            const submitBtn = document.getElementById('submit-btn');

            if (!title || !body) {
                statusEl.className = 'status-msg error';
                statusEl.textContent = '请填写完整的标题和内容';
                return;
            }

            if (!CONFIG.token) {
                statusEl.className = 'status-msg error';
                statusEl.innerHTML = '⚠️ 未检测到 Token。<br>请先在页面顶部设置 Token。';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '发布中...';
            statusEl.className = 'status-msg info';
            statusEl.textContent = '正在发布到 GitHub，请稍候...';

            try {
                // 在正文前添加摘要
                const fullBody = '**' + extractExcerpt(body, 40) + '**\n\n' + body;

                const labels = [CONFIG.label, category];
                const result = await api.createIssue(title, fullBody, labels);

                statusEl.className = 'status-msg success';
                statusEl.innerHTML = '✅ 发布成功！<br><a href="' + result.html_url + '" target="_blank" style="color:#8b6f47;">在 GitHub 中查看</a>';

                // 清空表单
                form.reset();
                document.getElementById('char-count').textContent = '0 字';

                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);

            } catch (e) {
                statusEl.className = 'status-msg error';
                statusEl.textContent = '❌ ' + e.message;
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '发布故事';
            }
        });
    }
};

// 页面启动
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('publish-form')) {
        app.initPublish();
    } else {
        app.init();
    }
});
