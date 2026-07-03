import type { SlashCommand } from '../client.js';

import { ping } from './ping.js';
import { autoresponders } from './autoresponders.js';

export const commands: SlashCommand[] = [ping, autoresponders];
