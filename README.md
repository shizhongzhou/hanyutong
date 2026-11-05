# 汉语熊猫 · ХаньюйТун

面向俄语使用者的中文学习应用。界面使用俄语，设计和结构参照「俄语熊」：白底、黑色按钮、浅蓝卡片、原创线稿，吉祥物为熊猫。

- 网页入口：https://shizhongzhou.github.io/hanyutong/
- 版本：1.1.0

## 功能

底部四个入口：**Сегодня（今日）**、**Учёба（学习）**、**Повторение（复习）**、**Профиль（我的）**。

- 今日：问候、本周打卡、每日目标进度、今日计划（复习 / 新词 / 小测）、查词、单词本、统计、每日一句
- 学习路径：01 声调与拼音 → 02 HSK 词汇 → 03 对话与听力 → 04 阅读与写作
- 单项练习：语法、听力、跟读（录音回放，浏览器支持时做中文语音识别对照）、写作（拼音或汉字输入）、声调训练、HSK 模拟测试（10 分钟计时）
- 背词卡片与间隔复习（1/2/4/7/15/30/60/120 天），答错的词自动进入「我的单词本」
- 单词详情页：笔顺动画、例句、组成该词的单字；点任何词都能打开
- 汉字书写：按笔顺在屏幕上描写，可显示轮廓和演示（Hanzi Writer）
- 趣味背词：「Найди пару」配对游戏、按词频大小排列的词云
- 「Мои учебники」教材书架：一次导入整个文件夹（如《成功之路》Road to Success 全套），每个子文件夹成为一册书；PDF 阅读并记页码，音频播放记进度、可变速、单句重复、自动下一轨。文件保存在本机 IndexedDB，不上传服务器
- 查词：保留 HSK 1–6 全部 4991 词，新增大БКРС 的 **1,800,215 条汉俄条目**（其中 **25,070 个单字**、**33,260 条带独立俄语例句的条目**）。包含词、术语、名称及短语，不宣称穷尽中文全部词汇；支持汉字或前缀、拼音、俄语关键词搜索
- 「Спросить панду」浮动按钮：在完整汉俄词库中快速查词（本地查询，不是 AI）
- 单字字典：Unicode Unihan 17.0.0 的 **102,998 个汉字资料记录**，显示可用的部首、笔画、读音和繁简关联；无俄语释义的字明确提示，不显示英文兜底
- 长俄语释义完整显示，保留词典例句；6 个原创俄语用法说明和情景练习，可先作答再看示范
- 新词可收藏并加入间隔复习；已保存的扩展词条随进度码备份
- 计划、设置、进度码备份与恢复；内置练习首次打开后离线可用（云教材只在线查看），大词库按需下载并缓存已访问分片，浏览器可能因空间不足清理缓存

发音使用设备自带的中文语音（zh-CN）。设备没有中文语音时会提示到系统设置中安装。

## 暂未接入

俄语熊里依赖服务器的功能这一版没有做：云端账号、好友排行、AI 问答、整句翻译、新闻。进度只保存在本机浏览器，可用设置里的进度码迁移。Yandex 云开发环境已接入教材目录和文件存储；账号及 AI 功能可在此环境中继续开发。

## 目录

```
web/                    GitHub Pages 发布目录
  index.html            入口
  css/app.css           样式
  js/content.js         课程内容：等级说明、声调、声母韵母、语法 25 条、对话 10 篇、阅读 4 篇
  js/app.js             路由、页面、复习算法、测验、语音
  data/dictionary/     构建时生成的词库、索引和单字资料，不在 Git 中重复存储
  js/dictionary.js     分片加载、汉字/拼音/俄语检索
  js/scenarios.js      俄语解释与情景练习
  data/hsk1..6.json     词库：[汉字, 拼音, 俄语释义, 词性]，按词频排序
  icons/                熊猫图标
  strokes/              2632 个 HSK 汉字的笔顺数据（Make Me a Hanzi，Arphic Public License，许可证见 ARPHICPL.TXT）
  vendor/               hanzi-writer.min.js（MIT）
  sw.js                 离线缓存（缓存名前缀 hanyu-panda-）
```

`.github/workflows/pages.yml` 检查文件后把 `web/` 发布到 GitHub Pages。进度保存在 `localStorage` 键 `hanyutong-v2`。

## 数据来源与许可

- HSK 1–6 词表、拼音和词性来自 [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary)（MIT），其释义数据源于 CC-CEDICT（CC BY-SA 4.0）。
- 俄语释义、对话、阅读和语法讲解为本应用原创编写。俄语释义为简短释义，**未经母语者人工校对**，发现不准确的地方欢迎修正 `web/data/hsk*.json`。
- 多音字按常用读音选取，少数词的拼音可能需要人工核对。

## 旧版本

0.4.0 版的网页包 `web-package.zip`、安卓安装包 `lapka-android.apk` 和猫咪宠物已移除，可从 Git 历史恢复。新版暂时没有安卓安装包；手机上用 Safari / Chrome 打开网页，选择「添加到主屏幕」即可像 App 一样使用。

## 扩展词库的构建与验证

GitHub Pages 发布流程从官方地址下载固定日期的源数据，核验 `dictionary-sources.json` 中的 SHA-256，再构建词库。所有约 97 MiB 的压缩分片随 Pages 一起发布；浏览器只向本应用请求所需分片，不调用第三方在线词典。词典缺少拼音时不凭单字猜测多音词读音。中文查询按完整写法和前缀检索，俄语查询按 3 字母以上的关键词及其前缀检索，多个关键词取交集，返回前 60 项。

