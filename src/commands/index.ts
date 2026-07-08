import type { SlashCommand } from '../client.js';

import { ping } from './ping.js';
import { autoresponders } from './autoresponders.js';
import { balance } from './balance.js';
import { modifybalance } from './modifybalance.js';
import { settings } from './settings.js';
import { items } from './items.js';
import { inventory } from './inventory.js';
import { modifyinventory } from './modifyinventory.js';
import { embeds } from './embeds.js';

export const commands: SlashCommand[] = [
  ping,
  autoresponders,
  balance,
  modifybalance,
  settings,
  items,
  inventory,
  modifyinventory,
  embeds,
];
