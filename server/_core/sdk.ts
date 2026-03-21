/**
 * SDK 模块 - 已禁用 OAuth 认证功能
 * 本地开发环境使用，无需集成 OAuth
 */

// OAuth 相关功能已禁用
// 所有认证相关的方法都不再使用

export const sdk = {
  // 占位方法，保持 API 兼容性但不执行任何操作
  authenticateRequest: async () => {
    throw new Error("Authentication is disabled for local development");
  },
  verifySession: async () => {
    return null;
  },
  createSessionToken: async () => {
    throw new Error("Session creation is disabled for local development");
  },
};
