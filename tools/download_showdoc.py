"""下载并保存 ShowDoc 文档内容"""
import requests
from bs4 import BeautifulSoup
import json
import re

def fetch_doc_content(url):
    """尝试获取文档内容"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"❌ 获取网页失败：{e}")
        return None

def parse_showdoc_content(html):
    """解析 ShowDoc 页面内容"""
    soup = BeautifulSoup(html, 'html.parser')
    
    # 尝试提取主要内容
    content = {
        'title': '',
        'sections': [],
        'full_text': ''
    }
    
    # 提取标题
    title_tag = soup.find('h1') or soup.find('title')
    if title_tag:
        content['title'] = title_tag.get_text(strip=True)
    
    # 提取所有段落和标题
    for tag in soup.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'pre', 'code']):
        text = tag.get_text(strip=True)
        if text:
            content['sections'].append({
                'tag': tag.name,
                'content': text
            })
    
    # 提取完整文本
    body = soup.find('body')
    if body:
        content['full_text'] = body.get_text(separator='\n', strip=True)
    
    return content

def save_document(content, output_dir='docs/showdoc'):
    """保存文档到本地"""
    import os
    from datetime import datetime
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # 保存为 Markdown 格式
    md_file = os.path.join(output_dir, f'doc_{timestamp}.md')
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write(f"# {content['title']}\n\n")
        f.write(f"> 来源：ShowDoc\n")
        f.write(f"> 保存时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("---\n\n")
        
        for section in content['sections']:
            if section['tag'] == 'h1':
                f.write(f"# {section['content']}\n\n")
            elif section['tag'] == 'h2':
                f.write(f"## {section['content']}\n\n")
            elif section['tag'] == 'h3':
                f.write(f"### {section['content']}\n\n")
            elif section['tag'] == 'p':
                f.write(f"{section['content']}\n\n")
            elif section['tag'] in ['pre', 'code']:
                f.write(f"```\n{section['content']}\n```\n\n")
    
    # 保存为 JSON 格式（包含原始数据）
    json_file = os.path.join(output_dir, f'doc_{timestamp}.json')
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(content, f, ensure_ascii=False, indent=2)
    
    # 保存纯文本格式
    txt_file = os.path.join(output_dir, f'doc_{timestamp}.txt')
    with open(txt_file, 'w', encoding='utf-8') as f:
        f.write(content['full_text'])
    
    return md_file, json_file, txt_file

def main():
    url = "https://www.showdoc.cc/529600549483974?page_id=3269126718101134"
    
    print("=" * 60)
    print("ShowDoc 文档下载器")
    print("=" * 60)
    print(f"\n目标 URL: {url}\n")
    
    # 获取内容
    print("📡 正在获取文档内容...")
    html = fetch_doc_content(url)
    
    if not html:
        print("\n❌ 无法直接获取网页内容，可能原因:")
        print("   1. 需要登录验证")
        print("   2. 有反爬虫机制")
        print("   3. 网络访问受限")
        print("\n💡 建议:")
        print("   - 在浏览器中手动打开预览链接查看")
        print("   - 手动复制粘贴内容后使用本工具格式化保存")
        return
    
    # 解析内容
    print("🔍 正在解析文档结构...")
    content = parse_showdoc_content(html)
    
    if not content['full_text']:
        print("⚠️ 未提取到有效内容")
        return
    
    print(f"✓ 找到标题：{content['title']}")
    print(f"✓ 提取到 {len(content['sections'])} 个内容块")
    
    # 保存文档
    print("\n💾 正在保存文档...")
    md_file, json_file, txt_file = save_document(content)
    
    print("\n✅ 文档已保存:")
    print(f"   📄 Markdown: {md_file}")
    print(f"   📊 JSON: {json_file}")
    print(f"   📝 TXT: {txt_file}")
    print("\n" + "=" * 60)

if __name__ == '__main__':
    main()
