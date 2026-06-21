import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice with complex math modifiers (e.g., (2d4+2)/4)')
    .addStringOption(option =>
        option.setName('expression')
            .setDescription('The full expression to roll (e.g., (2d4+2)/4, 1d20+5*2)')
            .setRequired(true)
    );

export async function execute(interaction) {
    const originalInput = interaction.options.getString('expression');
    // Normalize input by removing spaces and forcing lowercase
    let expression = originalInput.replace(/\s+/g, '').toLowerCase();

    // Regex to locate any "XdX" pattern
    const diceRegex = /(\d+)d(\d+)/g;
    let match;
    
    const allRollsBreakdown = [];
    let totalDiceCount = 0;

    // Loop through and evaluate every instance of dice in the expression
    while ((match = diceRegex.exec(expression)) !== null) {
        const count = parseInt(match[1], 10);
        const sides = parseInt(match[2], 10);

        totalDiceCount += count;
        if (totalDiceCount > 100 || sides > 1000) {
            return interaction.reply({
                content: 'Dice count or sides too high. Keep it under 100 total dice and 1000 sides.',
                ephemeral: true
            });
        }

        const individualRolls = [];
        let diceSum = 0;
        for (let i = 0; i < count; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            individualRolls.push(roll);
            diceSum += roll;
        }

        allRollsBreakdown.push(`${match[0]}: [${individualRolls.join(', ')}]`);
        
        // Replace this specific dice string with its calculated sum in the math string
        expression = expression.replace(match[0], diceSum);
        
        // Reset regex index since the string length changed
        diceRegex.lastIndex = 0;
    }

    // Sanitize the remaining string so it only contains numbers, operators, and parentheses
    const mathSanitizer = /^[0-9+\-*/().]+$/;
    if (!mathSanitizer.test(expression)) {
        return interaction.reply({
            content: 'Invalid characters found in the expression. Use numbers, standard operators (+ - * /), and parentheses.',
            ephemeral: true
        });
    }

    let finalResult;
    try {
        // Evaluate the sanitized mathematical expression
        const rawEval = Function(`"use strict"; return (${expression})`)();
        // Floor the outcome to keep numbers as clean integers
        finalResult = Math.floor(rawEval);
    } catch (error) {
        return interaction.reply({
            content: 'Failed to evaluate the mathematical expression. Check your parentheses structure.',
            ephemeral: true
        });
    }

    // Format output
    const breakdownText = allRollsBreakdown.length > 0 
        ? `${allRollsBreakdown.join(', ')} -> Evaluated syntax: ${expression}`
        : `Evaluated syntax: ${expression}`;

    return interaction.reply(`**${interaction.user.username}** rolled **${originalInput}**:\n## Result: ${finalResult}\n> **Breakdown:** ${breakdownText}`);
}