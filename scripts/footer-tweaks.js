'use strict'

/**
 * 站点级 HTML 微调（作用于渲染后的页面）
 * 注册在 after_render:html，priority 100 —— 高于主题 scripts/filter/lazyload.js 的 10，
 * 保证在主题的懒加载改写之后再处理，拿到的是最终 HTML。
 *
 * 1) 页脚「返回顶部」按钮：把主题默认的作者头像 <img> 换成向上的箭头图标
 *    主题 footer.pug 的结构是：
 *      #footer_mini_logo.nolazyload.footer_mini_logo(data-solitude-action="toTop")
 *        img(src=information.author)
 *    这里保留外层 div（点击回顶的 data-solitude-action 与 title 都在它身上），
 *    只把内部内容替换为 <i class="solitude fas fa-arrow-up">，
 *    并补上 flex 居中与配色，使其成为一个圆形按钮。
 *    配色沿用主题 .deal_link 的写法（背景 --efu-fontcolor / 前景 --efu-card-bg），
 *    明暗模式下都能保证对比度。
 *    —— 顺带也就修掉了这里的历史遗留问题：主题 lazyload 过滤器的正则
 *       /(<img(?!.*?class\s*=\s*['"].*?nolazyload.*?['"]).*? src=)/gi
 *       只检查 img 自身 class，而 nolazyload 加在外层 div 上，导致该 img 被误判，
 *       src 被改写为空而显示成空白圆形。现在整段 img 已被移除，问题不复存在。
 *
 * 2) 删除页脚最下方的「主题：Solitude」署名，只保留「框架：Hexo」。
 *    主题 footer.pug 里的 themeRepoUrl 是硬编码的，无配置开关，只能后处理。
 *
 * 3) 页脚分组（#st-footer）里的站外链接补 target="_blank"（如「项目」栏的 GitHub）。
 */

// 返回顶部按钮的箭头图标（FontAwesome Free 由主题 CDN 加载，fas 前缀可用）
const BACKTOP_ICON = '<i class="solitude fas fa-arrow-up" aria-hidden="true"></i>'

// 圆形按钮样式：flex 居中 + 主题内置变量配色（与 .deal_link 一致，明暗模式自适应）
const BACKTOP_STYLE =
  'display:flex;align-items:center;justify-content:center;' +
  'background:var(--efu-fontcolor);color:var(--efu-card-bg);'

hexo.extend.filter.register(
  'after_render:html',
  function (html) {
    if (typeof html !== 'string' || html.indexOf('footer_mini_logo') === -1) return html

    // 1) 返回顶部按钮 -> 向上箭头图标
    html = html.replace(
      /(<div class="[^"]*footer_mini_logo[^"]*"[^>]*?)(>)([\s\S]*?)(<\/div>)/,
      function (matched, open, gt, inner, close) {
        // 已有 style 属性则跳过（幂等，避免重复注入）
        const styledOpen = /\sstyle="/.test(open)
          ? open
          : open + ' style="' + BACKTOP_STYLE + '"'
        return styledOpen + gt + BACKTOP_ICON + close
      }
    )

    // 2) 去掉「主题：Solitude」署名
    html = html.replace(
      /<a class="footer-bar-link"[^>]*hexo-theme-solitude[^>]*>[^<]*<\/a>/g,
      ''
    )

    // 3) 页脚分组的站外链接新窗口打开
    html = html.replace(
      /<div id="st-footer">[\s\S]*?<div id="footer-bar">/,
      function (block) {
        return block.replace(
          /<a class="footer-item" href="(https?:\/\/[^"]+)"/g,
          '<a class="footer-item" target="_blank" rel="noopener" href="$1"'
        )
      }
    )

    return html
  },
  100
)
