# 博客缓存配置审计报告 · blog.20020831.xyz

> 实测时间：2026-09-12
> 实测方式：从外部（本机直连+本机代理）抓取真实响应，不依赖控制台
> 结论：**节点缓存健康，浏览器缓存是明显缺口**

---

## 一、接入状态确认

DNS 已指向 EdgeOne（`blog.20020831.xyz.eo.dnse1.com` → `123.6.40.242`），响应带
`EO-Cache-Status` / `EO-LOG-UUID` / `NEL` 头 ⇒ **EO 已生效**。回源内容正确（详见第四节）。

`EO-Cache-Status` 实测出现过三种值：`HIT`、`MISS`、`RefreshHit`（= 命中缓存 + 异步预刷新）
⇒ **「缓存预刷新」已开启**，这对静态站是正确选择。

---

## 二、检查结果总表

| # | 检查项 | 实测结果 | 判定 |
|---|---|---|---|
| 1 | 强制 HTTPS | `http://` → `302 → https://` | ✅ 合理 |
| 2 | 智能压缩 | `Content-Encoding: br` 生效，gzip 兼容 | ✅ 合理 |
| 3 | 边缘内容完整性 | 4 个文件「明文 / br」解码后与本地产物**逐字节一致** | ✅ 合理（未踩镜像那种截断坑） |
| 4 | 缓存键包含查询串 | `?v=4.0.0` → HIT；加 `&cb=` → MISS；去掉 `?` → MISS | ✅ 合理（`?v=` 版本号机制有效） |
| 5 | 条件请求 | `If-None-Match` → `304 Not Modified` | ✅ 合理 |
| 6 | `immutable` 指令 | 未出现 | ✅ 合理（坏副本可自愈） |
| 7 | 各类资源是否被缓存 | HTML / JS / CSS / 图片 / 字体 均为 `HIT` | ✅ 合理 |
| 8 | **浏览器缓存 TTL** | **全部等于源站透传值**：HTML `600`、其余 `14400` | ❌ **不合理（最大问题）** |
| 9 | HTML 浏览器缓存 | `max-age=600`（10 分钟） | ⚠️ 可优化 |
| 10 | `/vendor/**`、`/img/**` 版本号 | 无任何版本号（URL 裸路径） | ⚠️ 隐患 |
| 11 | HSTS | 未设置 | ⚠️ 可选 |
| 12 | 404 缓存 | `MISS`，无 `Cache-Control`（每次回源） | ⚠️ 可优化 |
| 13 | feed | `/atom.xml` 404（未装 feed 生成器） | ℹ️ 与缓存无关 |
| 14 | `www` 子域 | 未解析（`000`） | ℹ️ 与缓存无关 |

---

## 三、核心问题：浏览器缓存 TTL 完全没配

### 现象

所有资源的 `Cache-Control` 都是**源站原样透传**，没有任何 EO 侧的改写痕迹：

| 资源类型 | 实测 `Cache-Control` | 来源 |
|---|---|---|
| HTML（`/`、`/archives/`、文章页） | `max-age=600` | GitHub Pages 源站 |
| CSS / JS / 图片 / 字体 / vendor 库 | `max-age=14400` | 上游 Fastly 的默认值 |

**判据**：如果配了 EO 的「浏览器缓存 TTL」，同类资源会呈现统一的、按规则设定的值；
而实测是 600 与 14400 两种"源站风格"的值混在一起 ⇒ EO 侧未做任何覆盖。

### 影响

`max-age=14400` = **4 小时**。而本站的 CSS(243KB) + JS + fancybox(108KB) + FontAwesome(90KB) +
字体(119KB×N) 合计**约 1.5~2MB**，这些内容几乎永不变化，却让回访用户在 4 小时后全部重新下载。

### 正确的目标值

| 资源 | 现状 | 建议浏览器 TTL | 建议节点 TTL |
|---|---|---|---|
| HTML（无后缀路径） | 600s | **`no-cache`**（每次带 ETag 校验，304 极便宜） | 5~10 分钟 |
| CSS / JS（带 `?v=`） | 14400s | **30 天** | 30 天 |
| 图片 / 字体 | 14400s | **30 天** | 30 天 |
| `/vendor/**` | 14400s | **7 天**（补 `?v=` 后可提到 30 天） | 7~30 天 |
| `/search.xml`、`/links.json` | 600s | 5 分钟 | 5 分钟 |

> 🔴 **不要用 `immutable`**：镜像站就是被这个坑到——`immutable` 让浏览器连条件请求都不发，
> 一旦缓存了坏内容就永远无法自愈。30 天足够，且保留 revalidate 能力。

### 为什么"浏览器缓存 TTL"这个设置项解决不了问题

EO 控制台的**「浏览器缓存 TTL」是站点级全局值**，一改就是全站统一。

- 若设成 30 天 → HTML 也被缓存 30 天，**发新文章后读者一个月看不到** ❌
- 若设成 0 / 不缓存 → 静态资源也失去缓存 ❌

⇒ 必须走**规则引擎 + 「修改响应头」动作**，按资源类型分别写 `Cache-Control`。
节点缓存 TTL 可以继续留在现有的 `Cache` 动作里。

---

## 四、已确认健康的部分（含验证方法）

