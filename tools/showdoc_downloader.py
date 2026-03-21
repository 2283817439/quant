"""ShowDoc 文档查看与批量下载器"""
from flask import Flask, render_template_string, request, jsonify, redirect
import requests
from bs4 import BeautifulSoup
import json
import os
import re
from datetime import datetime

app = Flask(__name__)

# 配置
BASE_URL = "https://www.showdoc.cc/529600549483974"
OUTPUT_DIR = 'docs/showdoc_complete'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 已发现的页面
discovered_pages = set()
saved_pages = set()

@app.route('/')
def index():
    return render_template_string('''
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ShowDoc 文档下载器</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .content {
            display: flex;
            height: calc(100vh - 200px);
        }
        .sidebar {
            width: 400px;
            background: #f8f9fa;
            border-right: 2px solid #e9ecef;
            padding: 20px;
            overflow-y: auto;
        }
        .main-area {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        .stats {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .stats strong { color: #856404; }
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            margin: 5px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: translateY(-2px); }
        .btn:disabled { 
            background: #ccc; 
            cursor: not-allowed;
            transform: none;
        }
        .page-list {
            list-style: none;
        }
        .page-item {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .page-item:hover {
            background: #e7f3ff;
            border-color: #667eea;
        }
        .page-item.saved {
            background: #d4edda;
            border-color: #28a745;
        }
        .page-item h4 {
            font-size: 14px;
            margin-bottom: 5px;
            color: #333;
        }
        .page-item p {
            font-size: 12px;
            color: #666;
            word-break: break-all;
        }
        .iframe-container {
            width: 100%;
            height: 100%;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .log-box {
            background: #2d3748;
            color: #4fd1c5;
            padding: 15px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
            margin-top: 20px;
        }
        .log-entry { margin: 5px 0; }
        .log-success { color: #68d391; }
        .log-error { color: #fc8181; }
        .log-info { color: #63b3ed; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 ShowDoc 文档批量下载器</h1>
            <p>自动遍历并保存所有文档页面</p>
        </div>
        
        <div class="content">
            <div class="sidebar">
                <div class="stats">
                    <strong>📊 统计信息</strong><br>
                    已发现页面：<span id="foundCount">0</span><br>
                    已保存页面：<span id="savedCount">0</span>
                </div>
                
                <button class="btn" onclick="startCrawl()" id="crawlBtn">
                    🚀 开始爬取所有文档
                </button>
                <button class="btn" onclick="loadCurrent()">
                    📖 打开当前文档
                </button>
                
                <h3 style="margin: 20px 0 10px;">发现页面列表:</h3>
                <ul class="page-list" id="pageList"></ul>
            </div>
            
            <div class="main-area">
                <div class="iframe-container">
                    <iframe id="docFrame" src="/proxy?url={{ base_url }}"></iframe>
                </div>
                
                <div class="log-box" id="logBox"></div>
            </div>
        </div>
    </div>
    
    <script>
        let isCrawling = false;
        
        function log(message, type='info') {
            const logBox = document.getElementById('logBox');
            const entry = document.createElement('div');
            entry.className = 'log-entry log-' + type;
            const time = new Date().toLocaleTimeString();
            entry.textContent = `[${time}] ${message}`;
            logBox.appendChild(entry);
            logBox.scrollTop = logBox.scrollHeight;
        }
        
        async function startCrawl() {
            if (isCrawling) return;
            isCrawling = true;
            document.getElementById('crawlBtn').disabled = true;
            
            log('开始爬取...', 'info');
            
            try {
                const response = await fetch('/crawl', { method: 'POST' });
                const data = await response.json();
                
                if (data.success) {
                    log(`爬取完成！保存了 ${data.saved} 个页面`, 'success');
                    updateStats(data.found, data.saved);
                } else {
                    log('爬取失败：' + data.error, 'error');
                }
            } catch (e) {
                log('爬取异常：' + e.message, 'error');
            }
            
            isCrawling = false;
            document.getElementById('crawlBtn').disabled = false;
        }
        
        function loadCurrent() {
            document.getElementById('docFrame').src = '/proxy?url=' + encodeURIComponent('{{ base_url }}');
            log('加载当前文档...', 'info');
        }
        
        function updateStats(found, saved) {
            document.getElementById('foundCount').textContent = found;
            document.getElementById('savedCount').textContent = saved;
        }
        
        function addPageToList(pageId, title, saved) {
            const list = document.getElementById('pageList');
            const item = document.createElement('li');
            item.className = 'page-item' + (saved ? ' saved' : '');
            item.innerHTML = `
                <h4>${title || '未命名'}</h4>
                <p>ID: ${pageId}</p>
            `;
            item.onclick = () => {
                document.getElementById('docFrame').src = '/proxy?url=' + encodeURIComponent('https://www.showdoc.cc/529600549483974?page_id=' + pageId);
                log('加载页面：' + pageId, 'info');
            };
            list.appendChild(item);
        }
        
        // 页面加载时获取一次页面列表
        window.onload = () => {
            log('页面已就绪', 'success');
        };
    </script>
</body>
</html>
''', base_url=BASE_URL)


