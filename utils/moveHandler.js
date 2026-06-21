import { MoveRegistry } from '../data/moves.js';

/**
 * Helper to roll standard RPG dice (e.g., 1d6, 1d8)
 * @param {number} amount - Number of dice to roll
 * @param {number} type - Number of faces on the die
 * @returns {number} The total sum of the rolls
 */
function rollDice(amount, type) {
    let total = 0;
    for (let i = 0; i < amount; i++) {
        total += Math.floor(Math.random() * type) + 1;
    }
    return total;
}

/**
 * Processes a move's data, modifiers, and damage pool for an attack
 * @param {string} moveId - The key of the move in the registry
 * @param {object} attackerLiveStats - Calculated total stats for attacker (from sheet/calculator)
 * @returns {object} Calculated move data and flags for the combat flow
 */
export function processMove(moveId, attackerLiveStats) {
    const move = MoveRegistry[moveId];
    if (!move) {
        return { success: false, error: "Unknown move." };
    }

    // 1. Check accuracy properties
    // If it has "cannot-miss", the system knows it skips the manual Vs. Roll
    const canMiss = !move.properties.includes("cannot-miss");
    const isMultiHit = move.properties.includes("multihit");

    // 2. Calculate Damage Modifier using the exact sheet formula: Math.round(stat / 10)
    let statMod = 0;
    if (move.category === "Physical") {
        statMod = Math.round(attackerLiveStats.attack / 10);
    } else if (move.category === "Special") {
        statMod = Math.round(attackerLiveStats.spAttack / 10);
    }

    // 3. Roll the base move dice and add the synchronized modifier
    let damagePool = 0;
    if (move.diceAmount > 0 && move.diceType > 0) {
        const rawDiceRoll = rollDice(move.diceAmount, move.diceType);
        damagePool = Math.max(1, rawDiceRoll + statMod); // Ensure it never drops below 1 damage
    }

    return {
        success: true,
        name: move.name,
        type: move.type,
        category: move.category,
        accuracyMod: move.accuracyMod || 0,
        canMiss: canMiss,
        isMultiHit: isMultiHit,
        properties: move.properties,
        damagePool: damagePool,
        onHitEffect: move.onHit || null
    };
}