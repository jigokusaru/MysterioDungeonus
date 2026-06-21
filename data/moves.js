export const MoveRegistry = {
    "tackle": {
        name: "Tackle",
        type: "Normal",
        category: "Physical",
        accuracyMod: 0,       // 100% Accuracy Bracket (+0)
        diceAmount: 1,        // 40 BP = 1d6
        diceType: 6,          
        properties: ["contact"]
    },

    "powder-snow": {
        name: "Powder Snow",
        type: "Ice",
        category: "Special",
        accuracyMod: 0,       // 100% Accuracy Bracket (+0)
        diceAmount: 1,        // 40 BP = 1d6
        diceType: 6,          
        properties: [],
        onHit: (attacker, target) => {
            const roll = Math.floor(Math.random() * 100) + 1;
            if (roll <= 10) {
                target.status = "frozen";
                return `${target.name} was frozen solid!`;
            }
            return null;
        }
    }
};