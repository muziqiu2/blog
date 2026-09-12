# EdgeOne 缓存规则配置方案 · blog.20020831.xyz

> 适用：Hexo 静态博客 + GitHub Pages 源站 + 腾讯云 EdgeOne（EO）加速
> 实测时间：2026-09-11
> 控制台路径：**站点详情 → 站点加速 → 缓存配置（站点级兜底）/ 规则引擎（细粒度规则）**
>
> 📌 **可直接导入的 JSON**：[`edgeone-config/rules.json`](./edgeone-config/rules.json)
> （配置语法格式 `FormatVersion` + `Rules`，与 125341 示例逐字段一致，非 API 请求体）
> 📌 **语法速查 / 顺序说明 / 验收命令**：[`edgeone-config/README.md`](edgeone-config/README.md)
> 📌 **镜像站 `cdn-jsdelivr.mofashi.ltd` 的配置（纯步骤，无 JSON）**：[`mirror-edgeone-config.md`](./mirror-edgeone-config.md)

---

## 一、先看实测：你的源站到底给了什么缓存头

绕过 Cloudflare 直连 GitHub Pages 源站（`185.199.108.153`，`Host/SNI = blog.20020831.xyz`）实测：

```bash
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
curl -ksS --resolve "blog.20020831.xyz:443:185.199.108.153" -D - -o /dev/null \
  -H 'Accept-Encoding:' "https://blog.20020831.xyz/"
```

| 路径 | 状态 | 源站 Cache-Control | ETag |
|---|---|---|---|
| `/` | 200 | `max-age=600` | `"6aa40553-b394"` |
| `/archives/` | 200 | `max-age=600` | `"6aa40553-831b"` |
| `/css/index.css?v=4.0.0` | 200 | `max-age=600` | `"6aa40553-3b615"` |
| `/js/main.js?v=4.0.0` | 200 | `max-age=600` | `"6aa40553-d3c0"` |
| `/vendor/pace/pace.min.js` | 200 | `max-age=600` | `"6aa40553-32a2"` |
| `/img/site-avatar.jpg` | 200 | `max-age=600` | `"6aa40553-d8d1"` |
| `/search.xml` | 200 | `max-age=600` | `"6aa40553-9c2a"` |
| `/links.json` | 200 | `max-age=600` | `"6aa40553-24c"` |
| `/not-exist-xyz/` | 404 | **无** | `"6aa40553-6699"` |
| `/CNAME` | 200 | `max-age=600` | `"6aa40553-12"` |

**两条关键结论：**

1. **源站对 HTML、JS、CSS、图片一视同仁，全给 10 分钟**。所以「节点缓存 TTL 遵循源站」= 所有资源都是 10 分钟，静态资源完全没吃到加速红利 —— **必须用规则显式分层**。
2. ETag 前缀 `6aa40553` 是**部署版本标识**（同一次构建的所有文件共用一个前缀），每次 `git push` 后整站 ETag 全变。⇒ 条件请求（304）能正确识别新版本，回源验证是廉价且可靠的。

> ⚠️ 顺带说明：你现在看到线上是 `max-age=14400`，那是 **Cloudflare 层改写**的结果，不是源站给的。迁移到 EO 后不要再依赖「遵循源站」。

---

## 二、接入与回源（这一步配错，后面全白搭）

### 2.1 回源配置

| 项 | 值 | 说明 |
|---|---|---|
| 源站类型 | 域名 | |
| 源站地址 | `muziqiu2.github.io` | 也可用 GitHub Pages 官方 4 个 IP 做主备：`185.199.108.153`/`109.153`/`110.153`/`111.153` |
| **回源 HOST** | **自定义 → `blog.20020831.xyz`** | 🔴 必须。GitHub Pages 靠 Host 头路由到你的仓库；给对了才直接返回站点内容 |
| 回源协议 | **HTTPS**，端口 443 | GitHub Pages 会强制 HTTPS，用 http 回源会吃 301 |
| 回源跟随重定向 | **关闭** | 防止被 GitHub 的域名跳转带跑 |

> 🔴 **回源地址绝对不能填 `blog.20020831.xyz`** —— 切到 EO 后这个域名解析到 EO 自己，会形成**回源自环**。

