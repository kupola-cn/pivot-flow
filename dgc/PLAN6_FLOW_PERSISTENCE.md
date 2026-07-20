# PLAN6: Flow 持久化、流程列表与发布闭环

## 目标

让流程编排员完成画布编排后，可以把 Flow 保存到服务端数据库；之后可以从画布中打开“流程列表”弹窗，选择已保存或已发布的 Flow 加载回画布，继续修改、保存草稿、发布新版本。普通使用者只运行已发布 Flow。

这一步不是把流程写死进 npm 包。`@kupola/pivot-flow` 继续负责 Flow schema、校验、画布 UI、节点 UI、执行映射和前端通用组件；具体 Flow 数据由业务系统 HIS 的后端数据库持久化。

## 当前状态

状态：已完成第一阶段闭环。

- 后端已补齐 Flow 版本表、草稿/发布版本字段、运行记录扩展字段和种子数据。
- `@kupola/pivot-flow` 已在 `FlowWorkbench` 中封装流程列表弹窗、搜索、状态筛选、加载、保存和发布入口。
- HIS `his-flow-designer` 已接入 `/api/pivot-flows` 和 `/api/pivot-flow-runs`。
- 本地数据库已加入编排员、普通用户、示例流程和发布版本数据。
- 已完成必要检查：pivot-flow 测试、打包检查、HIS 前端构建、HIS 后端测试。

HIS 后端已经有基础接口和表模型：

- `GET /api/pivot-flows`
- `POST /api/pivot-flows`
- `GET /api/pivot-flows/:id`
- `PUT /api/pivot-flows/:id`
- `DELETE /api/pivot-flows/:id`
- `POST /api/pivot-flows/:id/publish`
- `POST /api/pivot-flows/:id/disable`
- `GET /api/pivot-flow-runs`
- `POST /api/pivot-flow-runs`
- `GET /api/pivot-flow-snapshots`
- `POST /api/pivot-flow-snapshots`
- `GET /api/pivot-flow-snapshots/:id`
- `DELETE /api/pivot-flow-snapshots/:id`

当前模型已经包括：

- `pivot_flows`
- `pivot_flow_runs`
- `pivot_flow_snapshots`

但是这还不够完整。现有实现更像“能存 Flow JSON 的基础能力”，还缺少面向编排员的 Flow List 交互、明确的发布版本语义、加载前后校验、草稿/发布版本隔离和更细的元数据。

## 核心原则

1. npm 包不保存业务 Flow 实例，只提供通用能力。
2. HIS 后端保存 Flow 定义、版本、运行记录、权限范围。
3. 编排员编辑 draft，普通使用者只运行 published。
4. 每次发布都生成不可变版本记录，便于回滚、审计和复现运行。
5. 加载到画布前后都要校验节点、边、属性、能力标识，不能加载非法流程。
6. 保存草稿不等于发布，发布必须通过服务端校验。

## 数据表设计

### 1. pivot_flows

存 Flow 的当前工作副本，主要用于列表、草稿编辑和当前发布状态。

建议字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar(100), primary key | Flow ID |
| name | varchar(100), index | Flow 名称 |
| description | varchar(255) | Flow 描述 |
| status | varchar(20), index | `draft` / `published` / `disabled` / `archived` |
| definition | jsonb/text | 当前 Flow JSON，包含 nodes、edges、intent、metadata、ui.position |
| draft_version | int | 当前草稿版本号 |
| published_version | int | 当前已发布版本号，没有发布则为 0 |
| owner_org_id | bigint nullable | 所属机构范围 |
| owner_user_id | bigint | 创建者/负责人 |
| created_by | bigint | 创建人 |
| updated_by | bigint | 最近更新人 |
| published_by | bigint nullable | 最近发布人 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |
| published_at | timestamp nullable | 最近发布时间 |

当前 HIS 模型已有 `id/name/description/status/definition/created_by/updated_by/created_at/updated_at/published_at`，后续需要补 `draft_version/published_version/owner_org_id/owner_user_id/published_by`。

### 2. pivot_flow_versions

存不可变发布版本。普通使用者运行时应优先绑定这个表的 published version，而不是直接读取可变草稿。

建议字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint, primary key | 版本记录 ID |
| flow_id | varchar(100), index | Flow ID |
| version | int | 版本号 |
| status | varchar(20) | `published` / `disabled` / `rollback` |
| definition | jsonb/text | 发布时的完整 Flow JSON |
| change_summary | varchar(500) | 发布说明 |
| created_by | bigint | 发布人 |
| created_at | timestamp | 发布时间 |

唯一约束：

- `(flow_id, version)` unique

### 3. pivot_flow_runs

存运行记录，用于审计、排错、复现。

