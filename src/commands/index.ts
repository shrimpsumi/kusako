import type { SlashCommand } from '../client.js';

import { ping } from './ping.js';

export const commands: SlashCommand[] = [ping];
