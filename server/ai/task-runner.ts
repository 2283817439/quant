import { appendLog, getTask, markCancelled, StrategyTaskRecord, updateTask } from "./task-store";
import { runStrategyLifecycle } from "./workflows/strategy-lifecycle";

class StrategyTaskRunner {
  private queue: string[] = [];
  private running = false;

  enqueue(taskId: string) {
    this.queue.push(taskId);
    void this.pump();
  }

  cancel(taskId: string) {
    markCancelled(taskId);
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const taskId = this.queue.shift()!;
        const record = getTask(taskId);
        if (!record || record.cancelled) continue;
        await this.execute(record);
      }
    } finally {
      this.running = false;
    }
  }

  private async execute(task: StrategyTaskRecord) {
    try {
      await runStrategyLifecycle(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(task.id, `任务失败：${message}`);
      updateTask(task.id, { status: "failed", error: message });
    }
  }
}

export const strategyTaskRunner = new StrategyTaskRunner();
