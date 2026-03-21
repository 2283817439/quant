"""ShowDoc 整站文档下载器 - 遍历所有页面并保存"""
import requests
from bs4 import BeautifulSoup
import json
import os
import re
import time
from urllib.parse import urljoin, urlparse
from datetime import datetime

class ShowDocCrawler:
    def __init__(self, base_url, output_dir='docs/showdoc_full'):
        self.base_url = base_url
        self.output_dir = output_dir
        self.visited_urls = set()
        self.all_pages = []
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        })
        
    def extract_page_links(self, html):
        """从 HTML 中提取所有可能的文档链接"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        # 查找侧边栏导航链接
        for tag in soup.find_all('a', href=True):
            href = tag['href']
            text = tag.get_text(strip=True)
            
            # 过滤出 showdoc.cc 的文档链接
            if 'showdoc.cc' in href and ('page_id=' in href or '/THSPythonSE/' in href or '/529600549483974' in href):
                full_url = urljoin(self.base_url, href)
                if full_url not in self.visited_urls:
                    links.append(full_url)
            # 也检查相对路径
            elif href.startswith('/') and 'page_id=' in href:
                full_url = urljoin(self.base_url, href)
                if full_url not in self.visited_urls and 'showdoc.cc' in full_url:
                    links.append(full_url)
        
        # 尝试从页面内容中提取 page_id
        page_ids = re.findall(r'page_id=(\d+)', html)
        for page_id in page_ids:
            base = self.base_url.split('?')[0]
            new_url = f"{base}?page_id={page_id}"
            if new_url not in self.visited_urls:
                links.append(new_url)
        
        # 去重
        links = list(set(links))
        return links
    
    def fetch_page_content(self, url):
        """获取页面内容"""
        try:
            print(f"  📡 获取：{url}")
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"  ❌ 失败：{url} - {e}")
            return None
    
    def parse_page_content(self, html, url):
        """解析页面内容"""
        soup = BeautifulSoup(html, 'html.parser')
        
        content = {
            'url': url,
            'title': '',
            'content_html': '',
            'content_text': '',
            'sections': []
        }
        
        # 提取标题
        title_tag = soup.find(['h1', 'title'])
        if title_tag:
            content['title'] = title_tag.get_text(strip=True)
        
        # 提取主要内容区域（尝试不同的选择器）
        main_content = None
        for class_name in ['doc-content', 'article-content', 'markdown-body', 'content']:
            main_content = soup.find(class_=class_name)
            if main_content:
                break
        
        if not main_content:
            main_content = soup.find('body')
        
        if main_content:
            content['content_html'] = str(main_content)
            
            # 提取结构化内容
            for tag in main_content.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'pre', 'code', 'table']):
                text = tag.get_text(strip=True)
                if text:
                    content['sections'].append({
                        'tag': tag.name,
                        'content': text
                    })
            
            content['content_text'] = main_content.get_text(separator='\n', strip=True)
        
        return content
    
    def save_page(self, content):
        """保存单个页面"""
        os.makedirs(self.output_dir, exist_ok=True)
        
        # 从 URL 生成安全的文件名
        url_path = urlparse(content['url']).path
        page_id_match = re.search(r'page_id=(\d+)', content['url'])
        
        if page_id_match:
            filename_base = f"page_{page_id_match.group(1)}"
        else:
            filename_base = f"doc_{abs(hash(content['url'])) % 100000}"
        
        # 保存为 Markdown
        md_path = os.path.join(self.output_dir, f"{filename_base}.md")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"# {content['title']}\n\n")
            f.write(f"> 来源：ShowDoc\n")
            f.write(f"> URL: {content['url']}\n")
            f.write(f"> 保存时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            for section in content['sections']:
                if section['tag'] in ['h1', 'h2', 'h3', 'h4']:
                    prefix = '#' * int(section['tag'][1])
                    f.write(f"{prefix} {section['content']}\n\n")
                elif section['tag'] == 'p':
                    f.write(f"{section['content']}\n\n")
                elif section['tag'] in ['pre', 'code']:
                    f.write(f"```\n{section['content']}\n```\n\n")
                elif section['tag'] == 'table':
                    f.write(f"{section['content']}\n\n")
        
        # 保存完整 HTML
        html_path = os.path.join(self.output_dir, f"{filename_base}.html")
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(content['content_html'])
        
        # 保存 JSON 数据
        json_path = os.path.join(self.output_dir, f"{filename_base}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(content, f, ensure_ascii=False, indent=2)
        
        return md_path, html_path, json_path
    
    def crawl(self, max_pages=100, delay=0.5):
        """开始爬取"""
        print("=" * 60)
        print("ShowDoc 整站文档下载器")
        print("=" * 60)
        print(f"\n起始 URL: {self.base_url}")
        print(f"输出目录：{self.output_dir}")
        print(f"最大页数：{max_pages}")
        print(f"延迟设置：{delay}s\n")
        
        # 待爬取的 URL 队列
        urls_to_crawl = [self.base_url]
        pages_saved = 0
        
        while urls_to_crawl and pages_saved < max_pages:
            current_url = urls_to_crawl.pop(0)
            
            if current_url in self.visited_urls:
                continue
            
            self.visited_urls.add(current_url)
            
            # 获取页面
            html = self.fetch_page_content(current_url)
            if not html:
                continue
            
            # 解析页面
            content = self.parse_page_content(html, current_url)
            if not content['content_text']:
                print(f"  ⚠️ 页面内容为空：{current_url}")
                continue
            
            # 保存页面
            print(f"  💾 保存：{content['title']}")
            md_path, html_path, json_path = self.save_page(content)
            pages_saved += 1
            print(f"     ✓ MD: {os.path.basename(md_path)}")
            
            # 提取新链接
            new_links = self.extract_page_links(html)
            for link in new_links:
                if link not in self.visited_urls and link not in urls_to_crawl:
                    urls_to_crawl.append(link)
            
            print(f"     → 发现 {len(new_links)} 个新链接，待爬取：{len(urls_to_crawl)} 页\n")
            
            # 礼貌延迟
            time.sleep(delay)
        
        # 生成索引文件
        self.generate_index()
        
        print("\n" + "=" * 60)
        print(f"✅ 爬取完成!")
        print(f"   访问页面数：{len(self.visited_urls)}")
        print(f"   保存文档数：{pages_saved}")
        print(f"   输出目录：{os.path.abspath(self.output_dir)}")
        print("=" * 60)
    
    def generate_index(self):
        """生成索引文件"""
        index_data = {
            'crawl_time': datetime.now().isoformat(),
            'base_url': self.base_url,
            'total_pages': len(self.visited_urls),
            'urls': list(self.visited_urls)
        }
        
        index_path = os.path.join(self.output_dir, 'crawl_index.json')
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)
        
        # 生成可读的索引列表
        list_path = os.path.join(self.output_dir, '文档索引清单.txt')
        with open(list_path, 'w', encoding='utf-8') as f:
            f.write(f"ShowDoc 文档爬取清单\n")
            f.write(f"=" * 60 + "\n")
            f.write(f"爬取时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"起始地址：{self.base_url}\n")
            f.write(f"总页面数：{len(self.visited_urls)}\n")
            f.write(f"=" * 60 + "\n\n")
            
            for i, url in enumerate(sorted(self.visited_urls), 1):
                f.write(f"{i}. {url}\n")


def main():
    base_url = "https://www.showdoc.cc/529600549483974?page_id=3269126718101134"
    
    crawler = ShowDocCrawler(
        base_url=base_url,
        output_dir='docs/showdoc_full'
    )
    
    # 开始爬取（最多 100 页，每页间隔 0.5 秒）
    crawler.crawl(max_pages=100, delay=0.5)


if __name__ == '__main__':
    main()
