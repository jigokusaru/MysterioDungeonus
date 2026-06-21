import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'pokemonData.json');

// Hardcoded trap for pseudo-legendary classes that PokeAPI refuses to flag as legendary
const RESTRICTED_SPECIES = new Set([
    'nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon',
    'great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane', 'slither-wing', 'sandy-shocks', 'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis', 'iron-moth', 'iron-thorns', 'roaring-moon', 'iron-valiant',
    'walking-wake', 'iron-leaves', 'gouging-fire', 'raging-bolt', 'iron-boulder', 'iron-crown'
]);

// Safely boot up local file storage directories
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(CACHE_FILE)) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({}, null, 4));
}

function readCache() {
    try {
        const data = fs.readFileSync(CACHE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading local PokeAPI cache:', error);
        return {};
    }
}

/**
 * Writes data to the cache file, strictly sorting the entire JSON object 
 * by the National Dex ID before saving it to disk for clean human readability.
 */
function writeCache(cacheData) {
    try {
        // Convert the object into an array, sort by ID, and convert back to an object
        const sortedCache = Object.fromEntries(
            Object.entries(cacheData).sort(([, a], [, b]) => a.id - b.id)
        );
        fs.writeFileSync(CACHE_FILE, JSON.stringify(sortedCache, null, 4));
    } catch (error) {
        console.error('Error writing to local PokeAPI cache:', error);
    }
}

/**
 * Fetches data for a specific Pokémon dynamically.
 * Implements a "Smart Schema Check" to ensure older cached entries are automatically
 * overwritten if new features are added to the bot's blueprint.
 * @param {string} pokemonName The search slug string.
 * @returns {Object|null} Clean customized core template.
 */
export async function getPokemonData(pokemonName) {
    const cleanName = pokemonName.trim().toLowerCase();
    const cache = readCache();

    // Direct cache return ONLY if it exists AND matches our current schema requirements
    if (cache[cleanName]) {
        // Smart Check: Does this cached entry have the newly added Paradox trap data?
        if (cache[cleanName].isParadoxOrBeast !== undefined) {
            return cache[cleanName];
        } else {
            console.log(`[Cache Update] Legacy data detected for ${cleanName}. Re-fetching new schema...`);
        }
    }

    try {
        // Step 1: Fetch Main Variant Data
        const pokemonResponse = await fetch(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
        if (!pokemonResponse.ok) return null;
        const pokemonData = await pokemonResponse.json();

        // Step 2: Fetch Species Data
        const speciesResponse = await fetch(pokemonData.species.url);
        if (!speciesResponse.ok) return null;
        const speciesData = await speciesResponse.json();

        // Step 3: Determine the Display Name securely
        let displayName = pokemonData.name.charAt(0).toUpperCase() + pokemonData.name.slice(1);
        const speciesEnglish = speciesData.names?.find(n => n.language.name === 'en');
        if (speciesEnglish && speciesEnglish.name) {
            displayName = speciesEnglish.name;
        }

        let isBattleOnlyForm = false;

        // Step 4: Fetch Form Data to find the true full English name and battle flags
        if (pokemonData.forms && pokemonData.forms.length > 0) {
            const formResponse = await fetch(pokemonData.forms[0].url);
            if (formResponse.ok) {
                const formData = await formResponse.json();
                
                isBattleOnlyForm = formData.is_battle_only || false;

                // STRICT RULE: Only pull from the 'names' array.
                const englishFormEntry = formData.names?.find(n => n.language.name === 'en');
                if (englishFormEntry && englishFormEntry.name) {
                    displayName = englishFormEntry.name;
                }
            }
        }

        // Step 5: Parse Gender Restrictions based on official ratios
        const genderRate = speciesData.gender_rate;
        let validGenders = [];
        if (genderRate === -1) {
            validGenders = ['Genderless'];
        } else if (genderRate === 0) {
            validGenders = ['Male'];
        } else if (genderRate === 8) {
            validGenders = ['Female'];
        } else {
            validGenders = ['Male', 'Female'];
        }

        // Step 6: Extract HOME Sprite Artwork
        const homeSprite = pokemonData.sprites?.other?.home?.front_default || pokemonData.sprites?.front_default || null;

        // Step 7: Process Base Stats
        const baseStats = {};
        const statNameMap = {
            'hp': 'hp',
            'attack': 'attack',
            'defense': 'defense',
            'special-attack': 'spAttack',
            'special-defense': 'spDefense',
            'speed': 'speed'
        };

        pokemonData.stats.forEach(s => {
            const mappedName = statNameMap[s.stat.name];
            if (mappedName) {
                baseStats[mappedName] = s.base_stat;
            }
        });

        // Step 8: Extract Types
        const types = pokemonData.types.map(t => t.type.name);

        // Step 9: Move Extractor (Level-Up limits & TM/HM compatibility)
        const processedMoves = {};
        const tmPoolSet = new Set(); 

        pokemonData.moves.forEach(m => {
            const moveName = m.move.name;
            
            m.version_group_details.forEach(detail => {
                const method = detail.move_learn_method.name;

                // Track the absolute lowest level naturally learned
                if (method === 'level-up') {
                    const levelLearned = detail.level_learned_at;
                    if (processedMoves[moveName] === undefined || levelLearned < processedMoves[moveName]) {
                        processedMoves[moveName] = levelLearned;
                    }
                } 
                // Track if it was ever historically learned via TM, HM, or TR
                else if (method === 'machine') {
                    tmPoolSet.add(moveName);
                }
            });
        });

        const cleanMovePool = Object.entries(processedMoves)
            .map(([name, level]) => ({ name, level }))
            .sort((a, b) => a.level - b.level);
            
        // Convert the TM Set back into a clean, sorted array
        const cleanTmPool = Array.from(tmPoolSet).sort();

        // Step 10: Evolution Chain Validation (Determine if it's the absolute lowest base stage)
        let isBaseForm = true;
        if (speciesData.evolution_chain) {
            const chainResponse = await fetch(speciesData.evolution_chain.url);
            if (chainResponse.ok) {
                const chainData = await chainResponse.json();
                if (chainData.chain.species.name !== speciesData.name) {
                    isBaseForm = false;
                }
            }
        }

        // Step 11: Compile complete, pristine template object
        const processedPokemon = {
            id: pokemonData.id,
            apiName: pokemonData.name,
            displayName: displayName,
            sprite: homeSprite,
            types: types,
            growthRate: speciesData.growth_rate?.name || 'medium',
            validGenders: validGenders, 
            isBaby: speciesData.is_baby || false,
            isBaseForm: isBaseForm,
            isBattleOnlyForm: isBattleOnlyForm,
            isLegendary: speciesData.is_legendary || false,
            isMythical: speciesData.is_mythical || false,
            isParadoxOrBeast: RESTRICTED_SPECIES.has(speciesData.name), // The trap flag
            baseStats: baseStats,
            movePool: cleanMovePool,
            tmPool: cleanTmPool
        };

        // Write directly to local database cache
        cache[cleanName] = processedPokemon;
        writeCache(cache);

        return processedPokemon;

    } catch (error) {
        console.error(`Failed compiling PokeAPI data structure for "${cleanName}":`, error);
        return null;
    }
}