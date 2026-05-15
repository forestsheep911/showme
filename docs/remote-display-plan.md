# 远程展示房间计划

## 背景

ShowMe 当前已经支持本机输入和本机展示。但在家庭作业场景里，更理想的设备分工是：

- 家长用手机输入和调整内容。
- 孩子看电视、Pad、学习机或电脑上的大屏展示。

这样孩子不用拿着家长手机，家长也不用在展示设备旁边操作。只要两台设备都能打开浏览器，就可以完成“手机控制，大屏显示”。

## 核心想法

使用“新建房间 + 配对码”的方式连接控制端和展示端。

- 展示端新建房间，显示 6 位配对码。
- 手机端输入配对码，获得控制权限。
- 手机端修改文字和显示设置。
- 展示端实时读取房间状态并显示。

二维码可以作为辅助入口，但配对码是主路径。这样电视、学习机、没有摄像头权限的设备也能使用。

## 目标

- 大屏打开后可以快速创建展示房间。
- 手机输入 6 位配对码即可接管控制。
- 配对成功后，手机输入内容，大屏在 1 秒内更新。
- 不需要账号。
- 不长期保存孩子作业内容。
- 房间自动过期，减少隐私和维护负担。

## 非目标

- 不做多人协同编辑。
- 不做长期历史同步。
- 不做复杂权限系统。
- 不依赖同一个局域网。
- 第一版不做 WebSocket。

## 使用流程

### 展示端

1. 打开 ShowMe。
2. 选择“新建展示房间”。
3. 页面显示 6 位配对码，例如 `482 913`。
4. 页面提示“等待手机连接”。
5. 手机连接后，大屏进入展示模式。
6. 展示端只显示内容和极少量状态，不显示编辑输入框。

### 手机控制端

1. 手机打开 ShowMe。
2. 选择“连接展示屏”。
3. 输入展示端上的 6 位配对码。
4. 连接成功后进入控制页。
5. 手机端可以编辑文字、清空、调整字号、主题、字体和颜色。
6. 手机端的修改同步到展示端。

## 房间状态模型

```ts
type RoomState = {
  text: string
  fontSize: number
  fontFamily: string
  textColor: string
  isDarkMode: boolean
  updatedAt: string
}
```

```ts
type Room = {
  roomId: string
  pairCode: string
  controlTokenHash: string
  state: RoomState
  createdAt: string
  pairCodeExpiresAt: string
  roomExpiresAt: string
  displayLastSeenAt: string
  controllerLastSeenAt?: string
}
```

说明：

- `roomId` 是内部房间 ID，不需要让用户记忆。
- `pairCode` 是给用户看的 6 位数字。
- `controlToken` 只返回给成功配对的手机端，服务端只保存 hash。
- `pairCodeExpiresAt` 控制配对码有效期。
- `roomExpiresAt` 控制房间整体有效期。

## 配对规则

- 配对码使用 6 位数字，显示时可以分组为 `482 913`。
- 配对码有效期建议 10 分钟。
- 房间有效期建议 2 小时。
- 手机首次输入配对码后，服务端返回 `roomId` 和 `controlToken`。
- 后续手机修改房间状态必须带 `controlToken`。
- 展示端默认只读，不需要控制 token。
- 如果配对码过期但展示端仍在，可以允许展示端刷新配对码。

## API 草案

### 创建房间

`POST /api/rooms`

返回：

```ts
type CreateRoomResponse = {
  roomId: string
  pairCode: string
  pairCodeExpiresAt: string
  roomExpiresAt: string
}
```

### 使用配对码连接

`POST /api/rooms/pair`

请求：

```ts
type PairRoomRequest = {
  pairCode: string
}
```

返回：

```ts
type PairRoomResponse = {
  roomId: string
  controlToken: string
  state: RoomState
  roomExpiresAt: string
}
```

### 展示端读取状态

`GET /api/rooms/:roomId`

返回：

```ts
type GetRoomResponse = {
  state: RoomState
  roomExpiresAt: string
  controllerConnected: boolean
}
```

### 控制端更新状态

`PATCH /api/rooms/:roomId`

请求头：

```text
x-showme-control-token: <controlToken>
```

请求：

```ts
type UpdateRoomRequest = {
  state: Partial<RoomState>
}
```

返回：

```ts
type UpdateRoomResponse = {
  state: RoomState
  updatedAt: string
}
```

### 展示端刷新配对码

`POST /api/rooms/:roomId/pair-code`

返回新的配对码和过期时间。展示端使用，第一版可以先不做，过期后让用户重建房间也可以。

## 同步策略

第一版使用轮询。

展示端：

- 每 750ms 到 1000ms 请求一次 `GET /api/rooms/:roomId`。
- 如果房间过期，显示“房间已过期，请重新创建”。
- 如果请求失败，保留最后一次内容并显示轻量连接状态。

手机端：

- 输入内容时做节流更新，建议 250ms 到 400ms。
- 字号、主题、颜色等按钮操作可以立即更新。
- 更新失败时提示“未同步”，但保留手机端输入内容。

为什么第一版不用 WebSocket：

