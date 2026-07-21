# PLAN7: HIS Flow Capability Registry 与业务能力治理

## 目标

解决 `his-flow-designer.js` 中手工注册大量业务能力的问题。

下一阶段要把“页面装配”和“业务能力注册”拆开，让流程设计器只负责画布、策略列表、运行结果和交互入口；业务能力由独立模块或后端能力目录提供。

最终目标是：

- 编排人员选择通用节点和业务能力，不需要关心页面 JS 里有没有手写实现。
- HIS 一张业务表有多个 CRUD 能力时，不把这些实现堆在页面文件里。
- `@kupola/pivot-flow` 继续保持通用，不绑定 HIS 业务表。
- HIS 后端逐步成为 capability registry 和真实执行入口。

## 背景

当前 `his-flow-designer.js` 为了让示例流程跑通，直接注册了：

- `user.query`
- `org.query`
- `user.create`
- `flow.subflow.run`
- `custom.capability`
- 前端交互能力：`human.select`、`ui.display`、`message.show`、`table.refresh`

这种方式可以验证链路，但不适合真实业务扩展。

问题是：

- 页面文件会越来越大。
- 一张表的 CRUD、状态切换、角色绑定、批量操作都会变成页面级代码。
- 能力 schema、权限、风险等级、说明文档难以统一治理。
- 编排器无法从服务端动态知道“当前系统可用哪些能力”。
- 普通用户运行正式流程时，写操作长期放在前端执行不合适。

## 核心判断

`capability` 不应该等于“页面里写一个函数”。

它应该是业务系统对流程引擎开放的稳定能力契约：

```text
capability name
  -> params schema
  -> permission
  -> risk level
  -> executor
  -> result schema
```

前端设计器需要这些信息来展示、校验和辅助编排；运行时需要这些信息来安全执行。

## 分层设计

### 1. 页面层

文件：

- `his-web/js/pages/his-flow-designer.js`

职责：

- 初始化 `FlowWorkbench`
- 接入策略列表 `flowStore`
- 控制策略面板、组件面板、属性面板互斥
- 展示运行结果
- 传入 runtime factory

不应该承担：

- 每张业务表的 CRUD 实现
- 大量 capability 注册逻辑
- 业务 API 参数拼装
- 业务权限和风险治理

### 2. 前端能力模块层

建议新增：

- `his-web/js/flow/capability-registry.js`
- `his-web/js/flow/frontend-capabilities.js`
- `his-web/js/flow/resource-capabilities.js`

职责：

- 集中注册 HIS 前端可执行能力
- 按业务域拆分能力定义
- 从后端加载 capability metadata
- 给设计器提供能力清单、参数 schema、风险等级和说明文档

示例结构：

```text
his-web/js/flow/
  capability-registry.js
  frontend-capabilities.js
  resources/
    user-capabilities.js
    organization-capabilities.js
    role-capabilities.js
    material-capabilities.js
```

短期可以先用前端静态模块；中期逐步切到后端动态 registry。

### 3. 后端能力目录层

建议 HIS 后端新增 capability registry API。

示例接口：

```text
GET /api/pivot-capabilities
GET /api/pivot-capabilities/:name
POST /api/pivot-capabilities/:name/execute
```

能力元数据示例：

```json
{
  "name": "user.create",
  "title": "创建用户",
  "resource": "users",
  "action": "create",
  "risk": "medium",
  "permissions": ["system:user:create"],
  "paramsSchema": {
    "username": { "type": "string", "required": true },
    "password": { "type": "string", "required": true, "sensitive": true },
    "real_name": { "type": "string" },
    "org_id": { "type": "number", "required": true },
    "org_type": { "type": "string", "required": true }
  },
  "resultSchema": {
    "id": { "type": "number" },
    "username": { "type": "string" },
    "status": { "type": "number" }
  },
  "description": "创建 HIS 用户"
}
```

### 4. 后端执行层

正式运行写操作时，推荐由后端执行 Flow，而不是前端直接执行。

建议接口：

```text
POST /api/pivot-flows/:id/run
```

后端动作：

- 读取已发布版本
- 校验当前用户是否有运行权限
- 校验节点 capability 是否允许
- 执行真实业务能力
- 写入运行记录和审计日志
- 返回统一输出结果

前端设计器保留 preview/mock 能力，用于编排调试；普通用户正式运行走后端。

## 能力命名规范

推荐格式：

```text
resource.action
domain.resource.action
```

示例：

