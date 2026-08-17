# dsh-insight — 插件评测中心

**一个插件，一个答案："哪些值得装"。** 把需求推荐、质量评分、安全审计、环境配方合并成同一个决策面。装 `dsh-insight` 一个包，就能得到完整结论。

## 五个工具

| 工具 | 回答的问题 |
| --- | --- |
| `plugin_guide` | 说需求 → 推荐最匹配插件（84 精选 / 14 分类，带理由与安装命令） |
| `recipe` | 要整套环境 → 8 个社区配方，有序安装计划 |
| `plugin_rank` | "哪些值得装" → 健康分排行榜（0-100） |
| `plugin_audit` | "安全吗" → 本地目录静态安全扫描 |
| `plugin_verdict` | **"值得装吗"** → install / caution / research / avoid |

## 安装

```bash
dsh plugin --profile <profile名> add dsh-insight
```

## 设计

- 纯逻辑层零依赖，全部可单测（match/recipe/scoring/security/verdict）。
- 评分模型 0-100：维护 30 + 文档 25 + npm 30 + 生态 15；高危安全 flag 封顶 D。
- 插件本身零网络请求；plugin_audit 只读模型指定的本地目录（信任边界）。

## License

MIT
