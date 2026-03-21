/**
 * 浏览器代理服务
 * GET /browser-proxy?url=https://...
 * 透明代理目标页面，去除 X-Frame-Options / CSP 响应头，
 * 重写 HTML 内的绝对/相对资源链接，使其继续经过代理。
 */
import type { Request, Response } from "express";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const PROXY_PATH = "/browser-proxy";

/** 构造代理 URL */
function proxyUrl(target: string, base: string): string {
  try {
    const abs = new URL(target, base).toString();
    return `${PROXY_PATH}?url=${encodeURIComponent(abs)}`;
  } catch {
    return target;
  }
}

/** 判断是否需要重写（只处理 http/https） */
function shouldRewrite(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("/") || href.startsWith("./") || href.startsWith("../");
}

/**
 * 简单的正则重写 HTML 中的资源链接
 * 覆盖：href="", src="", action="", url() in style
 */
function rewriteHtml(html: string, baseUrl: string): string {
  // href / src / action 属性
  html = html.replace(
    /((?:href|src|action)\s*=\s*["'])([^"']+)(["'])/gi,
    (_, prefix, href, suffix) => {
      if (href.startsWith("javascript:") || href.startsWith("#") || href.startsWith("data:")) {
        return prefix + href + suffix;
      }
      if (shouldRewrite(href)) {
        return prefix + proxyUrl(href, baseUrl) + suffix;
      }
      return prefix + href + suffix;
    },
  );

  // <form> action
  // already covered above

  // CSS url()
  html = html.replace(
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    (_, u) => {
      if (u.startsWith("data:") || u.startsWith("#")) return `url(${u})`;
      if (shouldRewrite(u)) return `url(${proxyUrl(u, baseUrl)})`;
      return `url(${u})`;
    },
  );

  // 注入一段 JS，拦截页面内的 fetch / XHR / window.open / location 跳转
  const inject = `
<script>
(function(){
  var PROXY = ${JSON.stringify(PROXY_PATH)};
  function wrap(u){
    if(!u||u.startsWith('javascript:')||u.startsWith('#')||u.startsWith('data:')) return u;
    try{
      var abs = new URL(u, location.href).toString();
      if(abs.startsWith('http')) return PROXY+'?url='+encodeURIComponent(abs);
    }catch(e){}
    return u;
  }
  // intercept fetch
  var _fetch = window.fetch;
  window.fetch = function(input, init){
    if(typeof input === 'string') input = wrap(input);
    return _fetch.call(this, input, init);
  };
  // intercept XHR
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, url){
    arguments[1] = wrap(url);
    return _open.apply(this, arguments);
  };
  // intercept link clicks
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest('a');
    if(a && a.href && !a.href.startsWith('javascript:')){
      e.preventDefault();
      var proxied = wrap(a.href);
      window.parent.postMessage({type:'browser-proxy-navigate', url: a.href, proxied: proxied}, '*');
      location.href = proxied;
    }
  }, true);
})();
</script>`;

  // 插在 <head> 或 <body> 之前
  if (/<head[\s>]/i.test(html)) {
    html = html.replace(/(<head[\s>][^>]*>)/i, `$1${inject}`);
  } else {
    html = inject + html;
  }

  return html;
}

/** Express 中间件 */
export function browserProxyHandler(req: Request, res: Response): void {
  const rawUrl = req.query.url as string | undefined;
  if (!rawUrl) {
    res.status(400).send("Missing ?url= parameter");
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    res.status(400).send("Invalid URL");
    return;
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    res.status(400).send("Only http/https supported");
    return;
  }

  const mod = targetUrl.protocol === "https:" ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": req.headers["accept"] || "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "identity", // 不要 gzip，方便直接处理文本
      "Referer": targetUrl.origin,
    },
    timeout: 15000,
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    // 去掉阻止嵌入的响应头
    const headers = { ...proxyRes.headers };
    delete headers["x-frame-options"];
    delete headers["content-security-policy"];
    delete headers["content-security-policy-report-only"];
    delete headers["x-content-type-options"];
    // 去掉 content-encoding（我们用 identity）
    delete headers["content-encoding"];

    const contentType = (headers["content-type"] as string) || "";
    const isHtml = contentType.includes("text/html");

    // 处理重定向
    if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      const redirectUrl = new URL(proxyRes.headers.location, targetUrl.toString()).toString();
      res.redirect(`${PROXY_PATH}?url=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    if (isHtml) {
      // 收集完整 HTML 再重写
      const chunks: Buffer[] = [];
      proxyRes.on("data", (c: Buffer) => chunks.push(c));
      proxyRes.on("end", () => {
        let html = Buffer.concat(chunks).toString("utf-8");
        html = rewriteHtml(html, targetUrl.toString());
        headers["content-length"] = Buffer.byteLength(html, "utf-8").toString();
        headers["content-type"] = "text/html; charset=utf-8";
        res.writeHead(proxyRes.statusCode ?? 200, headers);
        res.end(html);
      });
    } else {
      // 二进制/CSS/JS 直接透传
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.status(502).send(`Proxy error: ${err.message}`);
    }
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).send("Proxy timeout");
  });

  proxyReq.end();
}