建议字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint, primary key | 运行记录 ID |
| flow_id | varchar(100), index | Flow ID |
| flow_version | int | 运行时版本 |
| prompt | varchar(500) | 用户自然语言/测试指令 |
| input_json | jsonb/text | 输入参数 |
| result_json | jsonb/text | 最终输出 |
| trace_json | jsonb/text | 节点执行 trace |
| ok | boolean | 是否成功 |
| message | varchar(500) | 运行摘要 |
| created_by | bigint | 运行人 |
| created_at | timestamp | 运行时间 |
| duration_ms | int nullable | 耗时 |

当前 HIS 模型已有基础 `flow_id/prompt/ok/message/record/created_by/created_at`，后续建议扩展 `flow_version/input_json/result_json/trace_json/duration_ms`。

### 4. pivot_flow_snapshots

存编辑过程中的恢复点，定位是“草稿恢复”，不是正式发布版本。

建议字段保持当前模型为主：

- `id`
- `flow_id`
- `label`
- `reason`
- `snapshot`
- `created_by`
- `created_at`

后续可以增加：

- `source_version`
- `snapshot_type`: `manual` / `before_update` / `before_publish` / `rollback`

### 5. pivot_flow_permissions

可选但建议增加，用于控制哪些角色、用户、机构能查看/运行/编辑/发布 Flow。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint, primary key | 权限记录 ID |
| flow_id | varchar(100), index | Flow ID |
| subject_type | varchar(20) | `user` / `role` / `org` / `department` |
| subject_id | bigint | 主体 ID |
| permission | varchar(20) | `view` / `run` / `edit` / `publish` |
| created_by | bigint | 创建人 |
| created_at | timestamp | 创建时间 |

第一轮可以先沿用 HIS 现有菜单/按钮权限，不急着做这张表；等 Flow 面向更多业务角色开放后再补。

## API 设计

### Flow 列表

`GET /api/pivot-flows?status=&keyword=&mode=designer`

返回给编排员弹窗使用的数据。建议返回轻量列表：

```json
{
  "code": 0,
  "data": [
    {
      "id": "his-user-query-by-name",
      "name": "用户信息查询流程",
      "description": "按姓名查询 HIS 用户",
      "status": "published",
      "draftVersion": 3,
      "publishedVersion": 2,
      "nodeCount": 3,
      "edgeCount": 2,
      "updatedAt": "2026-07-20T10:00:00Z",
      "publishedAt": "2026-07-20T10:05:00Z"
    }
  ]
}
```

### Flow 详情

`GET /api/pivot-flows/:id`

返回完整 Flow JSON，给画布加载。

要求：

- 服务端解出 `definition`
- 补齐 `id/status/updatedAt/publishedAt`
- 返回前做基本 JSON 格式校验

### 保存草稿

`POST /api/pivot-flows`

创建新 Flow。

`PUT /api/pivot-flows/:id`

更新草稿。

要求：

- 保存前校验 Flow JSON
- 校验节点 ID 唯一
- 校验边 from/to 存在
- 校验禁止循环
- 校验非法连接
- 校验节点属性 JSON 不为空/格式合法
- 更新 `draft_version`
- 不改变 `published_version`

### 发布

`POST /api/pivot-flows/:id/publish`

请求体：

```json
{
  "changeSummary": "调整用户查询后的人工选择逻辑"
}
```

服务端动作：

1. 读取当前草稿 Flow。
2. 执行完整发布校验。
3. 生成 `nextVersion = published_version + 1`。
4. 写入 `pivot_flow_versions`。
5. 更新 `pivot_flows.status = published`、`published_version`、`published_at`、`published_by`。
6. 返回发布后的 Flow 和版本号。

### 运行

后续建议增加真正运行接口：

`POST /api/pivot-flows/:id/run`

普通使用者调用它，而不是让前端直接运行完整业务逻辑。

请求体：

```json
{
  "prompt": "查询张三的信息",
  "params": {
    "name": "张三"
  }
}
```

服务端动作：

1. 读取 `published_version` 对应版本。
2. 做权限校验。
3. 执行 Flow 或调用运行服务。
4. 写入 `pivot_flow_runs`。
5. 返回最终展示数据。

第一轮可以先保留当前前端 mock runtime，只把保存、加载、发布链路打通。

## 前端设计

### FlowWorkbench 通用能力

在 `@kupola/pivot-flow` 的 `FlowWorkbench` 中增加通用入口，而不是只在 HIS 页面手写。

建议新增能力：

