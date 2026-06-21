import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} from 'discord.js';
import { getPlayer } from '../utils/dbHandler.js';
import { getPokemonData } from '../utils/pokeApiHandler.js';
import { calculateLiveStats } from '../utils/statCalculator.js';

export const data = new SlashCommandBuilder()
    .setName('sheet')
    .setDescription('Display your character profile.')
    .addBooleanOption(option =>
        option.setName('public')
            .setDescription('Set to True to show in channel.')
            .setRequired(false)
    );

function formatUIString(str) {
    if (!str) return '';
    return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export async function execute(interaction) {
    const userId = interaction.user.id;
    const isPublic = interaction.options.getBoolean('public') ?? false;

    const playerData = await getPlayer(userId);
    if (!playerData) {
        return interaction.reply({
            content: "No character profile found.",
            flags: MessageFlags.Ephemeral
        });
    }

    const replyOptions = isPublic ? {} : { flags: MessageFlags.Ephemeral };
    await interaction.deferReply(replyOptions);

    const cacheData = await getPokemonData(playerData.species);
    const liveStats = await calculateLiveStats(playerData);

    if (!cacheData || !liveStats) {
        return interaction.editReply({ content: "Failed to retrieve data." });
    }

    // Corrected: Using Math.round(stat / 10) as specified
    const getMod = (stat) => Math.round(stat / 10);

    const activeMovesList = playerData.moves.length > 0 
        ? playerData.moves.map(m => `• ${formatUIString(m)}`).join('\n') 
        : 'None.';

    // Page 1: Identity, Stats, and Active Moves
    const page1 = new EmbedBuilder()
        .setTitle(`Character Profile: ${playerData.name}`)
        .setDescription(`### **${cacheData.displayName}** (${cacheData.types.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' / ')})\n*${cacheData.isBaby ? 'Baby Form' : 'Base Form'}*`)
        .setColor('#2F3136')
        .addFields(
            { name: 'Growth', value: `Gender: ${playerData.gender}\nNature: ${playerData.nature}\nLevel: ${playerData.level}\nXP: ${playerData.experience} / ${playerData.nextLevelXp}`, inline: true },
            { 
                name: 'Combat Stats', 
                value: `\`\`\`text\nStat   Total   Mod\n------------------\nHP     ${String(playerData.hp).padEnd(2)}/${String(liveStats.hp).padEnd(2)}   -\nAtk    ${String(liveStats.attack).padEnd(5)}   +${getMod(liveStats.attack)}\nDef    ${String(liveStats.defense).padEnd(5)}   +${getMod(liveStats.defense)}\nSpA    ${String(liveStats.spAttack).padEnd(5)}   +${getMod(liveStats.spAttack)}\nSpD    ${String(liveStats.spDefense).padEnd(5)}   +${getMod(liveStats.spDefense)}\nSpe    ${String(liveStats.speed).padEnd(5)}   +${getMod(liveStats.speed)}\n\`\`\``, 
                inline: false 
            },
            { name: 'Active Moves', value: activeMovesList, inline: false }
        );
    if (cacheData.sprite) page1.setThumbnail(cacheData.sprite);

    // Page 2: Mastered Move Pool (Clean List)
    const masteredList = playerData.movePool.length > 0 
        ? playerData.movePool.map(m => `• ${formatUIString(m)}`).join('\n') 
        : 'None.';

    const page2 = new EmbedBuilder()
        .setTitle(`Mastered Moves: ${playerData.name}`)
        .setColor('#2F3136')
        .setDescription(masteredList);

    const btnStats = new ButtonBuilder().setCustomId('page1').setLabel('Stats').setStyle(ButtonStyle.Primary);
    const btnMoves = new ButtonBuilder().setCustomId('page2').setLabel('Moves').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(btnStats, btnMoves);

    const response = await interaction.editReply({ embeds: [page1], components: [row] });

    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: "Not your profile.", flags: MessageFlags.Ephemeral });
        await i.update({ embeds: [i.customId === 'page1' ? page1 : page2], components: [row] });
    });

    collector.on('end', () => interaction.editReply({ components: [] }));
}