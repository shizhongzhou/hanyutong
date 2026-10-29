# GitHub 网页上传用分包

这是本地待上传文件，尚未执行发布，也没有修改原站点。

仓库根目录需要以下文件：

- `web-package.zip`：包含应用 HTML、CSS、JavaScript、教材、动作媒体和 `.nojekyll`，不含 APK。
- `lapka-android.apk`：与已验证版本完全相同的安装包。
- `.github/workflows/pages.yml`：Pages 发布工作流，可由连接器以文本文件提交。

前两个文件均小于 25 MB，供浏览器分别上传。ZIP 保留完整网页源码，不需要在网页上传界面逐一展开文件。

仓库预期名称为 `hanyutun`，默认分支为 `main`。在仓库 Settings → Pages 中选择 GitHub Actions 后，工作流会把网页包解压到 `_site`，再把 APK 放进 `_site/downloads/lapka-android.apk`，最后通过官方 Pages Actions 发布。最终网址需以工作流返回的 Pages 地址为准，不要把本地准备完成视为已经上线。

完整可直接静态托管的目录和 ZIP 仍另外保留。进度键、PWA 作用域和离线视频支持与该完整目录一致。

流程参考：[GitHub Pages 自定义工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。此版本采用主任务指定的 action 标签：checkout v4、configure-pages v5、upload-pages-artifact v3、deploy-pages v4。
