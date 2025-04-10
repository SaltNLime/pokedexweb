document.addEventListener('DOMContentLoaded', () => {
    const pokedexDisplay = document.getElementById('pokedex-display');
    const searchInput = document.getElementById('search-input');
    const typeFilter = document.getElementById('type-filter');
    const genFilter = document.getElementById('gen-filter');
    const modal = document.getElementById('pokemon-detail-modal');
    const modalBody = document.getElementById('modal-body');
    const closeModalButton = document.querySelector('.close-button');
    const recommendationSection = document.getElementById('recommendation-section');
    const recommendationsDiv = document.getElementById('recommendations');
    const spriteToggle = document.getElementById('sprite-switch');
    const spriteModeLabel = document.getElementById('sprite-mode-label');

    // New elements for forms modal
    const formsModal = document.getElementById('pokemon-forms-modal');
    const formsModalBody = document.getElementById('forms-modal-body');
    const formsModalTitle = document.getElementById('forms-modal-title');
    const closeFormsModalButton = formsModal.querySelector('.forms-close-button');

    const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2/';
    const POKEMON_LIMIT = 1025; // Expand to Gen 9
    const INITIAL_DISPLAY_COUNT = 51; // Number of Pokémon to show initially

    let allPokemonData = []; // To store fetched Pokemon data (including species)
    let allTypes = new Set(); // To store all unique types
    let use3DSprites = false; // Default to 2D animated
    let isInitialLoad = true; // Flag for initial random display

    // Generation ID ranges (inclusive)
    const GEN_RANGES = {
        1: [1, 151],
        2: [152, 251],
        3: [252, 386],
        4: [387, 493],
        5: [494, 649],
        6: [650, 721],
        7: [722, 809],
        8: [810, 905],
        9: [906, 1025],
    };

    // --- Helper Functions --- 
    function setSpriteMode(is3D) {
        use3DSprites = is3D;
        spriteModeLabel.textContent = is3D ? '3D Static' : '2D Animated';
        document.body.classList.toggle('smooth-sprites', is3D);
        document.body.classList.toggle('pixelated-sprites', !is3D);
        if (isInitialLoad) {
            displayPokemon(allPokemonData);
        } else {
            filterAndSearchPokemon();
        }
    }

    async function fetchWithRetry(url, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 404) return null; // Not found is not an error here
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.warn(`Fetch failed for ${url} (attempt ${i + 1}/${retries}):`, error);
                if (i === retries - 1) throw error; // Throw error after last retry
                await new Promise(res => setTimeout(res, delay * (i + 1))); // Exponential backoff
            }
        }
    }

    // --- Fetching Functions --- 
    async function fetchAllPokemon() {
        console.log("Fetching Pokémon data (limit: ${POKEMON_LIMIT})... This may take a while.");
        pokedexDisplay.innerHTML = '<p>Loading Pokémon data (this might take a minute)...</p>'; // Update loading message
        isInitialLoad = true; // Set flag before fetching

        try {
            // 1. Fetch the basic list of Pokémon names/URLs
            const listResponse = await fetchWithRetry(`${POKEAPI_BASE_URL}pokemon?limit=${POKEMON_LIMIT}`);
            if (!listResponse) throw new Error("Failed to fetch initial Pokémon list.");

            // 2. Create promises to fetch full details AND species data for each Pokémon
            const detailPromises = listResponse.results.map(async (pokemonRef) => {
                const pokemonData = await fetchWithRetry(pokemonRef.url);
                if (!pokemonData) {
                    console.warn(`Skipping Pokémon: Failed to fetch details for ${pokemonRef.name}`);
                    return null; // Skip if basic details fail
                }
                // Fetch species data immediately
                const speciesData = await fetchWithRetry(pokemonData.species.url);
                 if (!speciesData) {
                     console.warn(`Skipping Pokémon: Failed to fetch species data for ${pokemonData.name}`);
                     return null; // Skip if species data fails
                 }
                return { ...pokemonData, speciesData }; // Combine data
            });

            // 3. Execute all promises
            const results = await Promise.all(detailPromises);

            // 4. Filter out any null results (due to fetch errors) and store
            allPokemonData = results.filter(data => data !== null);

            // Extract all unique types from fetched data
            allPokemonData.forEach(pokemon => {
                if (pokemon && pokemon.types) { // Check if pokemon data is valid
                    pokemon.types.forEach(typeInfo => allTypes.add(typeInfo.type.name));
                }
            });

            console.log(`Fetched ${allPokemonData.length} Pokémon with species data.`);
            populateTypeFilter();
            populateGenFilter();
            displayPokemon(allPokemonData);
        } catch (error) {
            console.error("Failed to fetch Pokémon data:", error);
            pokedexDisplay.innerHTML = '<p class="error">Could not load Pokémon data. Please try refreshing the page or check the console.</p>';
        }
    }

    // --- Display Functions --- 
    function displayPokemon(pokemonList) {
        pokedexDisplay.innerHTML = ''; 
        recommendationSection.style.display = 'none'; 

        let displayList = pokemonList;
        let listToRandomizeFrom = pokemonList; // Start with the full list

        // If it's the initial load, apply special logic
        if (isInitialLoad && pokemonList && pokemonList.length > 0) {
            // Filter for Pokémon that HAVE an animated sprite for the initial display
            listToRandomizeFrom = pokemonList.filter(p => 
                p?.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default
            );
            console.log(`Initial load: Found ${listToRandomizeFrom.length} Pokémon with animated sprites.`);

            // Only shuffle and slice if we have enough Pokémon with animated sprites
            if (listToRandomizeFrom.length > 0) {
                const countToShow = Math.min(INITIAL_DISPLAY_COUNT, listToRandomizeFrom.length);
                console.log(`Displaying random ${countToShow} of them.`);
                displayList = [...listToRandomizeFrom].sort(() => 0.5 - Math.random()).slice(0, countToShow);
            } else {
                 console.log("No Pokémon with animated sprites found for initial display. Showing default list subset.");
                 // Fallback: show a random subset of the original list if none have animated sprites
                 const countToShow = Math.min(INITIAL_DISPLAY_COUNT, pokemonList.length);
                 displayList = [...pokemonList].sort(() => 0.5 - Math.random()).slice(0, countToShow);
            }
        }

        if (!displayList || displayList.length === 0) {
             pokedexDisplay.innerHTML = '<p>No Pokémon found matching your criteria.</p>';
             if (isInitialLoad || (!searchInput.value && !typeFilter.value && !genFilter.value)) {
                 showRecommendations();
             }
             return;
        }

        displayList.forEach(pokemon => {
             if (pokemon) { 
                const card = createPokemonCard(pokemon);
                pokedexDisplay.appendChild(card);
             }
        });
    }

    function getSpriteUrl(pokemonData, preference3D) {
        if (!pokemonData || !pokemonData.sprites) return null; // Guard against missing data

        const sprites = pokemonData.sprites;
        const animated2D = sprites.versions?.['generation-v']?.['black-white']?.animated?.front_default;
        const static3D = sprites.other?.home?.front_default;
        const officialArtwork = sprites.other?.['official-artwork']?.front_default;
        const defaultSprite = sprites.front_default;

        // Return the first available sprite based on preference
        if (preference3D) {
            return static3D || officialArtwork || animated2D || defaultSprite;
        } else {
            return animated2D || officialArtwork || static3D || defaultSprite;
        }
    }

    function createPokemonCard(pokemon) {
        const card = document.createElement('div');
        card.classList.add('pokemon-card');
        card.dataset.pokemonId = pokemon.id;

        const primaryType = pokemon.types[0]?.type.name;
        if (primaryType) {
            card.classList.add(`type-${primaryType}-card`);
        }

        const imageUrl = getSpriteUrl(pokemon, use3DSprites);
        const fallbackSprite = pokemon.sprites?.front_default; // Use optional chaining

        // Check for alternate forms (varieties)
        const hasVarieties = pokemon.speciesData?.varieties?.length > 1;

        card.innerHTML = `
            <img 
                src="${imageUrl || fallbackSprite || ''}" 
                alt="${pokemon.name}" 
                loading="lazy" 
                onerror="this.onerror=null; this.src='${fallbackSprite || ''}';" 
            />
            <h3>${pokemon.name}</h3>
            <p>#${String(pokemon.id).padStart(3, '0')}</p>
            ${hasVarieties ? '<button class="show-forms-button">Forms</button>' : ''}
        `;

        // Click listener for the main card (show details)
        card.addEventListener('click', (e) => {
             // Only trigger if the click is not on the forms button
            if (!e.target.classList.contains('show-forms-button')) {
                 showPokemonDetails(pokemon.id);
            }
        });

        // Add separate listener for the forms button if it exists
        if (hasVarieties) {
            const formsButton = card.querySelector('.show-forms-button');
            formsButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click listener from firing
                showAlternateForms(pokemon.id);
            });
        }

        return card;
    }

    function populateTypeFilter() {
        // Clear existing options except the default
        typeFilter.innerHTML = '<option value="">Filter by type...</option>';
        const sortedTypes = [...allTypes].sort();
        sortedTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            typeFilter.appendChild(option);
        });
    }

    function populateGenFilter() {
        genFilter.innerHTML = '<option value="">Filter by Gen...</option>';
        for (const gen in GEN_RANGES) {
            const option = document.createElement('option');
            option.value = gen;
            option.textContent = `Gen ${gen}`;
            genFilter.appendChild(option);
        }
    }

    async function showPokemonDetails(pokemonId) {
        modalBody.innerHTML = '<p>Loading details...</p>';
        modal.style.display = 'block';

        let pokemon = allPokemonData.find(p => p && p.id === pokemonId);

        // If not found in pre-fetched data (could be an alternate form fetched on demand),
        // try fetching it directly.
        if (!pokemon) {
            console.log(`Pokemon ID ${pokemonId} not found in cache, fetching directly...`);
            try {
                // We need the full data AND the species data for the detail view
                const fetchedPokemonData = await fetchWithRetry(`${POKEAPI_BASE_URL}pokemon/${pokemonId}`);
                if (fetchedPokemonData && fetchedPokemonData.species?.url) {
                    const fetchedSpeciesData = await fetchWithRetry(fetchedPokemonData.species.url);
                    if (fetchedSpeciesData) {
                        // Combine the fetched data similar to how fetchAllPokemon does it
                        pokemon = { ...fetchedPokemonData, speciesData: fetchedSpeciesData };
                        console.log(`Successfully fetched details for ID: ${pokemonId}`);
                        // Optional: Add this newly fetched pokemon to allPokemonData for caching?
                        // allPokemonData.push(pokemon); 
                    } else {
                         throw new Error(`Failed to fetch species data for ID: ${pokemonId}`);
                    }
                } else {
                    throw new Error(`Failed to fetch details or species URL missing for ID: ${pokemonId}`);
                }
            } catch (fetchError) {
                console.error(`Error fetching details for ID ${pokemonId}:`, fetchError);
                modalBody.innerHTML = '<p class="error">Could not load details for this Pokémon.</p>';
                // Keep modal open to show error
                return;
            }
        }
        
        // If pokemon is still null/undefined after trying to fetch, show error.
         if (!pokemon) {
             console.error(`Data still unavailable for ID: ${pokemonId}`);
             modalBody.innerHTML = '<p class="error">Could not load details.</p>';
             return; 
         }

        // --- Render Pokemon Details (from here mostly the same as before) ---
        try {
            const speciesData = pokemon.speciesData;
            let pokedexText = 'No Pokédex entry available.';
            if (speciesData && speciesData.flavor_text_entries) {
                const flavorTextEntry = speciesData.flavor_text_entries.slice().reverse().find(entry => entry.language.name === 'en');
                pokedexText = flavorTextEntry
                    ? flavorTextEntry.flavor_text.replace(/\f|\n/g, ' ')
                    : 'No English Pokédex entry found.';
            }

            const spriteUrl = getSpriteUrl(pokemon, use3DSprites);
            const fallbackSprite = pokemon.sprites?.front_default;

            const typesHtml = pokemon.types.map(typeInfo =>
                `<span class="type-${typeInfo.type.name}">${typeInfo.type.name}</span>`
            ).join(' ');

            const abilitiesHtml = pokemon.abilities.map(abilityInfo =>
                 `<li class="${abilityInfo.is_hidden ? 'hidden-ability' : ''}">
                    ${abilityInfo.ability.name.replace('-', ' ')}
                    ${abilityInfo.is_hidden ? ' (Hidden)' : ''}
                 </li>`
            ).join('');

            const statsHtml = pokemon.stats.map(statInfo => {
                const statName = statInfo.stat.name.replace('-', ' ');
                const statValue = statInfo.base_stat;
                const barWidth = Math.min(100, (statValue / 255) * 100);
                return `
                    <div class="stat">
                        <span>${statName}</span>
                        <div class="stat-bar">
                            <div class="stat-bar-fill" style="width: ${barWidth}%; background-color: ${getStatColor(statValue)};"></div>
                        </div>
                        <span>${statValue}</span>
                    </div>
                `;
            }).join('');

            modalBody.innerHTML = `
                <h2>${pokemon.name} (#${String(pokemon.id).padStart(3, '0')})</h2>
                 <img 
                    src="${spriteUrl || fallbackSprite || ''}" 
                    alt="${pokemon.name}" 
                    onerror="this.onerror=null; this.src='${fallbackSprite || ''}';"
                 />
                <div class="types">${typesHtml}</div>
                <div class="details-section abilities">
                     <h3>Abilities</h3>
                     <ul>${abilitiesHtml}</ul>
                </div>
                <div class="details-section stats">
                    <h3>Base Stats</h3>
                    ${statsHtml}
                </div>
                 <div class="details-section pokedex-entry">
                     <h3>Pokédex Entry</h3>
                     <p>${pokedexText}</p>
                 </div>
            `;

            modalBody.className = 'modal-body ';
            pokemon.types.forEach(typeInfo => {
                modalBody.classList.add(`type-${typeInfo.type.name}-bg`);
            });

        } catch (error) {
            console.error("Error rendering Pokémon details:", error);
            modalBody.innerHTML = '<p class="error">Error rendering details.</p>';
        }
    }

    // Modified to add click listener to form cards
    async function showAlternateForms(pokemonId) {
        const basePokemon = allPokemonData.find(p => p && p.id === pokemonId);
         if (!basePokemon || !basePokemon.speciesData?.varieties || basePokemon.speciesData.varieties.length <= 1) {
            console.warn(`No alternate forms found or species data missing for ID: ${pokemonId}`);
            return; 
        }

        formsModalTitle.textContent = `Forms of ${basePokemon.name}`; 
        formsModalBody.innerHTML = '<p>Loading forms...</p>';
        formsModal.style.display = 'block';

        try {
            const varietyPromises = basePokemon.speciesData.varieties.map(variety => 
                fetchWithRetry(variety.pokemon.url)
            );
            // Wait for all form data to be fetched
            const varietyPokemonData = (await Promise.all(varietyPromises)).filter(data => data !== null);

            formsModalBody.innerHTML = ''; 

            if (varietyPokemonData.length === 0) {
                 formsModalBody.innerHTML = '<p>Could not load alternate forms.</p>';
                 return;
            }

            varietyPokemonData.forEach(form => {
                if (!form || !form.id) return; // Skip if form data is invalid

                const formCard = document.createElement('div');
                formCard.classList.add('form-card');
                formCard.dataset.formId = form.id; // Store the specific form's ID

                const imageUrl = getSpriteUrl(form, use3DSprites);
                const fallbackSprite = form.sprites?.front_default;
                let formName = form.name.replace(basePokemon.name + '-', '').replace('-', ' '); 
                if (form.is_default) {
                    formName = 'Default'; 
                }
                 
                formCard.innerHTML = `
                    <img 
                        src="${imageUrl || fallbackSprite || ''}" 
                        alt="${form.name}" 
                        loading="lazy" 
                        onerror="this.onerror=null; this.src='${fallbackSprite || ''}';"
                    />
                    <p>${formName}</p>
                `;

                // Add click listener to the form card
                formCard.addEventListener('click', () => {
                    const selectedFormId = parseInt(formCard.dataset.formId, 10);
                    if (!isNaN(selectedFormId)) {
                        closeFormsModal(); // Close the forms modal
                        showPokemonDetails(selectedFormId); // Show details for the clicked form
                    }
                });

                formsModalBody.appendChild(formCard);
            });

        } catch (error) {
            console.error("Error fetching or displaying alternate forms:", error);
            formsModalBody.innerHTML = '<p class="error">Error loading forms.</p>';
        }
    }

    function getStatColor(value) {
        // Using shades of green/grey for Game Boy feel
        if (value < 60) return '#8bac0f'; // Darker green
        if (value < 100) return '#9bbc0f'; // Mid green
        if (value < 130) return '#cadc9f'; // Lighter green
        return '#c0c0c0'; // Greyish for high stats
    }

    function closeModal() {
        modal.style.display = 'none';
        modalBody.innerHTML = ''; 
    }

    function closeFormsModal() {
        formsModal.style.display = 'none';
        formsModalBody.innerHTML = '';
    }

    function filterAndSearchPokemon() {
        isInitialLoad = false;

        const searchTerm = searchInput.value.toLowerCase();
        const selectedType = typeFilter.value;
        const selectedGen = genFilter.value;

        let range = null;
        if (selectedGen && GEN_RANGES[selectedGen]) {
            range = GEN_RANGES[selectedGen];
        }

        const filteredPokemon = allPokemonData.filter(pokemon => {
            if (!pokemon) return false;

            const genMatch = selectedGen ? (pokemon.id >= range[0] && pokemon.id <= range[1]) : true;
            if (!genMatch) return false;

            const nameMatch = searchTerm ? pokemon.name.toLowerCase().includes(searchTerm) : true;
            if (!nameMatch) return false;

            const typeMatch = selectedType ? pokemon.types.some(typeInfo => typeInfo.type.name === selectedType) : true;

            return typeMatch;
        });

        displayPokemon(filteredPokemon);
    }

    function showRecommendations() {
         if (allPokemonData.length === 0 || searchInput.value || typeFilter.value || genFilter.value) {
             recommendationSection.style.display = 'none';
             return;
         }

        recommendationSection.style.display = 'block';
        recommendationsDiv.innerHTML = '';

        const shuffled = [...allPokemonData]
             .filter(p => p)
             .sort(() => 0.5 - Math.random());
        const recommended = shuffled.slice(0, 3);

        if (recommended.length > 0) {
             recommended.forEach(pokemon => {
                const card = createPokemonCard(pokemon);
                recommendationsDiv.appendChild(card);
            });
        } else {
             recommendationsDiv.innerHTML = '<p>No recommendations available.</p>';
        }
    }

    // --- Event Listeners --- 
    searchInput.addEventListener('input', filterAndSearchPokemon);
    typeFilter.addEventListener('change', filterAndSearchPokemon);
    genFilter.addEventListener('change', filterAndSearchPokemon);
    closeModalButton.addEventListener('click', closeModal);
    closeFormsModalButton.addEventListener('click', closeFormsModal);

    window.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
        if (event.target === formsModal) closeFormsModal();
    });

    spriteToggle.addEventListener('change', (event) => {
        setSpriteMode(event.target.checked);
    });

    // --- Initial Load --- 
    setSpriteMode(false);
    fetchAllPokemon();
}); 