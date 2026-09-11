'use strict'

/**
 * 站点级 HTML 微调（作用于渲染后的页面，优先级高于主题默认的 10，
 * 保证在主题 scripts/filter/lazyload.js 之后执行）
 *
 * 1) 修复页脚「返回顶部」圆形按钮空白
 *    原因：主题 scripts/filter/lazyload.js 的正则只认「img 标签自身」带 nolazyload class：
 *          /(<img(?!.*?class\s*=\s*['"].*?nolazyload.*?['"]).*? src=)/gi
 *    而 footer.pug 里 nolazyload 是加在外层 div 上的：
 *          #footer_mini_logo.nolazyload.footer_mini_logo(...)  ->  img(src=information.author)
 *    于是该 img 被误判为需要懒加载，src 被改写为空：<img src= "" data-lazy-src="/img/site-logo.png">
 *    一旦 JS 未执行或懒加载未接管，按钮就只剩一个 50x50 的空白圆形。
 *    这里直接把真实 src 还原回去（图片仅 4KB，无需懒加载）。
 *
 * 2) 删除页脚最下方的「主题：Solitude」署名，只保留「框架：Hexo」。
 *    主题 footer.pug 中的 themeRepoUrl 是硬编码的，无配置开关，只能后处理。
 *
 * 3) 页脚分组（#st-footer）里的站外链接补 target="_blank"（如「项目」栏的 GitHub）。
 */

hexo.extend.filter.register(
  'after_render:html',
  function (html) {
    if (typeof html !== 'string' || html.indexOf('footer_mini_logo') === -1) return html

    // 1) 还原「返回顶部」头像的真实 src
    html = html.replace(
      /(<div class="[^"]*footer_mini_logo[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/,
      function (matched, open, inner, close) {
        const fixed = inner
          .replace(/src=\s*""\s*data-lazy-src="([^"]*)"/, 'src="$1"')
          .replace(/\s*data-lazy-src="[^"]*"/, '')
        return open + fixed + close
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
