"""ShowDoc 文档批量保存助手 - 配合浏览器使用"""
import json
import os
from datetime import datetime
from bs4 import BeautifulSoup

class ShowDocSaver:
    def __init__(self, output_dir='docs/showdoc_batch'):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def save_from_clipboard(self):
        """从剪贴板复制的 HTML 内容保存"""
        try:
            import pyperclip
            html_content = pyperclip.paste()
            
            if not html_content or len(html_content) < 100:
                print("⚠️ 剪贴板内容为空或过短")
                return False
            
            print("📋 检测到剪贴板有 HTML 内容")
            return self.save_html_content(html_content)
            
        except Exception as e:
            print(f"❌ 读取剪贴板失败：{e}")
            print("\n💡 使用方法:")
            print("1. 在浏览器中打开文档页面")
            print("2. 按 Ctrl+A 全选页面内容")
            print("3. 按 Ctrl+C 复制")
            print("4. 运行此脚本")
            return False
    
    def save_html_content(self, html_content):
        """解析并保存 HTML 内容"""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # 提取标题
        title_tag = soup.find(['h1', 'title'])
        title = title_tag.get_text(strip=True) if title_tag else '未命名文档'
        
        # 清理标题中的非法字符
        safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in ' _-']).strip()
        safe_title = safe_title[:50]  # 限制长度
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename_base = f"{timestamp}_{safe_title}"
        
        # 保存 Markdown 格式
        md_path = os.path.join(self.output_dir, f"{filename_base}.md")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"# {title}\n\n")
            f.write(f"> 来源：ShowDoc\n")
            f.write(f"> 保存时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            # 提取正文内容
            main_content = soup.find('body')
            if main_content:
                for tag in main_content.find_all(['h1', 'h2', 'h3', 'h4', 'p', 'pre', 'code']):
                    text = tag.get_text(strip=True)
                    if text:
                        if tag.name in ['h1', 'h2', 'h3', 'h4']:
                            prefix = '#' * int(tag.name[1])
                            f.write(f"{prefix} {text}\n\n")
                        elif tag.name == 'p':
                            f.write(f"{text}\n\n")
                        elif tag.name in ['pre', 'code']:
                            f.write(f"```\n{text}\n```\n\n")
        
        # 保存完整 HTML
        html_path = os.path.join(self.output_dir, f"{filename_base}.html")
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(str(main_content) if main_content else html_content)
        
        # 保存纯文本
        txt_path = os.path.join(self.output_dir, f"{filename_base}.txt")
        with open(txt_path, 'w', encoding='utf-8') as f:
            if main_content:
                f.write(main_content.get_text(separator='\n', strip=True))
        
        print(f"\n✅ 文档已保存:")
        print(f"   标题：{title}")
        print(f"   📄 MD: {md_path}")
        print(f"   🌐 HTML: {html_path}")
        print(f"   📝 TXT: {txt_path}")
        
        return True
    
    def save_from_json(self, json_data):
        """从 JSON 数据保存"""
        if isinstance(json_data, str):
            content = json.loads(json_data)
        else:
            content = json_data
        
        title = content.get('title', '未命名文档')
        sections = content.get('sections', [])
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c in ' _-']).strip()[:50]
        filename_base = f"{timestamp}_{safe_title}"
        
        # 保存 Markdown
        md_path = os.path.join(self.output_dir, f"{filename_base}.md")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"# {title}\n\n")
            f.write(f"> 来源：ShowDoc (JSON)\n")
            f.write(f"> 保存时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write("---\n\n")
            
            for section in sections:
                tag = section.get('tag', 'p')
                text = section.get('content', '')
                
                if tag in ['h1', 'h2', 'h3', 'h4']:
                    prefix = '#' * int(tag[1])
                    f.write(f"{prefix} {text}\n\n")
                elif tag == 'p':
                    f.write(f"{text}\n\n")
                elif tag in ['pre', 'code']:
                    f.write(f"```\n{text}\n```\n\n")
        
        print(f"✅ 从 JSON 保存：{md_path}")
        return md_path


def interactive_mode():
    """交互模式"""
    saver = ShowDocSaver()
    
    print("=" * 60)
    print("ShowDoc 文档批量保存助手")
    print("=" * 60)
    print("\n使用说明:")
    print("1. 在浏览器中打开文档页面（使用预览功能）")
    print("2. 对每个想要保存的页面:")
    print("   - 按 Ctrl+A 全选")
    print("   - 按 Ctrl+C 复制")
    print("   - 在这里按 Enter 键保存")
    print("3. 输入 'q' 退出\n")
    
    while True:
        cmd = input("\n请按 Enter 键保存当前页面 (或输入 q 退出): ").strip()
        
        if cmd.lower() == 'q':
            print("\n👋 再见!")
            break
        
        if cmd == '':
            if saver.save_from_clipboard():
                print("✓ 保存成功！继续下一个页面...")
            else:
                print("✗ 保存失败，请重试")
        else:
            print("⚠️ 请直接按 Enter 键")


if __name__ == '__main__':
    # 如果有命令行参数，尝试直接处理
    import sys
    
    if len(sys.argv) > 1:
        # 从文件读取 HTML
        input_file = sys.argv[1]
        if os.path.exists(input_file):
            with open(input_file, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            saver = ShowDocSaver()
            saver.save_html_content(html_content)
    else:
        # 交互模式
        interactive_mode()
