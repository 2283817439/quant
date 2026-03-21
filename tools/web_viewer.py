"""简单的网页代理查看器"""
from flask import Flask, render_template_string, request, jsonify
import requests

app = Flask(__name__)

@app.route('/')
def index():
    return render_template_string('''
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>文档查看器</title>
    <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
        .container { width: 100%; height: 100vh; display: flex; flex-direction: column; }
        .header { 
            background: #2c3e50; 
            color: white; 
            padding: 10px 20px; 
            display: flex; 
            align-items: center;
            gap: 10px;
        }
        input[type="text"] {
            flex: 1;
            padding: 8px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
        }
        button {
            padding: 8px 16px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover { background: #2980b9; }
        iframe { 
            flex: 1; 
            border: none; 
            width: 100%;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <label>URL:</label>
            <input type="text" id="urlInput" value="https://www.showdoc.cc/529600549483974?page_id=3269126718101134">
            <button onclick="loadUrl()">加载</button>
        </div>
        <iframe id="contentFrame" src="about:blank"></iframe>
    </div>
    
    <script>
        function loadUrl() {
            const url = document.getElementById('urlInput').value;
            document.getElementById('contentFrame').src = url;
        }
        
        // 页面加载时自动加载默认 URL
        window.onload = loadUrl;
    </script>
</body>
</html>
''')

if __name__ == '__main__':
    print("=" * 60)
    print("文档查看器已启动")
    print("访问地址：http://localhost:5001")
    print("按 Ctrl+C 停止服务")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5001, debug=False)
