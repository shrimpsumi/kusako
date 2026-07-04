import type { RenderContext } from './context.js';

export type Resolver = (
  ctx: RenderContext,
  args: string[],
) => string | Promise<string>;

export const placeholders = new Map<string, Resolver>([
  ['newline', () => '\n'],
  ['user', (ctx) => ctx.member.toString()],
  ['user.name', (ctx) => ctx.member.user.username],
  ['user.nickname', (ctx) => ctx.member.displayName],
  ['server.name', (ctx) => ctx.guild.name],
  ['server.id', (ctx) => ctx.guild.id],
  ['server.membercount', (ctx) => ctx.guild.memberCount.toString()],
]);
