# dsh-insight — 插件评测中心 (Plugin Insight Center)

**一个插件，一个答案："哪些值得装"。** 把需求推荐、质量评分、安全审计、环境配方合并成同一个决策面 —— 装 `dsh-insight` 一个包，用户就得到完整结论，而不是在三个工具间自己拼答案。

## 为什么是合并（而不是 3 个插件）

"没有评分、没有审计、没有'哪些值得装'的答案" —— 这是**同一个决策的三个维度**（安全吗 → 好不好 → 适合我吗）。拆成多个插件 = 用户自己拼答案；合一个 = 一次调用拿结论。

## 五个工具

| 工具 | 回答的问题 |
| --- | --- |
| `plugin_guide` | 用户说需求 → 推荐最匹配的插件（84 个精选 / 14 分类，带理由与安装命令） |
| `recipe` | 用户要整套环境 → 8 个社区配方（通知全家桶、安全审计套装...）有序安装计划 |
| `plugin_rank` | "哪些值得装" → 健康分排行榜（maintenance/docs/npm/ecosystem，0-100） |
| `plugin_audit` | "这个安全吗" → 本地目录静态安全扫描（外泄/凭据/混淆/持久化启发式） |
| `plugin_verdict` | **"这个值得装吗"** → 综合评分+扫描+需求匹配，输出 install / caution / research / avoid |

## 安装

```bash
dsh plugin --profile <profile> add dsh-insight
```

## 用法示例

- "我想抓取网页" → `plugin_guide` (need="抓取网页")
- "手机远程访问" → `recipe` (search need="手机远程") → apply
- "哪些插件值得装" → `plugin_rank` (sort=score)
- "这个仓库安全吗" → `plugin_audit` (dir=/path/to/checkout)
- "dsh-browser 值得装吗，我用来抓网页" → `plugin_verdict` (repo + need + dir 可选)

## 设计

- **纯逻辑层零依赖**：`match.js`、`recipe.js`、`scoring.js`、`security.js`、`verdict.js` 全部可独立单测。
- **评分模型**：0-100 = maintenance 30 + docs 25 + npm 30 + ecosystem 15；grade A-F；安全高危 flag 封顶 D。
- **数据**：`lib/guide-data.json`（精选目录）+ `data/catalog.json`（700+ 插件评分数据）。
- **安全**：插件本身零网络请求；`plugin_audit` 只读模型指定的本地目录做静态扫描（信任边界：只扫可信源码）。

## 测试

```bash
node --test test/
```

## License

MIT