已实测可行（上面那条 `curl --resolve` 命令就是等价验证）：Host = `blog.20020831.xyz` 直连 GitHub Pages IP → `200 OK`，**没有 301 重定向**。

### 2.2 DNS 切换

1. EO 添加站点 `20020831.xyz` → 完成域名归属验证 → 添加加速域名 `blog.20020831.xyz`
2. 把 `blog` 的 CNAME 改指向 EO 下发的地域 CNAME（形如 `xxx.eo.dns...`）
3. 🔴 **Cloudflare 侧把该记录的代理开关（小云朵）关掉**，改 DNS only，否则变成 Cloudflare → EdgeOne → GitHub 三层套娃
4. `source/CNAME` 文件内容保持 `blog.20020831.xyz` 不变（GitHub 侧要靠它认自定义域名）

> 备案：走中国大陆加速需域名完成 ICP 备案，你已有（鲁ICP备2022005744号-3），可以直接开。

---

## 三、缓存键（Cache Key）：这一页只需要动一处

**站点加速 → 缓存配置 → 自定义 Cache Key：**

**目标只有一个：查询字符串必须参与缓存键。** 不同控制台版本的选项名不一样，认准这个目标：

| 界面上的名称 | 该选什么 |
|---|---|
| 「忽略查询字符串」/ Ignore Query String | **关闭** |
| 「全路径缓存」/ FullURLCache | **开启**（官方文档明确：开启全路径缓存 = 关闭参数忽略，两者是同一件事的正反说法） |

🔴 **为什么这条最重要**：你的 JS/CSS 就靠 `?v=4.0.0` 这一个版本号来失效。一旦让参数不参与缓存键，
主题升级后浏览器和节点仍会命中旧缓存 → 又是"改了配置线上没反应、样式错乱"那套。

其余几项：

| 配置项 | 值 | 为什么 |
|---|---|---|
| 忽略大小写 | 关闭（保持默认） | 站点全小写路径，开了收益极小，关闭更安全 |
| Cookie / HTTP 请求头参与缓存键 | 关闭 | 博客没有按 Cookie 分发的内容，参与只会降低命中率 |

**站点加速 → 缓存配置 → Vary 特性：保持「关闭」**（平台默认）。
静态站点不需要按 `Vary` 区分缓存；开启反而降低命中率。

---

## 四、规则引擎：5 条规则（粗在上、细在下）

> 🔴 **顺序方向容易搞反**。官方「规则引擎详解」原文：
> 「规则引擎内的多条规则，按相对顺序，从上至下执行」，
> 「如果同时匹配到多条规则，**下方规则的操作将覆盖上方的规则**」，
> 「将具有**通用性或粗粒度**的规则放在**上方**作为默认配置，针对特定请求或**细粒度**的规则放在**下方**」。
>
> 所以 **`/vendor/` 要放在最下面**（而不是最上面）。这和「缓存规则」简化入口的「首个匹配即停」是**反的**。

| 位置 | 规则名 | IF 条件 | 节点缓存 TTL | 浏览器缓存 TTL |
|---|---|---|---|---|
| 1（最粗，默认） | 默认-HTML与其余资源 | HOST ∈ `blog.20020831.xyz` | 自定义 **300**（5 分钟） | **不缓存** |
| 2 | 索引与数据 | 文件后缀 ∈ `xml,json` | 自定义 **300**（5 分钟） | **不缓存** |
| 3 | 图片与字体 | 文件后缀 ∈ `png,jpg,jpeg,gif,webp,avif,svg,ico,bmp,woff,woff2,ttf,otf,eot` | 自定义 **2592000**（30 天） | 自定义 **604800**（7 天） |
| 4 | 站点样式与脚本 | 文件后缀 ∈ `css,js,mjs` | 自定义 **86400**（1 天） | 自定义 **3600**（1 小时） |
| 5（最细，覆盖上面） | 自托管第三方库 | URL Path 正则 `^/vendor/` | 自定义 **604800**（7 天） | 自定义 **86400**（1 天） |

验算 `/vendor/pace/pace.min.js`：命中第 4、5 条 → **第 5 条在下，7 天生效** ✅
验算首页 `/`：只命中第 1 条 → 300 秒 ✅

匹配类型说明：
- 「文件后缀」：多个值用英文逗号分隔，以控制台实际提示为准
- 「URL Path」选**前缀匹配**；若只给正则，用 `^/vendor/`（EO 支持 Google RE2 语法）

