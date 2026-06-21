import { 
    SlashCommandBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    MessageFlags 
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { getPlayer, savePlayer } from '../utils/dbHandler.js';
import { getPokemonData } from '../utils/pokeApiHandler.js';

export const data = new SlashCommandBuilder()
    .setName('create')
    .setDescription('Begin your journey and create your character profile!')
    .addStringOption(option =>
        option.setName('species')
            .setDescription('Type your starting Pokémon species or variant form...')
            .setRequired(true)
            .setAutocomplete(true)
    );

export async function autocomplete(interaction) {
    const focusedValue = String(interaction.options.getFocused() || '').toLowerCase();
    
    try {
        const cachePath = path.join(process.cwd(), 'cache', 'pokemonData.json');
        let choices = [];
        
        if (fs.existsSync(cachePath)) {
            const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            
            // Filter: Only show Pokémon that are NOT banned, ensuring a clean menu
            choices = Object.values(cache)
                .filter(p => p && p.displayName && p.apiName && 
                             !p.isLegendary && !p.isMythical && !p.isParadoxOrBeast)
                .map(p => ({
                    name: String(p.displayName),
                    value: String(p.apiName)
                }));
        }

        const filtered = choices.filter(choice => 
            String(choice.name).toLowerCase().includes(focusedValue) || 
            String(choice.value).toLowerCase().includes(focusedValue)
        ).slice(0, 25);

        await interaction.respond(filtered);
    } catch (error) {
        console.error('Autocomplete filtering failed:', error);
        try { await interaction.respond([]); } catch (e) {}
    }
}

export async function execute(interaction) {
    const userId = interaction.user.id;
    const rawInput = interaction.options.getString('species').trim().toLowerCase();

    const existingPlayer = await getPlayer(userId);
    if (existingPlayer) {
        return interaction.reply({
            content: `You already own a character profile!\n> **Profile:** **${existingPlayer.name}** the **${existingPlayer.species}** (Lv. ${existingPlayer.level})\n\nUse \`/delete\` first if you want to start over.`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Smart Input Translator: pretty names -> slugs
    let resolvedSpecies = rawInput;
    const cachePath = path.join(process.cwd(), 'cache', 'pokemonData.json');

    if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        const matchedEntry = Object.values(cache).find(p => 
            p.displayName.toLowerCase() === rawInput || 
            p.apiName.toLowerCase() === rawInput
        );
        if (matchedEntry) {
            resolvedSpecies = matchedEntry.apiName;
        }
    }

    if (resolvedSpecies === rawInput) {
        resolvedSpecies = resolvedSpecies
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    const pokeData = await getPokemonData(resolvedSpecies);
    if (!pokeData) {
        return interaction.reply({
            content: `Could not find a Pokémon matching "${rawInput}". Please check your spelling or select a valid choice from the autocomplete list.`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (pokeData.isLegendary || pokeData.isMythical || pokeData.isParadoxOrBeast) {
        return interaction.reply({ content: `Absolutely not. Legendaries, Mythicals, Paradox Pokémon, and Ultra Beasts are banned.`, flags: MessageFlags.Ephemeral });
    }
    if (!pokeData.isBaseForm && !pokeData.isBaby) {
        return interaction.reply({ content: `You MUST start as a base form Pokémon.`, flags: MessageFlags.Ephemeral });
    }
    if (pokeData.isBattleOnlyForm) {
        return interaction.reply({ content: `You cannot start as a temporary battle transformation (Mega/G-Max).`, flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId(`create_modal_${pokeData.apiName}`)
        .setTitle(`Configure your ${pokeData.displayName}`);

    const nameInput = new TextInputBuilder()
        .setCustomId('char_name')
        .setLabel('Character Name / Nickname')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Frost')
        .setMaxLength(32)
        .setRequired(true);

    const natureInput = new TextInputBuilder()
        .setCustomId('char_nature')
        .setLabel('Nature (Personality Type)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Jolly, Adamant, Modest, Bold')
        .setRequired(true);

    const movesInput = new TextInputBuilder()
        .setCustomId('char_moves')
        .setLabel('Starter Moves (Comma separated)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Tackle, Powder Snow')
        .setRequired(true);

    const modalComponents = [new ActionRowBuilder().addComponents(nameInput)];

    if (pokeData.validGenders.length > 1) {
        const genderInput = new TextInputBuilder()
            .setCustomId('char_gender')
            .setLabel('Gender (Male or Female)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type Male or Female')
            .setRequired(true);
        modalComponents.push(new ActionRowBuilder().addComponents(genderInput));
    }

    modalComponents.push(new ActionRowBuilder().addComponents(natureInput));
    modalComponents.push(new ActionRowBuilder().addComponents(movesInput));

    modal.addComponents(modalComponents);

    await interaction.showModal(modal);

    try {
        const submission = await interaction.awaitModalSubmit({
            filter: i => i.customId === `create_modal_${pokeData.apiName}` && i.user.id === userId,
            time: 120000 
        });

        const rawName = submission.fields.getTextInputValue('char_name').trim();
        const rawNature = submission.fields.getTextInputValue('char_nature').trim();
        const rawMoves = submission.fields.getTextInputValue('char_moves');

        const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        const nature = rawNature.charAt(0).toUpperCase() + rawNature.slice(1).toLowerCase();
        
        const userMovesArray = rawMoves.split(',')
            .map(move => move.trim().toLowerCase().replace(/\s+/g, '-'))
            .filter(move => move.length > 0);

        const legalMovesSet = new Set([
            ...pokeData.movePool.map(m => m.name),
            ...(pokeData.tmPool || [])
        ]);

        const illegalMoves = userMovesArray.filter(move => !legalMovesSet.has(move));
        
        if (illegalMoves.length > 0) {
            return submission.reply({
                content: `Submission failed. ${pokeData.displayName} cannot learn: **${illegalMoves.join(', ')}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        let finalGender = pokeData.validGenders[0]; 
        if (pokeData.validGenders.length > 1) {
            const rawGender = submission.fields.getTextInputValue('char_gender').trim().toLowerCase();
            if (rawGender.startsWith('m') || rawGender === 'boy') {
                finalGender = 'Male';
            } else if (rawGender.startsWith('f') || rawGender === 'girl') {
                finalGender = 'Female';
            } else {
                return submission.reply({
                    content: `Submission failed. Not a recognized gender. Specify Male or Female.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        const startingLevel = 5;
        const naturalMoves = pokeData.movePool
            .filter(m => m.level <= startingLevel)
            .map(m => m.name);

        const combinedMovePool = Array.from(new Set([...userMovesArray, ...naturalMoves]));
        const activeMoves = combinedMovePool.slice(0, 4);

        const ivs = {
            hp: Math.floor(Math.random() * 32),
            attack: Math.floor(Math.random() * 32),
            defense: Math.floor(Math.random() * 32),
            spAttack: Math.floor(Math.random() * 32),
            spDefense: Math.floor(Math.random() * 32),
            speed: Math.floor(Math.random() * 32)
        };
        const evs = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

        const newCharacter = {
            userId: userId,
            name: name,
            species: pokeData.apiName,
            gender: finalGender, 
            nature: nature,
            level: startingLevel,
            experience: 0,
            nextLevelXp: 100,
            hp: 20, 
            evs: evs,
            ivs: ivs,
            moves: activeMoves,        
            movePool: combinedMovePool 
        };

        await savePlayer(userId, newCharacter);

        await submission.reply({
            content: `**Character Profile Registered!**\n* **Owner:** <@${userId}>\n* **Name:** ${name}\n* **Species:** ${pokeData.displayName}\n* **Gender:** ${finalGender}\n* **Nature:** ${nature}\n* **Level:** ${startingLevel}`
        });

    } catch (error) {
        if (error.code !== 'InteractionCollectorError') {
            console.error('Character Creation submission interaction failure:', error);
        }
    }
}