import { getDb } from '../db';
import { skills, agentSkills } from '../../drizzle/paperclip-schema';
import { eq, and, like, sql } from 'drizzle-orm';

export interface CreateSkillOptions {
  companyId: number;
  name: string;
  description?: string;
  category?: string;
  code: string;
  parameters?: any;
  version?: string;
  isPublic?: boolean;
  createdByUserId?: number;
}

export interface UpdateSkillOptions {
  skillId: number;
  name?: string;
  description?: string;
  category?: string;
  code?: string;
  parameters?: any;
  version?: string;
}

export interface ListSkillsOptions {
  companyId: number;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface EnableSkillForAgentOptions {
  agentId: number;
  skillId: number;
  config?: any;
}

export async function createSkill(options: CreateSkillOptions) {
  const {
    companyId,
    name,
    description,
    category,
    code,
    parameters,
    version = '1.0.0',
    isPublic = false,
    createdByUserId
  } = options;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(skills).values({
    companyId,
    name,
    description,
    category,
    code,
    parameters,
    version,
    isPublic: isPublic ? 1 : 0,
    usageCount: 0,
    createdByUserId,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const skillId = (result as any).insertId || (result as any).id;
  const [skill] = await db.select().from(skills).where(eq(skills.id, skillId)).limit(1);
  return skill;
}

export async function listSkills(options: ListSkillsOptions) {
  const { companyId, category, search, limit = 50, offset = 0 } = options;

  const conditions = [eq(skills.companyId, companyId)];

  if (category) {
    conditions.push(eq(skills.category, category));
  }

  if (search) {
    conditions.push(like(skills.name, `%${search}%`));
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select()
    .from(skills)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function getSkill(skillId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.id, skillId))
    .limit(1);

  return skill;
}

export async function updateSkill(options: UpdateSkillOptions) {
  const { skillId, ...updates } = options;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(skills)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(skills.id, skillId));

  const [skill] = await db.select().from(skills).where(eq(skills.id, skillId)).limit(1);
  return skill;
}

export async function deleteSkill(skillId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(agentSkills).where(eq(agentSkills.skillId, skillId));
  await db.delete(skills).where(eq(skills.id, skillId));
}

export async function enableSkillForAgent(options: EnableSkillForAgentOptions) {
  const { agentId, skillId, config } = options;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(agentSkills).values({
    agentId,
    skillId,
    enabled: 1,
    config,
    createdAt: new Date()
  });

  const agentSkillId = (result as any).insertId || (result as any).id;

  await db.execute(sql`UPDATE pc_skills SET usageCount = usageCount + 1 WHERE id = ${skillId}`);

  const [agentSkill] = await db.select().from(agentSkills).where(eq(agentSkills.id, agentSkillId)).limit(1);
  return agentSkill;
}

export async function disableSkillForAgent(agentId: number, skillId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(agentSkills)
    .set({ enabled: 0 })
    .where(and(
      eq(agentSkills.agentId, agentId),
      eq(agentSkills.skillId, skillId)
    ));
}

export async function listAgentSkills(agentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      id: agentSkills.id,
      skillId: agentSkills.skillId,
      enabled: agentSkills.enabled,
      config: agentSkills.config,
      skillName: skills.name,
      skillDescription: skills.description,
      skillCategory: skills.category,
      skillVersion: skills.version
    })
    .from(agentSkills)
    .leftJoin(skills, eq(agentSkills.skillId, skills.id))
    .where(eq(agentSkills.agentId, agentId));

  return results;
}

export async function getSkillCategories(companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .selectDistinct({ category: skills.category })
    .from(skills)
    .where(eq(skills.companyId, companyId));

  return results.map(r => r.category).filter(Boolean);
}
