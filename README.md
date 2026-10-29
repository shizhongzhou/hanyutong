# 汉语通 · ХаньюйТун

面向俄语使用者的中文学习应用，界面使用俄语，包含课程、教材、发音练习与宠物互动。

- 独立网页入口：https://shizhongzhou.github.io/hanyutong/
- 安卓安装包：https://shizhongzhou.github.io/hanyutong/downloads/lapka-android.apk
- 版本：0.4.0

## iPhone 使用

用 Safari 打开网页入口，选择“分享 → 添加到主屏幕”。首次打开需要联网；可在应用内下载离线内容。

## 安卓使用

下载安装 APK。应用界面、内置课程、教材和宠物动画随安装包保存，可离线打开。外部学习资源仍需要网络。

APK SHA-256：`880a6f3510e1e1a44566941d86f4ace4c4d080fc5662bb992150b6256e5947c5`

## 源码与发布

`web-package.zip` 保存网页源码及资源；`lapka-android.apk` 是离线安装包。
`.github/workflows/pages.yml` 将网页包解压到发布目录、补入 APK 和本说明，然后发布 GitHub Pages。
仓库默认分支为 `main`。Pages 使用 GitHub Actions，应用资源路径与离线缓存作用域适配 `/hanyutong/`。