- 工具栏增加“流程”按钮，点击打开 Kupola Dialog。
- Dialog 内显示 Flow List。
- 支持搜索、状态筛选、刷新。
- 点击 Flow item 后调用 `onLoadFlow(flow)` 或内置 `flowStore.get(id)` 加载到画布。
- 加载前后执行校验，失败则显示错误，不污染当前画布。
- 加载成功后关闭弹窗，画布显示该 Flow 的节点、连线、属性。
- 支持 `onSaveFlow(flow)` 和 `onPublishFlow(flow)` 扩展点，业务系统接自己的 API。

建议 API 形态：

```js
FlowWorkbench({
  target,
  flow,
  flowStore: {
    list: async (query) => [],
    get: async (id) => flow,
    save: async (flow) => flow,
    publish: async (flow, options) => flow
  },
  showFlowList: true
})
```

### HIS 页面接入

`his-web/js/pages/his-flow-designer.js` 需要：

- 接入 `flowStore`
- `list` 调用 `GET /api/pivot-flows`
- `get` 调用 `GET /api/pivot-flows/:id`
- `save` 调用 `POST/PUT /api/pivot-flows`
- `publish` 调用 `POST /api/pivot-flows/:id/publish`
- 加载 Flow 后仍使用 HIS 的 `nodeTypes`、`nodeTypeLabels`、`runtimeFactory`

## 校验要求

加载到画布前必须确认：

- `flow.id` 存在
- `flow.nodes` 是数组
- `flow.edges` 是数组
- 节点 ID 唯一
- 边的 `from/to` 都存在
- 边不形成环
- 边端口合法
- 节点类型存在于默认节点或业务扩展节点中
- 节点属性 `params` 是对象
- 节点 `ui.position` 缺失时自动补默认位置

发布前额外确认：

- 高风险节点必须有确认策略
- 写操作节点需要权限
- capability 必须在 HIS 允许列表内
- 子流程引用的 Flow 必须存在且已发布
- 输出节点至少有一个，避免运行后无结果

## 实现顺序

### 第 1 轮：文档与现状对齐

- [x] 完成本文档。
- [x] 确认现有 HIS 表和接口缺口。
- [x] 不修改功能代码。

### 第 2 轮：补后端数据模型和 API

- [x] 增加 `PivotFlowVersion` 模型。
- [x] 扩展 `PivotFlow` 字段：版本、负责人、发布人。
- [x] 扩展 `PivotFlowRun` 字段：版本、输入、输出、trace、耗时。
- [x] 调整 `HandleList` 返回轻量列表摘要。
- [x] 调整 `HandleGet` 返回完整 Flow。
- [x] 调整 `HandleUpdate` 保存草稿并递增 draft version。
- [x] 调整 `HandlePublish` 写入 `pivot_flow_versions`。
- [x] 增加必要测试或最小 API 验证。

### 第 3 轮：封装 Flow List UI 到 pivot-flow

- [x] 在 `FlowWorkbench` 增加“流程”按钮。
- [x] 使用 Kupola Dialog 实现 Flow List 弹窗。
- [x] 增加 list/search/status/loading/error/empty 状态。
- [x] 增加 `flowStore` 接口。
- [x] 加载 Flow 前后校验，成功后刷新画布。
- [x] 增加测试。

### 第 4 轮：HIS 接入 Flow Store

- [x] `his-flow-designer.js` 接入后端 API。
- [x] 保存草稿按钮接 `save`。
- [x] 发布按钮接 `publish`。
- [x] 流程弹窗选择 Flow 后加载到画布。
- [x] HIS 页面验证加载后节点、连接、属性都正常。

### 第 5 轮：运行与审计闭环

- 普通使用者运行已发布 Flow。
- 运行记录写入 `pivot_flow_runs`。
- 后续再做 Flow 权限表、回滚、发布对比、运行历史详情。

## 第一阶段验收标准

1. 编排员能保存当前画布 Flow 到数据库。
2. 编排员能从画布打开 Flow List 弹窗。
3. Flow List 能显示已保存 Flow。
4. 点击 Flow 后能加载到画布。
5. 加载后节点位置、节点属性、连接线保持正常。
6. 修改后能保存草稿。
7. 发布后生成独立版本记录。
8. HIS 构建通过。
9. 不发布 npm，除非 FlowWorkbench 通用能力变更需要被 HIS 通过 npm 消费。

## 风险和决策

- 当前 HIS 已有 `pivot_flows` 基础表，不能直接推倒重来，应做兼容扩展。
- Flow List UI 应放在 `@kupola/pivot-flow`，否则每个业务系统都会重复实现。
- 具体数据权限、业务运行能力放在 HIS 后端，不放 npm 包。
- 第一轮后端可以继续用 `definition text`，PostgreSQL 场景后续可迁移到 `jsonb` 以便查询。
- 发布版本表必须独立存在，否则历史运行无法稳定复现。
