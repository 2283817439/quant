from __future__ import annotations

import json
import socket
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from services.coordination.locks import LockHandle
from services.task_queue.models import QueuedTask, TaskFailure, TaskState


class RedisLockManager:
    """Redis lock manager using atomic Lua compare-and-renew scripts."""

    def __init__(self, url: str = "redis://localhost:6379/0", prefix: str = "quant:lock:") -> None:
        try:
            import redis
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Redis support requires redis-py") from exc
        self.client = redis.Redis.from_url(url, decode_responses=True)
        self.prefix = prefix
        self._renew = """if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end"""
        self._release = """if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end"""

    def acquire(self, name: str, owner: str | None = None, lease_seconds: int = 30) -> LockHandle | None:
        owner = owner or f"{socket.gethostname()}:{uuid.uuid4()}"; token = int(self.client.incr(f"{self.prefix}{name}:fence"))
        value = f"{owner}:{token}"; until = datetime.now(timezone.utc) + timedelta(seconds=max(1, lease_seconds))
        if not self.client.set(f"{self.prefix}{name}", value, nx=True, px=max(1000, lease_seconds * 1000)):
            return None
        return LockHandle(name, owner, token, until)

    def renew(self, handle: LockHandle, lease_seconds: int = 30) -> LockHandle | None:
        key = f"{self.prefix}{handle.name}"; value = f"{handle.owner}:{handle.fencing_token}"
        result = self.client.eval(self._renew, 1, key, value, max(1000, lease_seconds * 1000))
        if not result:
            return None
        return LockHandle(handle.name, handle.owner, handle.fencing_token, datetime.now(timezone.utc) + timedelta(seconds=lease_seconds))

    def release(self, handle: LockHandle) -> bool:
        key = f"{self.prefix}{handle.name}"; value = f"{handle.owner}:{handle.fencing_token}"
        return bool(self.client.eval(self._release, 1, key, value))


