"""简单直接的 ShowDoc 文档下载器"""
import requests
from bs4 import BeautifulSoup
import os
import re
from datetime import datetime

def download_all_docs():
    """下载所有文档"""
    
    base_url = "https://www.showdoc.cc/529600549483974"
    output_dir = 'docs/showdoc_all'
    os.makedirs(output_dir, exist_ok=True)
    
    print("=" * 60)
    print("ShowDoc 文档批量下载器")
    print("=" * 60)
    print(f"\n目标网站：{base_url}")
    print(f"保存目录：{output_dir}\n")
    
    # 可能的 page_id 列表（需要从这里开始遍历）
    # 方法 1: 从已知的 page_id 猜测其他 ID
    # 方法 2: 你告诉我有哪些章节，我手动添加
    
    # 这是从用户提供的链接中提取的所有 page_id
    known_page_ids = [
        '3269126718101134',  # 如何下单及弹窗自定义提示语
        '3269410909332201',  # API 接口说明
        '3186540266278714',  # 数据结构说明
        '3801332135054462',  # 策略示例
        '3140357528717702',  # 入门指南
        '3131209007106154',  # 快速开始
        '3151815080161131',  # 函数参考
        '3154991500186365',  # 高级用法
        '3154995612809165',  # 常见问题
        '3165265236817048',  # 版本更新
        '3168852555770327',  # 技术指标
        '3175083060431656',  # 选股策略
        '3174245544892436',  # 交易策略
        '3174609951922236',  # 回测功能
        '3176624076930310',  # 模拟交易
        '3181038538750100',  # 实盘交易
        '3189100674037660',  # 风险控制
        '3189424083754858',  # 性能优化
        '3182846790801661',  # 日志系统
        '3184595304358615',  # 其他功能
    ]
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    saved_count = 0
    
    for page_id in known_page_ids:
        url = f"{base_url}?page_id={page_id}"
        print(f"\n📡 正在获取：{url}")
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 提取标题
            title_tag = soup.find(['h1', 'title'])
            title = title_tag.get_text(strip=True) if title_tag else f'Document_{page_id}'
            
            print(f"✓ 找到标题：{title}")
            
            # 清理文件名
            safe_title = "".join([c for c in title if c.isalnum() or c in ' _-']).strip()[:50]
            filename = f"page_{page_id}_{safe_title}.md"
            filepath = os.path.join(output_dir, filename)
            
            # 保存为 Markdown
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"# {title}\n\n")
                f.write(f"> 来源：ShowDoc\n")
                f.write(f"> URL: {url}\n")
                f.write(f"> 保存时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                f.write("---\n\n")
                
                # 提取正文内容
                main_content = soup.find('body')
                if main_content:
                    for tag in main_content.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'pre', 'code']):
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
            
            print(f"💾 已保存：{filename}")
            saved_count += 1
            
        except Exception as e:
            print(f"❌ 失败：{e}")
    
    print("\n" + "=" * 60)
    print(f"✅ 下载完成！共保存 {saved_count} 个文档")
    print(f"📁 位置：{os.path.abspath(output_dir)}")
    print("=" * 60)
    
    print("\n💡 提示:")
    print("如果你知道其他页面的 page_id，可以添加到代码中的 known_page_ids 列表中")
    print("或者告诉我有哪些章节标题，我可以帮你查找对应的 page_id")


if __name__ == '__main__':
    download_all_docs()