> 📌 **可直接导入的 JSON**：只需规则引擎那部分就用 [`edgeone-config/rules.json`](./edgeone-config/rules.json)
> （顶层只有 `FormatVersion` + `Rules`，与 125341 示例逐字段一致）。

### 为什么这么定

- **HTML 必须最短**：Hexo 每次部署都在**同一个 URL** 上换内容。5 分钟节点缓存 + 浏览器不缓存（靠 ETag 打 304）是「几乎立刻可见 + 仍能扛量」的平衡点。想让新文章秒出，把兜底改成 60 秒。
- **`/css/` `/js/` 只给 1 天**：这些文件**文件名带版本号 `?v=4.0.0`，但版本号只随主题版本变**。你改 `_config.solitude.yml`（比如换主题色）时 URL 不变 —— 给太长的 TTL 就会看到旧样式。1 天 + 改完配置手动刷一次缓存最稳。
- **`/vendor/` 只给 7 天**：🔴 自托管库的 URL **完全没有版本号**（`CDN.options` 里的路径是原样输出的，实测产物就是 `/vendor/pace/pace.min.js`）。换库版本时 URL 不会变，TTL 给长了必然踩缓存。
  - 建议顺手改成带版本号，改完就能放心给 30 天（**版本号请按你实际下载的那份文件填**，
    例如 `fancybox.umd.min.js` 与主题默认引用的 `fancybox.umd.js` 并不是同一个文件，别照抄）：
    ```yaml
    options:
      pace_js: /vendor/pace/pace.min.js?v=<你下的 pace-js 版本>
      pjax: /vendor/pjax/pjax.min.js?v=<版本>
      lazyload: /vendor/lazyload/lazyload.iife.min.js?v=<版本>
      snackbar: /vendor/snackbar/snackbar.min.js?v=<版本>
      fancyapps_ui: /vendor/fancybox/fancybox.umd.min.js?v=<版本>
      fancyapps_css: /vendor/fancybox/fancybox.min.css?v=<版本>
      fontawesome: /vendor/fontawesome/css/all.min.css?v=<版本>
    ```
    （改完 `hexo generate`，确认产物里真的带上了 `?v=` 再推；否则 Hexo 侧不生效、缓存侧却按新 URL 算，反而更乱）
- **`/img/` 给 30 天但只给 7 天浏览器缓存**：封面/图标基本不变，但 `site-avatar.jpg` 这种"换图不换名"的文件一旦换了，7 天浏览器缓存是可接受的代价；30 天节点缓存可以随时用刷新兜。
- **`xml`/`json` 最短**：`search.xml` 是本地搜索索引、`links.json` 是友链数据，每次部署都可能变数，前端是 `fetch` 拿的，缓存久了搜索/友链会不一致。

---

## 五、站点级其他开关

| 功能 | 建议 | 理由 |
|---|---|---|
| **智能压缩** | **保持开启**（Gzip + Brotli） | 静态站点收益最大的一项。⚠️ 但见第六节第 1 条 |
| 状态码缓存 TTL | **保持默认**（404 缓存 10s，其它异常不缓存） | 别加大。临时性 404 被长期缓存会很难排查 |
| 离线缓存 | **保持开启** | GitHub Pages 偶发故障时仍能用过期缓存对外服务 |
| 缓存预刷新 | **开启，百分比 90** | GitHub Pages 的 ETag 每次部署都变，预刷新能在过期前回源验证并续期，用户侧不会撞上"过期 + 等回源"。个人站流量小，回源验证成本可忽略 |
| 智能加速 | **关闭** | 这是给动态请求用的按需加速，静态博客用不上，且会产生额外流量费用 |
| 图片处理 | 关闭 | 站点图片已本地化，用不上 |

---

## 六、五条"别踩"的红线

1. 🔴 **不要给任何资源设 `immutable`，也不要用 1 年 TTL。**
   这正是你自建镜像出事的根源：`Cache-Control: public, immutable, max-age=31536000` 意味着
   一旦某个资源在边缘被写成坏副本（例如压缩体被按压缩长度截断），**一年内不会自愈**，
   而 `immutable` 让浏览器连 revalidate 都不做。上面所有 TTL 都刻意避开了这两个坑。
