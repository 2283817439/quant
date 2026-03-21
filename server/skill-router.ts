import { router, publicProcedure } from './_core/trpc';
import { z } from 'zod';
import * as skillService from './paperclip-services/skill-service';

export const skillRouter = router({
  list: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1),
      category: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0)
    }))
    .query(async ({ input }) => {
      return await skillService.listSkills(input);
    }),

  get: publicProcedure
    .input(z.object({
      skillId: z.number()
    }))
    .query(async ({ input }) => {
      return await skillService.getSkill(input.skillId);
    }),

  create: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1),
      name: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      code: z.string(),
      parameters: z.any().optional(),
      version: z.string().optional(),
      isPublic: z.boolean().optional()
    }))
    .mutation(async ({ input }) => {
      return await skillService.createSkill(input);
    }),

  update: publicProcedure
    .input(z.object({
      skillId: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      code: z.string().optional(),
      parameters: z.any().optional(),
      version: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      return await skillService.updateSkill(input);
    }),

  delete: publicProcedure
    .input(z.object({
      skillId: z.number()
    }))
    .mutation(async ({ input }) => {
      await skillService.deleteSkill(input.skillId);
      return { success: true };
    }),

  categories: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1)
    }))
    .query(async ({ input }) => {
      return await skillService.getSkillCategories(input.companyId);
    }),

  enableForAgent: publicProcedure
    .input(z.object({
      agentId: z.number(),
      skillId: z.number(),
      config: z.any().optional()
    }))
    .mutation(async ({ input }) => {
      return await skillService.enableSkillForAgent(input);
    }),

  disableForAgent: publicProcedure
    .input(z.object({
      agentId: z.number(),
      skillId: z.number()
    }))
    .mutation(async ({ input }) => {
      await skillService.disableSkillForAgent(input.agentId, input.skillId);
      return { success: true };
    }),

  listAgentSkills: publicProcedure
    .input(z.object({
      agentId: z.number()
    }))
    .query(async ({ input }) => {
      return await skillService.listAgentSkills(input.agentId);
    })
});