- `user.query`
- `user.create`
- `user.update`
- `user.delete`
- `user.status.update`
- `user.role.assign`
- `organization.query`
- `organization.create`
- `material.query`
- `material.create`

不建议：

- `createUser`
- `doUserCreate`
- `testCreate`
- `crud1`

## CRUD 能力是否需要全部封装

需要封装，但不应该全部写在页面文件里。

一张表通常会有：

- 查询列表：`resource.query`
- 获取详情：`resource.get`
- 新增：`resource.create`
- 修改：`resource.update`
- 删除：`resource.delete`
- 状态切换：`resource.status.update`
- 批量操作：`resource.batch.*`

这些能力应该由业务系统统一注册或由后端 registry 暴露。

流程节点仍然保持通用：

- `data.query`
- `data.get`
- `data.create`
- `data.update`
- `data.delete`
- `capability.call`

业务差异放在：

- `capability`
- `params`
- `resource schema`
- `permission`
- `risk`

## 与节点设计的关系

节点类型不要随业务表膨胀。

错误方向：

```text
queryUserNode
createUserNode
updateUserNode
deleteUserNode
queryMaterialNode
createMaterialNode
```

正确方向：

```text
data.query + capability: user.query
data.create + capability: user.create
data.update + capability: material.update
data.delete + capability: material.delete
```

节点是通用的，能力是业务系统提供的。

## 第一阶段实现计划

### 1. 拆分前端能力注册模块

在 HIS 中新增：

```text
his-web/js/flow/capability-registry.js
```

迁移 `his-flow-designer.js` 中已有能力：

- `user.query`
- `org.query`
- `user.create`
- `flow.subflow.run`
- `custom.capability`
- 前端展示和交互能力

页面只保留：

```js
runtimeFactory: (api) => createHisFlowRuntime(api)
```

### 2. 按业务域拆文件

建议第一批：

```text
his-web/js/flow/resources/user-capabilities.js
his-web/js/flow/resources/organization-capabilities.js
his-web/js/flow/frontend-capabilities.js
```

后续再补：

- role
- department
- material
- supplier
- purchase-order

### 3. 定义 capability metadata

每个能力至少包含：

- `name`
- `resource`
- `action`
- `risk`
- `description`
- `permissions`
- `paramsSchema`
- `execute`

如果没有 `execute`，则只能用于设计期展示，不能在前端 preview 中直接运行。

### 4. 设计器读取能力清单

`his-flow-designer.js` 初始化时把 capability metadata 传给 `FlowWorkbench`。

用途：

- 属性面板展示能力说明
- 节点帮助弹窗显示能力用途
- AI 草稿生成时推荐能力
- 发布前校验能力是否存在

## 第二阶段实现计划

### 1. HIS 后端新增 capability registry API

建议先提供只读接口：

```text
GET /api/pivot-capabilities
```

返回当前系统允许暴露给流程编排器的能力。

### 2. 后端校验发布流程

发布时校验：

- capability 是否存在
- 当前编排员是否有使用该 capability 的权限
- 高风险能力是否配置确认
- 写操作是否具备审计要求
- params 是否满足 schema

### 3. 前端从后端加载 metadata

前端不再手写全部 schema，而是：

```text
load capability metadata
  -> build registry
  -> register preview executors
  -> pass metadata to workbench
```

## 第三阶段实现计划

### 1. 后端执行正式流程

新增：

```text
POST /api/pivot-flows/:id/run
```

普通用户只调用这个接口运行已发布流程。

### 2. 区分 preview 和 production executor

preview：

- 编排器页面使用
- 可以 mock 或调用有限 API
- 便于调试

production：

- 后端执行
- 权限、审计、事务、幂等、风险控制完整

### 3. 支持资源 schema

后端暴露：

```text
GET /api/pivot-resources
```

用于描述：

- resource 字段
- relations/include
- 可查询字段
- 可写字段
- 字段类型
- 敏感字段

## 验收标准

第一阶段完成后：

- `his-flow-designer.js` 不再直接堆业务 capability 注册。
- 创建用户流程不再因为 `user.create` 未注册失败。
- 用户、组织相关能力移动到独立模块。
- 前端构建通过。
- 现有策略列表加载和运行不回退。

第二阶段完成后：

- HIS 后端能返回 capability metadata。
- 发布流程前能校验 capability 是否存在。
- 编排器能展示后端能力说明和参数 schema。

第三阶段完成后：