class RedisTaskQueue:
    """Redis sorted-set queue with atomic claims, leases, and fencing tokens."""

    def __init__(self, url: str = "redis://localhost:6379/0", prefix: str = "quant:queue:", observer: Any | None = None) -> None:
        try:
            import redis
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("Redis support requires redis-py") from exc
        self.client = redis.Redis.from_url(url, decode_responses=True)
        self.prefix = prefix
        self.observer = observer
        self.ready_key = f"{prefix}ready"
        self.active_key = f"{prefix}active"
        self.fence_key = f"{prefix}fence"
        self._claim = """local expired=redis.call('ZRANGE',KEYS[4],'-inf',ARGV[1],'BYSCORE'); for _,eid in ipairs(expired) do local ek=KEYS[2]..eid; if redis.call('HGET',ek,'state')=='running' then redis.call('HSET',ek,'state','retry_wait','worker_id','','lease_token',''); redis.call('ZADD',KEYS[1],ARGV[1],eid) end; redis.call('ZREM',KEYS[4],eid) end; local ids=redis.call('ZRANGE',KEYS[1],'-inf',ARGV[1],'BYSCORE','LIMIT',0,1); if #ids==0 then return nil end; local id=ids[1]; redis.call('ZREM',KEYS[1],id); local key=KEYS[2]..id; local token=redis.call('INCR',KEYS[3]); local attempts=redis.call('HINCRBY',key,'attempts',1); redis.call('HSET',key,'state','running','worker_id',ARGV[2],'lease_token',token,'lease_until',ARGV[3]); redis.call('ZADD',KEYS[4],ARGV[3],id); return {id,token,attempts,redis.call('HGET',key,'task_type'),redis.call('HGET',key,'payload_json'),redis.call('HGET',key,'max_attempts'),redis.call('HGET',key,'available_at'),ARGV[3]}"""
        self._complete = """if redis.call('HGET',KEYS[1],'state')~='running' or redis.call('HGET',KEYS[1],'worker_id')~=ARGV[2] or redis.call('HGET',KEYS[1],'lease_token')~=ARGV[3] then return 0 end; redis.call('HSET',KEYS[1],'state','succeeded','result_json',ARGV[4],'worker_id','','lease_token',''); redis.call('ZREM',KEYS[2],ARGV[1]); return 1"""
        self._fail = """if redis.call('HGET',KEYS[1],'state')~='running' or redis.call('HGET',KEYS[1],'worker_id')~=ARGV[2] or redis.call('HGET',KEYS[1],'lease_token')~=ARGV[3] then return 0 end; local attempts=tonumber(redis.call('HGET',KEYS[1],'attempts')); local maximum=tonumber(redis.call('HGET',KEYS[1],'max_attempts')); local retry=attempts<maximum; local state=retry and 'retry_wait' or 'dead_letter'; redis.call('HSET',KEYS[1],'state',state,'error',ARGV[4],'worker_id','','lease_token','','available_at',ARGV[5]); redis.call('ZREM',KEYS[2],ARGV[1]); if retry then redis.call('ZADD',KEYS[3],ARGV[5],ARGV[1]) end; return attempts"""

    def _key(self, task_id: str) -> str:
        return f"{self.prefix}task:{task_id}"

    def enqueue(self, task_type: str, payload: dict[str, Any], max_attempts: int = 3,
                available_at: datetime | None = None, task_id: str | None = None) -> str:
        task_id = task_id or str(uuid.uuid4()); available_at = available_at or datetime.now(timezone.utc); key = self._key(task_id)
        pipe = self.client.pipeline()
        pipe.hsetnx(key, "task_type", task_type); pipe.hsetnx(key, "payload_json", json.dumps(payload, sort_keys=True)); pipe.hsetnx(key, "state", "queued")
        pipe.hsetnx(key, "attempts", 0); pipe.hsetnx(key, "max_attempts", max(1, max_attempts)); pipe.hsetnx(key, "available_at", available_at.timestamp()); pipe.zadd(self.ready_key, {task_id: available_at.timestamp()}); pipe.execute()
        return task_id

    def claim(self, worker_id: str, lease_seconds: int = 60) -> QueuedTask | None:
        now = time.time(); until = now + lease_seconds
        raw = self.client.eval(self._claim, 4, self.ready_key, f"{self.prefix}task:", self.fence_key, self.active_key, now, worker_id, until)
        if not raw:
            return None
        task_id, token, attempts, task_type, payload, max_attempts, available_at, lease_until = raw
        task = QueuedTask(str(task_id), task_type, json.loads(payload), int(attempts), int(max_attempts), datetime.fromtimestamp(float(available_at), timezone.utc), datetime.fromtimestamp(float(lease_until), timezone.utc), str(token))
        if self.observer:
            self.observer.lease_claimed(task.id, worker_id, task.lease_token)
        return task

    def complete(self, task_id: str, worker_id: str, result: Any = None, lease_token: str | None = None) -> None:
        key = self._key(task_id)
        if lease_token is None:
            raise RuntimeError(f"task lease lost or fenced: {task_id}")
        ok = self.client.eval(self._complete, 2, key, self.active_key, task_id, worker_id, str(lease_token), json.dumps(result, default=str))
        if not ok:
            raise RuntimeError(f"task lease lost or fenced: {task_id}")
        if self.observer:
            self.observer.lease_completed(task_id, worker_id, "succeeded")

    def fail(self, task_id: str, worker_id: str, error: str, retry_delay_seconds: int = 5, lease_token: str | None = None) -> TaskFailure:
        key = self._key(task_id)
        if lease_token is None:
            raise RuntimeError(f"task lease lost or fenced: {task_id}")
        available = time.time() + max(0, retry_delay_seconds)
        attempts = self.client.eval(self._fail, 3, key, self.active_key, self.ready_key, task_id, worker_id, str(lease_token), error[:4000], available)
        if not attempts:
            raise RuntimeError(f"task lease lost or fenced: {task_id}")
        current = self.client.hgetall(key); retrying = current.get("state") == "retry_wait"
        if self.observer:
            self.observer.lease_completed(task_id, worker_id, "retry_wait" if retrying else "dead_letter")
        return TaskFailure(task_id, error[:4000], attempts, retrying)
