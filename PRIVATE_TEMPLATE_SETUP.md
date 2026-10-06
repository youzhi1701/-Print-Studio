# 私有模板账户部署配置

超级打印的私人模板库使用 Vercel Serverless API + Redis REST 存储。

## 必填环境变量

在 Vercel 项目 Settings -> Environment Variables 中配置：

- SESSION_SECRET
  - 至少 24 个字符
  - 用于签名登录会话
  - 建议使用随机 32~64 字节字符串

- KV_REST_API_URL
- KV_REST_API_TOKEN

也兼容：
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN

Redis 可使用 Vercel Marketplace 中提供 Redis REST 接口的存储服务，或其他 Upstash REST 兼容实例。

## 身份识别方式

### 飞书内自动识别

插件在飞书内打开时，优先使用：

- bitable.bridge.getBaseUserId()
- bitable.bridge.getTenantKey()

自动识别当前飞书用户，并映射为超级打印自己的稳定 user_id。

### 手机号直接识别

不使用短信验证码。

用户直接输入手机号即可进入对应的私人模板账户：

- 首次使用：自动建立手机号与 user_id 的映射。
- 已有账户：直接读取该手机号对应的私人模板库。
- 如果当前已经通过飞书身份登录，首次输入一个尚未绑定的手机号，会把该手机号绑定到当前账户。
- 手机号不会作为模板 owner_id，服务端仍使用随机 user_id 隔离模板。
- 服务端仅保存手机号 hash 和脱敏显示值。

注意：这种模式是“手机号识别”，不是“手机号所有权验证”。知道某个手机号的人理论上可以尝试进入该手机号账户，因此适合当前以使用便利为优先的内部工具场景。

## 数据隔离

- 内置模板：跟随程序代码，不进入私人云。
- 自定义模板：只保存在当前账户 owner_id 下。
- owner_id 由后端生成 UUID，不使用手机号明文。
- 模板 API 不接受客户端传入 owner_id，始终从服务端会话中读取当前用户。
- 删除模板使用 tombstone 时间戳，避免旧设备把较新的模板误恢复。
- 旧的飞书多维表格公共模板库逻辑已经停用。

## 健康检查

部署后访问：

`/api/health`

正常示例：

```json
{
  "sessionConfigured": true,
  "storageConfigured": true,
  "storageReady": true
}
```

三个字段都为 true 时，账户与私人模板后端已就绪。
