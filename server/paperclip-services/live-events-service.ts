/**
 * Paperclip Live Events 服务
 * 基于 EventEmitter 的实时事件推送
 */

import { EventEmitter } from "events";

export interface LiveEvent {
  type: string;
  companyId: number;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

class LiveEventsService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // 支持更多监听器
  }

  /**
   * 发布事件到指定公司
   */
  publish(event: LiveEvent) {
    const channelKey = `company:${event.companyId}`;
    this.emit(channelKey, event);

    // 也发布到全局频道
    this.emit("global", event);
  }

  /**
   * 订阅公司事件
   */
  subscribe(companyId: number, handler: (event: LiveEvent) => void) {
    const channelKey = `company:${companyId}`;
    this.on(channelKey, handler);

    return () => {
      this.off(channelKey, handler);
    };
  }

  /**
   * 订阅全局事件
   */
  subscribeGlobal(handler: (event: LiveEvent) => void) {
    this.on("global", handler);

    return () => {
      this.off("global", handler);
    };
  }

  /**
   * 发布 Agent 状态变更事件
   */
  publishAgentStatusChange(companyId: number, agentId: number, oldStatus: string, newStatus: string) {
    this.publish({
      type: "agent.status_changed",
      companyId,
      entityType: "agent",
      entityId: agentId.toString(),
      data: { oldStatus, newStatus },
      timestamp: new Date(),
    });
  }

  /**
   * 发布任务状态变更事件
   */
  publishTaskStatusChange(companyId: number, taskId: number, oldStatus: string, newStatus: string) {
    this.publish({
      type: "task.status_changed",
      companyId,
      entityType: "task",
      entityId: taskId.toString(),
      data: { oldStatus, newStatus },
      timestamp: new Date(),
    });
  }

  /**
   * 发布成本事件
   */
  publishCostEvent(companyId: number, agentId: number, costCents: number) {
    this.publish({
      type: "cost.reported",
      companyId,
      entityType: "agent",
      entityId: agentId.toString(),
      data: { costCents },
      timestamp: new Date(),
    });
  }

  /**
   * 发布审批请求事件
   */
  publishApprovalRequest(companyId: number, approvalId: number, approvalType: string) {
    this.publish({
      type: "approval.requested",
      companyId,
      entityType: "approval",
      entityId: approvalId.toString(),
      data: { approvalType },
      timestamp: new Date(),
    });
  }
}

// 单例实例
export const liveEventsService = new LiveEventsService();

// 辅助函数：在服务中调用以发布事件
export function publishLiveEvent(event: LiveEvent) {
  liveEventsService.publish(event);
}
