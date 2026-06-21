import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { getPlayer, deletePlayer } from '../utils/dbHandler.js';

export const data = new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Permanently delete your character profile.');

export async function execute(interaction) {
    const userId = interaction.user.id;

    const existingPlayer = await getPlayer(userId);
    if (!existingPlayer) {
        return interaction.reply({
            content: "You don't have a character profile to delete.",
            flags: MessageFlags.Ephemeral
        });
    }

    const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_delete')
        .setLabel('Yes, delete my character')
        .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_delete')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const response = await interaction.reply({
        content: `Are you absolutely sure you want to permanently delete **${existingPlayer.name}** the **${existingPlayer.species}**? This cannot be undone.`,
        components: [row],
        flags: MessageFlags.Ephemeral
    });

    try {
        const confirmation = await response.awaitMessageComponent({
            filter: i => i.user.id === userId,
            time: 60000,
            componentType: ComponentType.Button
        });

        if (confirmation.customId === 'confirm_delete') {
            await deletePlayer(userId);
            await confirmation.update({ 
                content: 'Your character profile has been permanently deleted.', 
                components: [] 
            });
        } else if (confirmation.customId === 'cancel_delete') {
            await confirmation.update({ 
                content: 'Deletion cancelled. Your character is safe.', 
                components: [] 
            });
        }
    } catch (error) {
        await interaction.editReply({ 
            content: 'Confirmation timed out. Deletion cancelled.', 
            components: [] 
        });
    }
}