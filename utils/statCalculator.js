import { getPokemonData } from './pokeApiHandler.js';

// The official natures and their exact stat multipliers.
// Neutral natures (Hardy, Docile, Serious, Bashful, Quirky) are intentionally omitted 
// because they apply a 1.0x multiplier, meaning no math changes are needed.
const NATURE_MODIFIERS = {
    Lonely:  { attack: 1.1, defense: 0.9 },
    Brave:   { attack: 1.1, speed: 0.9 },
    Adamant: { attack: 1.1, spAttack: 0.9 },
    Naughty: { attack: 1.1, spDefense: 0.9 },
    Bold:    { defense: 1.1, attack: 0.9 },
    Relaxed: { defense: 1.1, speed: 0.9 },
    Impish:  { defense: 1.1, spAttack: 0.9 },
    Lax:     { defense: 1.1, spDefense: 0.9 },
    Timid:   { speed: 1.1, attack: 0.9 },
    Hasty:   { speed: 1.1, defense: 0.9 },
    Jolly:   { speed: 1.1, spAttack: 0.9 },
    Naive:   { speed: 1.1, spDefense: 0.9 },
    Modest:  { spAttack: 1.1, attack: 0.9 },
    Mild:    { spAttack: 1.1, defense: 0.9 },
    Quiet:   { spAttack: 1.1, speed: 0.9 },
    Rash:    { spAttack: 1.1, spDefense: 0.9 },
    Calm:    { spDefense: 1.1, attack: 0.9 },
    Gentle:  { spDefense: 1.1, defense: 0.9 },
    Sassy:   { spDefense: 1.1, speed: 0.9 },
    Careful: { spDefense: 1.1, spAttack: 0.9 }
};

/**
 * Dynamically calculates a character's current maximum stats on the fly
 * by blending their live profile data with the local PokeAPI base stat cache.
 * * @param {Object} playerData The active player document from the database
 * @returns {Object|null} Complete calculated stat sheets, or null if cache miss
 */
export async function calculateLiveStats(playerData) {
    // Look up the exact species in our strictly validated local cache
    const cacheData = await getPokemonData(playerData.species);
    if (!cacheData) return null;

    const base = cacheData.baseStats;
    const { ivs, evs, level, nature } = playerData;
    const calculated = {};

    // 1. Calculate Maximum HP (Mainline Formula)
    // Shedinja hard-lock rule handled gracefully up front
    if (playerData.species === 'shedinja') {
        calculated.hp = 1;
    } else {
        calculated.hp = Math.floor(
            ((2 * base.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100
        ) + level + 10;
    }

    // 2. Calculate the 5 Core Attributes
    const coreStats = ['attack', 'defense', 'spAttack', 'spDefense', 'speed'];
    
    coreStats.forEach(stat => {
        // Core baseline formula before nature is applied
        let val = Math.floor(
            ((2 * base[stat] + ivs[stat] + Math.floor(evs[stat] / 4)) * level) / 100
        ) + 5;

        // 3. Apply Nature scaling if a modifier rule exists for this stat
        if (NATURE_MODIFIERS[nature] && NATURE_MODIFIERS[nature][stat]) {
            val = Math.floor(val * NATURE_MODIFIERS[nature][stat]);
        }

        calculated[stat] = val;
    });

    return calculated;
}