```sh
python3 scripts/fetch_dictionary.py
python3 scripts/build_dictionary.py --bkrs .dictionary-cache/dabkrs_261105.gz --unihan .dictionary-cache/Unihan-17.0.0.zip --scratch .dictionary-cache/build.sqlite
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.cjs
python3 -m http.server 8765 --directory web
```

重建时给 `--scratch` 指定一个不存在的新文件路径。源数据下载失败或校验不符时发布会停止，避免悄悄换入不同版本。大БКРС 原始 3,464,739 条中，筛除无汉字标题或无俄语释义的 1,664,523 条，合并 1 条重复标题，得到 1,800,215 条。所有压缩分片的哈希、大小和统计写入生成的 `manifest.json`。生成目录被 `.gitignore` 排除，构建工具、来源、版本和验证全部在仓库中。

大БКРС [下载说明](https://bkrs.info/p47)允许词库自由用于任何目的，完整出处与转换说明见 `web/data/DICTIONARY-SOURCES.txt`。Unihan 采用 Unicode License v3，许可文件随应用提供；只导入字符元数据，不导入英语释义。fflate 0.8.2 的 MIT 许可见 `web/vendor/fflate-LICENSE.txt`。

## 《新华字典》导入状态

用户确认已有授权，并指定最新版（第 13 版）。目前尚未提供该版的数据文件或接口，因此本次没有导入《新华字典》原文，也没有把大БКРС、Unihan 或网上旧字库标为《新华字典》。收到授权版本的数据后，还需为该版中文释义准备对应的俄语译文，才可作为独立来源接入。

## 云端教材库

「Учёба → Путь к успеху」接入《成功之路》21 个分级目录。原清单 647 个文件，按用户要求跳过源站暂时不可读的 40 个文件（`infra/yandex/deferred-files.json`），按用户要求从 App 移除 14 份教学参考文档后，本次接入 593 个：29 PDF、544 MP3、20 课件，原文件共 4,959,124,413 字节。目录和操作界面使用俄语，教材保留原文。

教材和 PPT 均在 App 内分页阅读，音频播放器位于对应教材或课次旁边（窄屏下方），支持变速、循环、进度恢复和连续播放。没有下载、外部打开或离线保存入口。只在设备上保存阅读和播放进度，不缓存教学文件。课次与录音编号分开处理；已核对的扫描教材录音标记保存在 `infra/yandex/audio-alignment.json`，不得按文件顺序猜测课次。

- 前端沿用 GitHub Pages，目录及受限阅读接口由 Yandex Cloud Functions + API Gateway 提供。公开目录不包含对象路径、校验码和源网盘链接。
- 原文件放在私有 `library/road-to-success/`，Word/PPT 的 34 份 PDF 阅读副本放在私有 `library/previews/`，共 15,159,673 字节。移除的 14 份 Word 及其阅读副本保留为私有备份，不出现在目录中，阅读接口拒绝访问。对象 ACL 仅授予阅读服务账号 READ；保留已有具名所有者权限，关闭匿名读取，不启用整桶公开访问。
- `/library/access/{id}` 发放绑定单个文件、有效 1 小时的阅读凭证；`/library/media/{id}` 校验凭证后通过服务账号读取固定清单中的对象。每次最多返回 1 MiB，使用 `no-store`，不返回对象存储地址或云端凭据。Office 文件只返回 PDF 阅读副本。
- PDF.js 6.5.438（Apache-2.0）从官方 npm 快照校验下载，在本 App 域名运行，通过受限接口读取分页所需字节；不使用第三方 Office 在线预览服务。
- 原文件、阅读副本、访问凭证都不进入 Git。`source-inventory.json` 固定源文件大小和校验码。导入脚本接收 `--deferred infra/yandex/deferred-files.json`，继续导入时默认私有。
- `scripts/prepare_library_previews.py` 使用 LibreOffice 转换已校验的 Office 原文件。私有源文件读取使用临时 `YC_IAM_TOKEN` 环境变量；macOS 无中文字体时需通过 `FONTCONFIG_FILE` 指定系统中文字体与可写字体缓存。转换后检查中文和排版，更新 `infra/yandex/previews.json`。
- `python3 scripts/build_library_catalog.py` 重建公开与服务端目录；`python3 scripts/fetch_pdfjs.py` 获取已固定、校验的阅读器。CI 运行目录、匹配、凭证有效期与防篡改、分段读取及原应用回归检查。
- 在已登录 Cloud Shell 中部署 `infra/yandex/`：先安装并核验阅读副本，再执行 `deploy-reader.py` 和 `configure-library-storage.py`。会话签名密钥在云端生成，保存在受限文件及函数环境变量中，不写入代码、日志或客户端。原文件与副本均需验证匿名访问返回 403。
- 继续使用 300 卢布/月预算提醒、6 GiB 存储上限、128 MiB 云函数、每区最多 1 个实例和 4 个并发请求、0 预置实例。预算提醒不是自动停机或扣费上限；实际费用取决于使用量。

当前 App 没有云端用户账号。本方案限制 App 提供的下载及外链访问方式，属于阅读界面与访问控制，不能保证阻止截图、录音或从已显示内容中提取数据。
