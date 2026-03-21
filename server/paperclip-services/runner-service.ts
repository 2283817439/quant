import { getDb } from '../db';
import { runners } from '../../drizzle/paperclip-schema';
import { eq, and, asc } from 'drizzle-orm';

export interface CreateRunnerOptions {
  companyId: number;
  name: string;
  type: 'local' | 'docker' | 'kubernetes' | 'lambda';
  config?: any;
  capacity?: number;
}

export interface UpdateRunnerOptions {
  runnerId: number;
  name?: string;
  status?: 'online' | 'offline' | 'busy' | 'error';
  config?: any;
  capacity?: number;
  currentLoad?: number;
}

export async function createRunner(options: CreateRunnerOptions) {
  const { companyId, name, type, config, capacity = 1 } = options;
  const db = await getDb();

  const [runner] = await db.insert(runners).values({
    companyId,
    name,
    type,
    status: 'offline',
    config,
    capacity,
    currentLoad: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();

  return runner;
}

export async function listRunners(companyId: number) {
  const db = await getDb();
  const results = await db
    .select()
    .from(runners)
    .where(eq(runners.companyId, companyId));

  return results;
}

export async function getRunner(runnerId: number) {
  const db = await getDb();
  const [runner] = await db
    .select()
    .from(runners)
    .where(eq(runners.id, runnerId))
    .limit(1);

  return runner;
}

export async function updateRunner(options: UpdateRunnerOptions) {
  const { runnerId, ...updates } = options;
  const db = await getDb();

  const [runner] = await db
    .update(runners)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(runners.id, runnerId))
    .returning();

  return runner;
}

export async function deleteRunner(runnerId: number) {
  const db = await getDb();
  await db.delete(runners).where(eq(runners.id, runnerId));
}

export async function updateRunnerHeartbeat(runnerId: number) {
  const db = await getDb();
  await db
    .update(runners)
    .set({
      lastHeartbeat: new Date(),
      status: 'online',
      updatedAt: new Date()
    })
    .where(eq(runners.id, runnerId));
}

export async function getAvailableRunner(companyId: number) {
  const db = await getDb();
  const [runner] = await db
    .select()
    .from(runners)
    .where(
      and(
        eq(runners.companyId, companyId),
        eq(runners.status, 'online')
      )
    )
    .orderBy(asc(runners.currentLoad))
    .limit(1);

  return runner;
}

export async function incrementRunnerLoad(runnerId: number) {
  const db = await getDb();
  await db.execute(`UPDATE pc_runners SET currentLoad = currentLoad + 1, status = 'busy', updatedAt = NOW() WHERE id = ${runnerId}`);
}

export async function decrementRunnerLoad(runnerId: number) {
  const db = await getDb();
  const [runner] = await db
    .select()
    .from(runners)
    .where(eq(runners.id, runnerId))
    .limit(1);

  if (!runner) return;

  const newLoad = Math.max(0, runner.currentLoad - 1);
  const newStatus = newLoad === 0 ? 'online' : 'busy';

  await db
    .update(runners)
    .set({
      currentLoad: newLoad,
      status: newStatus,
      updatedAt: new Date()
    })
    .where(eq(runners.id, runnerId));
}