### 边缘内容逐字节正确（防镜像那种截断）

```
/vendor/pace/pace.min.js          本地 12962B  边缘明文 12962B ✅  边缘 br 解压 12962B ✅
/vendor/fancybox/fancybox.umd.min.js  本地 107599B → 107599B ✅ / 107599B ✅
/css/index.css?v=4.0.0            本地 243221B → 243221B ✅ / 243221B ✅
/js/main.js?v=4.0.0               本地 54208B  → 54208B  ✅ / 54208B  ✅
```

复现命令：

```bash
B=https://blog.20020831.xyz
curl -ksS -o /tmp/a.bin -H 'Accept-Encoding:' "$B/vendor/pace/pace.min.js"
cmp /tmp/a.bin public/vendor/pace/pace.min.js && echo "✅ 一致"
```

### 缓存键包含查询串（`?v=` 机制有效）

```
/css/index.css?v=4.0.0          → EO-Cache-Status: HIT
/css/index.css?v=4.0.0&cb=随机  → EO-Cache-Status: MISS   ← 换查询串即换缓存对象
/css/index.css                  → EO-Cache-Status: MISS
```

⇒ 查询字符串参与缓存键。**千万不要在 EO 里开「忽略查询字符串」**，否则主题升级后
`?v=` 失效，读者会长时间命中旧 CSS/JS。

### ⚠️ 一个排障时容易踩的坑：`Age` 头不是 EO 的

强制回源（`MISS`）时响应里 `Age: 449` 且带 `X-Cache: HIT`（Fastly 的）⇒
**`Age` 是从上游 GitHub Pages/Fastly 透传下来的，不代表 EO 节点的缓存年龄。**

所以**不能用 `Age` 判断 EO 节点 TTL**。判断节点缓存只能看 `EO-Cache-Status`
（`HIT` / `MISS` / `RefreshHit`）。

---

## 五、修改清单（按优先级）

### P0 — 补浏览器缓存 TTL（用规则引擎的「修改响应头」动作）

在「站点加速 → 规则引擎」中，为各类型资源添加**修改响应头**动作，替换 `Cache-Control`：

| 条件 | 设置 `Cache-Control` 为 |
|---|---|
| 文件后缀 ∈ `png,jpg,jpeg,gif,webp,avif,svg,ico,bmp,woff,woff2,ttf,otf,eot` | `public, max-age=2592000` |
| URL Path 匹配 `^/vendor/` | `public, max-age=604800` |
| 文件后缀 ∈ `css,js,mjs` | `public, max-age=2592000` |
| 文件后缀 ∈ `xml,json` | `public, max-age=300` |
| 其余（HTML 等，作为最上方默认规则） | `no-cache` |

> 顺序仍是**粗在上、细在下**（下方覆盖上方）。

### P1 — 给 `/vendor/**` 补版本号

现在 `CDN.options` 里是裸路径，换库版本时 URL 不变、内容却变了，长缓存必然踩坑。
在 `_config.solitude.yml` 的 `CDN.options` 各值后追加 `?v=<库版本>`，例如：

```yaml
options:
  pace_js: /vendor/pace/pace.min.js?v=1.2.4
  pjax: /vendor/pjax/pjax.min.js?v=0.2.8
  lazyload: /vendor/lazyload/lazyload.iife.min.js?v=19.1.3
  ...
```

（版本号从 `node_modules/hexo-theme-solitude/plugins.yml` 读取，改完先 `hexo generate`
确认产物真带上了再推。）

### P2 — 可选优化

- 加 `Strict-Transport-Security: max-age=31536000`（HSTS，一处响应头即可）
- 404 状态码缓存设为 10~60 秒（现在是每次回源）
- 若需要 RSS，安装 `hexo-generator-feed`（现在 `/atom.xml` 是 404）

---

## 六、验收方法

```bash
B=https://blog.20020831.xyz
# 1) 看浏览器缓存是否已分层
for p in / /css/index.css?v=4.0.0 /vendor/pace/pace.min.js /img/site-avatar.jpg; do
  printf "%-42s " "$p"
  curl -ksS -D - -o /dev/null -H 'Accept-Encoding:' "$B$p" \
    | tr -d '\r' | grep -iE '^(EO-Cache-Status|Cache-Control)' | tr '\n' ' '
  echo
done
# 期望：/ → no-cache | css/js/图片 → max-age=2592000 | /vendor/ → max-age=604800

# 2) 看节点是否在缓存（连续两次）
curl -ksS -D - -o /dev/null "$B/" | grep -i EO-Cache-Status   # 第二次应为 HIT/RefreshHit

# 3) 确认缓存键仍包含查询串（改配置后务必复测）
curl -ksS -D - -o /dev/null "$B/css/index.css?v=4.0.0"        | grep -i EO-Cache-Status  # HIT
curl -ksS -D - -o /dev/null "$B/css/index.css?v=4.0.0&cb=1"    | grep -i EO-Cache-Status  # MISS

# 4) 边缘内容完整性（每次改完 CDN 配置都跑一遍）
curl -ksS -o /tmp/a.bin -H 'Accept-Encoding:' "$B/vendor/pace/pace.min.js"
cmp /tmp/a.bin public/vendor/pace/pace.min.js && echo "✅ 一致"
```