2. 🔴 **不要开启「忽略查询字符串」**：`?v=4.0.0` 是主题唯一的失效手段。
3. 🔴 **回源地址不要填自己的域名**（自环），回源 HOST 必须给 `blog.20020831.xyz`。
4. ⚠️ **规则顺序**：`/vendor/` 规则要在 JS/CSS 后缀规则**之前**。
5. ⚠️ **改了站点配置/主题版本后，主动刷一次缓存**（控制台「缓存配置 → 清除缓存」刷 `/` 或按 URL 刷）。
   别指望 TTL 到点自动生效 —— 那要等 1 天。

---

## 七、验收清单

切完 DNS、配好规则后，逐条验证：

```bash
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
B=https://blog.20020831.xyz

# 1) 确认已经走 EO（应出现 eo-cache-status / eo-log-uuid，且不再有 cf-cache-status）
curl -sD - -o /dev/null "$B/css/index.css?v=4.0.0" | grep -iE 'eo-cache-status|cache-control|content-encoding'

# 2) 连续两次请求，第二次应为 HIT
curl -sD - -o /dev/null "$B/img/site-avatar.jpg" | grep -i eo-cache-status
curl -sD - -o /dev/null "$B/img/site-avatar.jpg" | grep -i eo-cache-status

# 3) 分层是否生效：四类资源各看一次 Cache-Control，应当明显不同
for p in "/" "/css/index.css?v=4.0.0" "/vendor/pace/pace.min.js" "/img/site-avatar.jpg" "/search.xml"; do
  printf "%-30s " "$p"
  curl -sD - -o /dev/null -H 'Accept-Encoding:' "$B$p" | grep -i '^cache-control' | tr -d '\r'
done

# 4) 压缩与完整性：确认 br/gzip 响应解压后与源站一致（防"又一次截断"）
#    两边都用 --compressed：curl 会自动协商压缩并解压，落盘的都是明文，可以直接 cmp
curl -s --compressed -o /tmp/a.bin "$B/js/main.js?v=4.0.0"
curl -ksS --compressed --resolve "blog.20020831.xyz:443:185.199.108.153" \
     -o /tmp/b.bin "https://blog.20020831.xyz/js/main.js?v=4.0.0"
cmp /tmp/a.bin /tmp/b.bin && echo "✅ 一致" || echo "❌ 边缘返回内容与源站不符"
```

第 4 步也可以直接用仓库里的自检脚本（它就是为"缓存副本被截断"这类问题写的）：

```bash
# 把要检查的资源路径写进 urls.txt，每行一个
node tools/mirror-check.mjs --base https://blog.20020831.xyz --file urls.txt
```

期望的 `Cache-Control` 对照表：

| 路径 | 期望 |
|---|---|
| `/` | `max-age=300`（或 `no-cache`） |
| `/css/index.css?v=4.0.0` | `max-age=86400` |
| `/vendor/pace/pace.min.js` | `max-age=604800` |
| `/img/site-avatar.jpg` | `max-age=604800` |
| `/search.xml` | `no-cache` |

---

## 八、顺手可以一起规整的

既然 `20020831.xyz` 主域名要接进 EO，同域下这几个子域也可以统一纳管，别让它们各走各的：

- `cdn-jsdelivr.mofashi.ltd` —— 上次那个「缓存副本被截断」问题就发生在它的 EdgeOne 缓存里。
  纳管后建议：**回源固定 `accept-encoding: identity`、响应里删掉 `Content-Length`、`Cache-Control` 去掉 `immutable`**。
- `free-img.mofashi.ltd`（图床）、`zybfq.mofashi.ltd`（播放器）—— 按各自内容特性配 TTL。

> 参考文档
> - 本方案引用的配置组语法（API/版本管理用）：<https://cloud.tencent.com/document/product/1552/125342>
> - 节点缓存 TTL 控制台操作：<https://cloud.tencent.com/document/product/1552/70777>
> - 规则引擎支持的匹配类型与操作：<https://edgeone.ai/zh/document/54759>
>
> 提示：上面那份「配置组语法说明」是给 **API / 版本管理**用的 JSON 结构说明；在控制台点选配置**不需要**写 JSON，本文第四节的表格就是控制台上要填的那几栏。
