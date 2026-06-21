import { QuickDB } from 'quick.db';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly name the file database.sqlite in your root directory
const db = new QuickDB({ filePath: path.join(__dirname, '..', 'database.sqlite') });

/**
 * Fetch a player's character data by their Discord ID
 * @param {string} discordId 
 * @returns {Promise<object|null>}
 */
export async function getPlayer(discordId) {
    return await db.get(`player_${discordId}`);
}

/**
 * Save or update a player's character data by their Discord ID
 * @param {string} discordId 
 * @param {object} data 
 * @returns {Promise<object>}
 */
export async function savePlayer(discordId, data) {
    return await db.set(`player_${discordId}`, data);
}

/**
 * Delete a player's character data
 * @param {string} discordId 
 * @returns {Promise<boolean>}
 */
export async function deletePlayer(discordId) {
    return await db.delete(`player_${discordId}`);
}