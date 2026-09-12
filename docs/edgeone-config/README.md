# EdgeOne 规则引擎 · 配置语法（可直接导入）

> 文件：[`rules.json`](./rules.json)
> 格式依据：[配置语法概述 125341](https://cloud.tencent.com/document/product/1552/125341) → 语法示例
> 字段依据：[配置组语法说明 125342](https://cloud.tencent.com/document/product/1552/125342) → `ConfigGroupRuleEngineItem` / `RuleBranch` / `RuleEngineAction`
> 求值依据：[规则引擎详解 46151](https://edgeone.ai/zh/document/46151) → 「规则生效优先级」
> 配套说明：[`../edgeone-cache-rules.md`](../edgeone-cache-rules.md)（源站实测数据、回源配置）

⚠️ **这是「配置语法」，不是 API 请求体。** 两者完全不同：

| | 配置语法（本文件） | API 请求体 |
|---|---|---|
| 顶层 | `FormatVersion` + `Rules`（+ 可选 `ZoneConfig` / `WebSecurity`） | `ZoneId` + `Rules` |
| 启用状态 | 不写，导入即启用 | `Status: enable/disable` |
| 用途 | 版本管理编辑 JSON、配置导入导出 | `CreateL7AccRules` / `ModifyL7AccSetting` |

**导入路径**：站点详情 → **版本管理** → 编辑 JSON 文本；或 **站点加速 → 配置导入导出 → 导入**。
导入后到「规则引擎」页确认 5 条规则都在，再点**保存并发布**。

---

## 结构：与 125341 示例逐字段一致

`Rules[]` 的每一项就是一个 `ConfigGroupRuleEngineItem`：

```jsonc
{
  "FormatVersion": "1.0",
  "Rules": [
    {
      "RuleName": "规则名",
      "Branches": [                    // 该列表只支持 1 项，多填无效
        {
          "Condition": "${http.request.host} in ['blog.20020831.xyz']",
          "Actions": [
            {
              "Name": "Cache",         // 动作名；参数键必须叫 CacheParameters
              "CacheParameters": {
                "CustomTime": { "Switch": "on", "IgnoreCacheControl": "on", "CacheTime": 604800 }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

字段合法性（对应 125342 的定义）：

| 位置 | 允许字段 | 说明 |
|---|---|---|
| `Rules[]` 项 | `RuleName` / `Description` / `Branches` | `ConfigGroupRuleEngineItem`；`Branches` 只填 1 项 |
| `Branches[]` 项 | `Condition` / `Actions` / `SubRules` | `RuleBranch`；`Actions` 与 `SubRules` **不可同时为空** |
| `Actions[]` 项 | `Name` + `<Name>Parameters` | `RuleEngineAction`；**没有**通用 `Parameters` 字段 |
| `Cache` 的参数 | `CacheParameters` → `CustomTime` / `NoCache` / `FollowOrigin` 三选一 | `CustomTime` = `{Switch, IgnoreCacheControl, CacheTime}` |

本文件刻意**只用了最扁平的一层**（`RuleName` + `Branches[Condition, Actions]`，不用 `SubRules`、不用 `Description`），
目的就是跟 125341 的示例长得一模一样，导入器不会有任何歧义。

---

## ⚠️ 顺序：谁在下面，谁说了算（这点最容易搞反）

官方「规则引擎详解」原文：

> **规则引擎内的多条规则**：按相对顺序，从上至下执行。
> 提示：确定规则放置位置时，可将具有**通用性或粗粒度**的规则放在**上方**位置作为默认配置，
> 针对**特定请求或细粒度**的规则放在**下方**位置。
> ……即如果同时匹配到多条规则，**下方规则的操作将覆盖上方的规则**。

所以本文件是**「粗在上、细在下」**，`/vendor/` 放在最后一条：

| 顺序 | RuleName | 匹配条件 | 节点缓存 TTL |
|---|---|---|---|
| 1（最粗，默认） | 默认-HTML与其余资源 | `${http.request.host} in ['blog.20020831.xyz']` | 300（5 分钟） |
| 2 | 索引与数据文件 | 后缀 `xml` / `json` | 300 |
| 3 | 图片与字体 | 图片 / 字体后缀 | 2592000（30 天） |
| 4 | 样式与脚本 | 后缀 `css` / `js` / `mjs` | 86400（1 天） |
| 5（最细，覆盖上面） | 自托管第三方库-最高优先级 | `${http.request.uri.path} matches '^/vendor/'` | 604800（7 天） |

验算 `/vendor/pace/pace.min.js`：命中第 4 条（1 天）和第 5 条（7 天），**第 5 条在下方 → 7 天生效** ✅
验算首页 `/`：只命中第 1 条 → 300 秒 ✅

> 这条「下方覆盖上方」和「缓存规则」简化入口的「首个匹配即停」**方向相反**，
> 从别的平台/别的入口抄配置时特别容易搞反，务必按上面这张表核对顺序。

---

## 语法速查

| 项 | 正确 | 不可用 |
|---|---|---|
| 变量 | `${http.request.host}`、`${http.request.file_extension}`、`${http.request.uri.path}` | 漏写 `${ }` |
| 精确匹配 | `in ['css', 'js']`（**单值也要写成列表**） | `like ['/vendor/*']`、`contain ['vendor']` |
| 前缀 / 正则 | `matches '^/vendor/'`（RE2） | — |
| 文件后缀 | `css`、`js`（**不带点**） | `.css` |
| 兜底条件 | 写真实表达式 `${http.request.host} in ['…']` | 裸 `*`（「规则引擎」入口会报 `Condition 语法错误`） |

本文件所有条件都只用 `in` 和 `matches`，**不含 `and` / `or` / `not`**——用规则顺序替代逻辑组合，最稳。
（`and` / `not` 在 125343 里标称「站点加速」支持，但真实导入曾有报错案例，能绕开就绕开。）

---

## 一个必须开的开关：`IgnoreCacheControl: "on"`

GitHub Pages 对**所有**资源一律回 `Cache-Control: max-age=600`（HTML、JS、CSS、图片一视同仁）。
不开强制缓存，EdgeOne 会跟随源站 → 上面设的 30 天 / 7 天全部作废，实际只缓存 10 分钟。

代价：同一 URL 换了内容，节点会继续发旧的直到 TTL 到期。
**所以每次改主题配置 / 换自托管库版本后，手动刷一次缓存**（控制台 → 缓存配置 → 清除缓存）。

若你的入口不认这个字段（报语法错），删掉整行即可退回「跟随源站 10 分钟」。

## 浏览器缓存 TTL 不在这份文件里

`CacheParameters` 只支持三选一：`CustomTime` / `NoCache` / `FollowOrigin`。浏览器缓存 TTL 是独立动作 `MaxAge`：

```jsonc
{ "Name": "MaxAge", "MaxAgeParameters": { "FollowOrigin": "off", "CacheTime": 3600 } }
```

想加就把这个对象追加进对应 `Actions` 数组。若入口只认 `Cache`（部分「缓存规则」入口如此），
就改在控制台 **缓存配置 → 浏览器缓存 TTL** 里做站点级设置。

---

## 导入后怎么验收

```bash
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
B=https://blog.20020831.xyz

# 1) 确认已走 EdgeOne（出现 eo-cache-status，不再有 cf-cache-status）
curl -sD - -o /dev/null -H 'Accept-Encoding:' "$B/" | grep -iE 'eo-cache-status|cache-control'

# 2) 连续两次请求同一资源，第二次应为 HIT
curl -sD - -o /dev/null "$B/img/site-avatar.jpg" | grep -i eo-cache-status
curl -sD - -o /dev/null "$B/img/site-avatar.jpg" | grep -i eo-cache-status

# 3) 逐字节完整性（防「边缘副本被截断」）
curl -ksS -o /tmp/a.bin --resolve "blog.20020831.xyz:443:185.199.108.153" -H 'Accept-Encoding:' "$B/js/main.js?v=4.0.0"
curl -s   -o /tmp/b.bin -H 'Accept-Encoding:' "$B/js/main.js?v=4.0.0"
cmp /tmp/a.bin /tmp/b.bin && echo "✅ 一致" || echo "❌ 边缘内容与源站不符"
```

> ⚠️ **节点缓存 TTL 不体现在响应头里**。`Cache-Control` 的 `max-age` 是**浏览器缓存**；
> 节点缓存只能靠 `eo-cache-status` 从 `MISS` 变 `HIT` 来判断。

---

## 三条红线

1. 🔴 **不要 `immutable`、不要 1 年 TTL** —— 自建镜像 `cdn-jsdelivr.mofashi.ltd` 就是栽在这上面：坏副本一年不自愈。
2. 🔴 **顺序别动**：粗粒度在上、`/vendor/` 在下；改顺序会直接改变生效结果。
3. ⚠️ **改配置 / 升主题 / 换库版本后主动刷一次缓存**，别等 TTL 到期（最长 30 天）。

---

## 参考

- 配置语法概述（顶层格式与示例）：<https://cloud.tencent.com/document/product/1552/125341>
- 配置组语法说明（字段级定义）：<https://cloud.tencent.com/document/product/1552/125342>
- 条件表达式语法：<https://cloud.tencent.com/document/product/1552/125343>
- 可用变量清单：<https://cloud.tencent.com/document/product/1552/125344>
- 规则引擎生效优先级：<https://edgeone.ai/zh/document/46151>
- 导入配置 API 示例（`FormatVersion` + `Rules`）：<https://edgeone.ai/zh/document/67241>