- 普通用户正式运行流程走后端。
- 写操作不再依赖前端 JS 直接执行。
- 运行记录、权限、审计闭环。

## 当前完成状态

### 已完成

- 第一阶段已完成：
  - `his-flow-designer.js` 已移除直接堆叠的业务 capability 注册。
  - HIS 前端已新增 `his-web/js/flow/capability-registry.js`。
  - HIS 前端已新增 `his-web/js/flow/frontend-capabilities.js`。
  - HIS 前端已新增 `his-web/js/flow/resources/user-capabilities.js`。
  - HIS 前端已新增 `his-web/js/flow/resources/organization-capabilities.js`。
  - `user.query`、`user.create`、`org.query`、前端展示/选择/刷新能力已迁移到独立模块。
- 第二阶段第一批已完成：
  - HIS 后端已新增 `GET /api/pivot-capabilities`。
  - HIS 后端已新增 `GET /api/pivot-capabilities/:name`。
  - capability metadata 已包含 `name/title/resource/action/risk/description/permissions/paramsSchema/resultSchema/requiresConfirmation/groupOnly/canUse`。
  - HIS 前端设计器已接入后端 capability metadata 加载。
  - `FlowWorkbench` 已通过 `capabilities` 接收后端能力元数据。
- 第二阶段已完成：
  - 后端发布流程时已按 capability metadata 做参数 schema 校验。
  - 前端属性面板已展示后端 capability 标题、说明、权限、风险、确认要求和可用状态。
- 第三阶段第一批已完成：
  - HIS 后端已新增 `POST /api/pivot-flows/:id/run`。
  - 正式运行只读取已发布 Flow 和不可变发布版本。
  - 运行时校验 capability allowlist、运行用户权限和集团专属能力约束。
  - 已支持 `org.query`、`user.query`、`user.create`、`human.select`、`ui.display`、`message.show`、`table.refresh`、`flow.subflow.run`、`custom.capability` 和输出节点的第一版执行。
  - 运行记录写入 `pivot_flow_runs`，并保存脱敏后的 input/result/trace。
  - HIS 前端运行按钮已优先调用后端正式运行接口，并兼容显示后端错误 trace。
- 第三阶段第二批已完成：
  - HIS 后端 executor 已扩展到用户、组织、角色、权限、物资的核心能力。
  - 已支持 `user.resolve`、`user.assignRoles`、`user.updateStatus`。
  - 已支持 `role.list`、`role.resolve`、`role.create`、`role.assignPermissions`。
  - 已支持 `permission.resolve`。
  - 已支持 `org.create`、`org.updateStatus`。
  - 已支持 `material.query`、`material.resolve`、`material.create`、`material.update`、`material.delete`。
  - HIS 后端已新增 `GET /api/pivot-resources` 和 `GET /api/pivot-resources/:name`。
  - 资源目录已覆盖 `users`、`organization`、`roles`、`permissions`、`materials` 的字段、关系、可查字段、可写字段、展示字段和敏感字段。
  - HIS 前端已加载 resource metadata，并在节点属性能力说明中展示资源字段信息。
- 第三阶段收口已完成：
  - HIS 前端已区分草稿调试与正式运行：未保存、未发布或无发布版本的策略不允许走正式后端执行，草稿调试使用预览。
  - `@kupola/pivot-flow` 的 `FlowWorkbench` 已支持基于 capability `paramsSchema` 的通用参数表单，并保留 JSON 参数文本框作为高级编辑入口。
  - HIS 已更新到 `@kupola/pivot-flow@0.3.5` 使用通用参数表单能力。
  - HIS 正式运行请求已包含 `mode`、`idempotencyKey` 和 `confirmations`。
  - HIS 后端正式执行已对写操作和高风险节点校验二次确认。
  - HIS 后端写操作流程已使用事务包裹，失败时回滚业务写入。
  - `pivot_flow_runs` 已扩展记录运行模式、幂等键和确认数据。

### 待继续

- PLAN7 主体已完成。后续新业务只需要按 capability registry 继续补资源 schema、能力 metadata 和后端 executor。

## 风险与决策

- 不要把 `@kupola/pivot-flow` 做成 HIS 业务能力库；它只负责通用 Flow 能力。
- 不要为每张表生成一堆节点类型；CRUD 差异用 capability 和 params 表达。
- 前端可以保留 preview executor，但不能替代后端正式执行。
- 能力 registry 是业务系统职责，不是 npm 包职责。
- 第一阶段先拆模块，不急着把所有 HIS 能力一次性补完。