@app.route('/proxy')
def proxy():
    """代理访问 ShowDoc"""
    url = request.args.get('url', BASE_URL)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        return response.text
    except Exception as e:
        return f'<h1>Error</h1><p>{str(e)}</p>'


@app.route('/crawl', methods=['POST'])
def crawl():
    """爬取所有文档页面"""
    global discovered_pages, saved_pages
    
    # 从当前页面提取所有 page_id
    try:
        response = requests.get(BASE_URL, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        # 提取所有 page_id
        page_ids = re.findall(r'page_id=(\d+)', response.text)
        discovered_pages = set(page_ids)
        
        saved_count = 0
        for page_id in discovered_pages:
            if page_id in saved_pages:
                continue
            
            url = f"https://www.showdoc.cc/529600549483974?page_id={page_id}"
            
            try:
                resp = requests.get(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                
                soup = BeautifulSoup(resp.text, 'html.parser')
                title_tag = soup.find(['h1', 'title'])
                title = title_tag.get_text(strip=True) if title_tag else f'Doc_{page_id}'
                
                # 保存为 Markdown
                filename = f"page_{page_id}.md"
                filepath = os.path.join(OUTPUT_DIR, filename)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"# {title}\n\n")
                    f.write(f"> 来源：ShowDoc\n")
                    f.write(f"> URL: {url}\n")
                    f.write(f"> 保存时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                    f.write("---\n\n")
                    
                    # 提取内容
                    main = soup.find('body')
                    if main:
                        for tag in main.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'pre', 'code']):
                            text = tag.get_text(strip=True)
                            if text:
                                tag_name = tag.name
                                if tag_name in ['h1', 'h2', 'h3', 'h4']:
                                    prefix = '#' * int(tag_name[1])
                                    f.write(f"{prefix} {text}\n\n")
                                elif tag_name == 'p':
                                    f.write(f"{text}\n\n")
                                elif tag_name in ['pre', 'code']:
                                    f.write(f"```\n{text}\n```\n\n")
                
                saved_count += 1
                saved_pages.add(page_id)
                
            except Exception as e:
                print(f"保存页面 {page_id} 失败：{e}")
        
        # 生成索引
        index_data = {
            'crawl_time': datetime.now().isoformat(),
            'total_pages': len(discovered_pages),
            'pages': [{'page_id': pid, 'saved': pid in saved_pages} 
                     for pid in sorted(discovered_pages)]
        }
        
        with open(os.path.join(OUTPUT_DIR, 'index.json'), 'w', encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'success': True,
            'found': len(discovered_pages),
            'saved': saved_count
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print("=" * 60)
    print("ShowDoc 文档下载器已启动")
    print("访问地址：http://localhost:5002")
    print("输出目录:", os.path.abspath(OUTPUT_DIR))
    print("=" * 60)
    app.run(host='0.0.0.0', port=5002, debug=False)
