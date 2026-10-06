# 私有模板账户部署配置

超级打印的私人模板库使用 Vercel Serverless API + Redis REST 存储。

## 必填环境变量

在 Vercel 项目 Settings -> Environment Variables 中配置：

- SESSION_SECRET
  - 至少 24 个字符
  - 用于签名登录会话和验证码摘要
  - 示例生成方式：随机 32~64 字节字符串

- KV_REST_API_URL
- KV_REST_API_TOKEN

也兼容：
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN

Redis 可使用 Vercel Marketplace 中提供 Redis REST 接口的存储服务，或其他 Upstash REST 兼容实例。

## 手机验证码（可选）

飞书内打开插件时，会优先使用：
- bitable.bridge.getBaseUserId()
- bitable.bridge.getTenantKey()

自动识别同一飞书用户。

如果还需要手机号绑定/独立网页登录，需要配置：

- SMS_WEBHOOK_URL
- SMS_WEBHOOK_TOKEN（可选）

超级打印会向 SMS_WEBHOOK_URL 发送：

```json
{
  "phone": "+8613800138000",
  "code": "123456",
  "purpose": "super-print-login"
}
```

短信服务返回 HTTP 2xx 即视为发送成功。

没有配置 SMS_WEBHOOK_URL 时，生产环境不会伪造验证码发送成功，界面会明确提示“短信验证码服务尚未配置”。

## 开发环境测试验证码

仅非 Production 环境可设置：

- ALLOW_DEV_OTP=1

此时 /api/auth/request-code 会在响应中返回 devCode，Production 环境不会返回。

## 数据隔离

- 内置模板：跟随程序代码，不进入私人云。
- 自定义模板：只保存在当前账户 owner_id 下。
- owner_id 由后端生成 UUID，不使用手机号明文。
- 手机号只保存 hash 和脱敏显示值。
- 模板 API 不接受客户端传入 owner_id，始终从服务端会话中读取当前用户。
- 删除模板使用 tombstone 时间戳，避免旧设备把较新的模板误恢复。

## 健康检查

部署后访问：

`/api/health`

正常示例：

```json
{
  "sessionConfigured": true,
  "storageConfigured": true,
  "storageReady": true,
  "smsConfigured": false
}
```

smsConfigured=false 不影响飞书身份自动登录，只影响手机号验证码登录/绑定。
