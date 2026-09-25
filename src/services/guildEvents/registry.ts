import {
  Events,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';

import type { SakoClient } from '../../client.js';
import { syncBoostState } from './store.js';
import { startBirthdaySweep } from '../birthdays/fire.js';

const BOOST_RECENT_MS = 5 * 60_000;

export type EventMember = GuildMember | PartialGuildMember;

export type FireEvent = (guild: Guild, member: EventMember) => Promise<unknown>;

export interface EventDefinition {
  id: string;
  label: string;
  register(client: SakoClient, fire: FireEvent): void;
}

export const EVENTS = [
  {
    id: 'join',
    label: 'join',
    register(client: SakoClient, fire: FireEvent) {
      client.on(Events.GuildMemberAdd, async (member) => {
        await fire(member.guild, member);
      });
    },
  },
  {
    id: 'leave',
    label: 'leave',
    register(client: SakoClient, fire: FireEvent) {
      client.on(Events.GuildMemberRemove, async (member) => {
        await fire(member.guild, member);
      });
    },
  },
  {
    id: 'boost',
    label: 'boost',
    register(client: SakoClient, fire: FireEvent) {
      client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
        const premiumSince = newMember.premiumSinceTimestamp;
        const transition = syncBoostState(
          newMember.guild.id,
          newMember.id,
          premiumSince,
        );

        if (transition !== 'started') return;
        if (
          premiumSince === null ||
          premiumSince <= Date.now() - BOOST_RECENT_MS
        )
          return;

        await fire(newMember.guild, newMember);
      });
    },
  },
  {
    id: 'birthday',
    label: 'birthday',
    register(client: SakoClient, fire: FireEvent) {
      client.once(Events.ClientReady, (ready) => {
        startBirthdaySweep(ready, fire);
      });
    },
  },
] as const satisfies readonly EventDefinition[];

export const EVENT_KINDS = EVENTS.map((definition) => definition.id);
export type EventKind = (typeof EVENTS)[number]['id'];