- 数据量很小。
- 场景是单控制端、单展示端。
- 轮询更容易部署和调试。
- Azure Static Web Apps + Functions 下实现成本更低。

## 前端路由建议

第一版可以在纯前端里用查询参数或 hash 路由，避免引入路由库。

- `/`：单机模式入口。
- `/?mode=display`：展示端创建或等待房间。
- `/?room=<roomId>`：展示端房间显示页。
- `/?mode=control`：手机输入配对码。
- `/?control=<roomId>`：手机控制页，token 存在 session storage。

后续如果路由变多，再考虑引入 React Router。

## 页面结构建议

### 首页

保留单机模式，并增加两个入口：

- “本机输入展示”
- “新建展示房间”
- “连接展示屏”

### 展示端等待页

重点显示：

- 大号配对码。
- 房间剩余可配对时间。
- 手机端打开网址或二维码辅助。
- 连接状态。

### 手机控制页

复用当前 `EditorPanel`、`Toolbar`、`SettingsSheet` 的逻辑，但展示区可以变成小预览。

重点是：

- 输入框始终好用。
- 同步状态明确。
- 不把大屏展示内容长期留存在本地。

## 后端存储建议

第一版需要一个短期共享状态存储。可选方案：

### 方案 A：Azure Functions 内存存储

优点：

- 实现最快。
- 适合本地验证。

缺点：

- 多实例或冷启动会丢房间。
- 生产环境不稳定。

适合：原型验证。

### 方案 B：Azure Table Storage

优点：

- 轻量、便宜、适合短期键值状态。
- 和 Azure Static Web Apps / Functions 搭配自然。

缺点：

- 需要配置连接字符串。
- 需要清理过期房间。

适合：第一版线上可用。

### 方案 C：Cosmos DB

优点：

- TTL 和查询能力更强。

缺点：

- 对当前需求偏重。

适合：以后需求变复杂再考虑。

建议：本地先用内存存储跑通，部署版使用 Azure Table Storage。

## 隐私和安全

- 不需要账号。
- 不长期保存内容。
- 房间自动过期。
- 控制端必须使用 `controlToken` 更新状态。
- 配对码只用于首次连接，过期后不能继续接管房间。
- 不在 URL 中暴露配对码对应的控制 token。
- 控制 token 存在手机端 `sessionStorage`，关闭页面后自然失效。

## 实施阶段

## 当前实现状态

已实现阶段 1 的本地原型：

- Vite 开发/预览服务内置 `/api/rooms` 内存房间 API。
- 展示端可以新建房间并显示 6 位配对码。
- 展示端创建成功后进入 `/?room=<roomId>`，同一台展示设备刷新时会继续打开该房间。
- 手机控制端可以输入配对码，获得控制 token。
- 控制端可以同步文字、字号、字体、颜色和主题。
- 展示端通过轮询读取房间状态。

限制：

- 当前房间存储在 Node 进程内存里，服务重启后会丢失。
- 只有创建房间的展示页会在当前浏览器会话里保留配对码和展示端控制 token；其他设备直接打开 `/?room=<roomId>` 目前只作为被动展示读取。
- 当前实现适合本地验证和原型演示，部署到 Azure Static Web Apps 生产环境前仍需接入 Functions API 和 Azure Table Storage。

## 实施阶段

### 阶段 1：本地原型

目标：证明“手机输入，大屏显示”交互闭环。

- 增加房间模式前端入口。
- 增加展示端等待页。
- 增加手机配对页。
- 增加手机控制页。
- 用内存 API 存储房间状态。
- 轮询同步文本和基础设置。

验收：

- 大屏创建房间后显示 6 位码。
- 手机输入配对码后进入控制页。
- 手机输入文字后，大屏 1 秒内更新。
- 手机调整字号和主题后，大屏同步变化。

### 阶段 2：部署可用

目标：让公网访问也能稳定使用。

- 后端存储切到 Azure Table Storage。
- 房间过期清理。
- 配对码过期处理。
- 基础错误提示。
- 防止配对码冲突。

验收：

- 两台不同网络设备可以配对。
- 几十分钟内稳定同步。
- 房间过期后不可继续读取或更新。

### 阶段 3：体验打磨

目标：减少家长操作负担。

- 展示端加入二维码辅助。
- 手机端显示连接状态。
- 展示端显示“已连接”状态。
- 手机端支持重新连接最近房间。
- 添加全屏展示提示。

验收：

- 不需要解释，用户能自己完成配对。
- 网络短暂失败后不会丢掉已输入内容。
- 电视或 Pad 上的等待页足够清楚。

## 第一轮推荐实现清单

1. 先确认 Azure Static Web Apps 的 Functions 目录结构。
2. 新增房间 API 的内存版实现。
3. 新增 `RoomMode` 相关前端状态和页面分支。
4. 新增展示端创建房间页面。
5. 新增手机配对页面。
6. 新增控制端页面，复用现有编辑和设置组件。
7. 展示端轮询房间状态。
8. 手机端节流 PATCH 更新。
9. 跑本地双标签页验证。
10. 再决定是否接 Azure Table Storage。
