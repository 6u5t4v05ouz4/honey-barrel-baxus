// Funções utilitárias para buscar garrafas em listings.json a partir de texto extraído

async function fetchListings(listingsJsonUrl) {
  // Carrega listings.json usando a URL recebida
  const resp = await fetch(listingsJsonUrl);
  const data = await resp.json();
  console.log('[BAXUS-helper] listings.json carregado, total:', Array.isArray(data) ? data.length : 'NÃO É ARRAY');
  return data;
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/gi, '');
}

// Função de distância de Levenshtein
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i-1) === a.charAt(j-1)) {
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i-1][j-1] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Similaridade percentual baseada em Levenshtein
function fuzzySimilarity(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}


function extractRelevantLines(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

function findMatches(extractedText, listings) {
  // Pesos dos campos
  const WEIGHTS = {
    name: 4,
    Producer: 2,
    Type: 1,
    Size: 0.5,
    Category: 0.5,
    Color: 0.5,
    ABV: 0.5,
    Country: 0.5,
    Region: 0.5
  };

  // Campos usados para match
  const FIELD_PATHS = [
    {key: 'name', get: item => item._source?.name},
    {key: 'Producer', get: item => item._source?.attributes?.Producer},
    {key: 'Type', get: item => item._source?.attributes?.Type},
    {key: 'Size', get: item => item._source?.attributes?.Size},
    {key: 'Category', get: item => item._source?.attributes?.Category},
    {key: 'Color', get: item => item._source?.attributes?.Color},
    {key: 'ABV', get: item => item._source?.attributes?.ABV},
    {key: 'Country', get: item => item._source?.attributes?.Country},
    {key: 'Region', get: item => item._source?.attributes?.Region}
  ];
  console.log('[BAXUS-helper] findMatches chamado', {extractedText, listingsLength: listings.length});
  const lines = extractRelevantLines(extractedText);
  let exactMatch = null;
  let similar = [];

  // Novo match exato: todos os campos presentes no texto devem bater
  for (const item of listings) {
    let allMatch = true;
    for (const field of FIELD_PATHS) {
      // Só tenta bater se o campo existe no item
      const val = normalize(field.get(item));
      if (val) {
        // Só exige que bata se algum valor do texto for similar
        const hit = lines.some(line => val.includes(normalize(line)));
        if (!hit) {
          allMatch = false;
          break;
        }
      }
    }
    if (allMatch) {
      exactMatch = item;
      console.log('[BAXUS-helper] MATCH EXATO encontrado:', item._source?.name);
      break;
    }
  }

  if (!exactMatch) {
    console.log('[BAXUS-helper] Nenhum match exato, buscando similares...');
    // Novo: pontua cada item pela quantidade de campos que coincidem
    let scored = listings.map(item => {
      let score = 0;
      let maxScore = 0;
      let debug = {};
      for (const field of FIELD_PATHS) {
        const key = field.key;
        const weight = WEIGHTS[key] || 0.5;
        const itemVal = field.get(item);
        if (!itemVal) continue;
        let bestSim = 0;
        for (const line of lines) {
          let sim = 0;
          if (key === 'name' || key === 'Producer') {
            sim = fuzzySimilarity(itemVal, line);
          } else {
            sim = normalize(itemVal) === normalize(line) ? 1 : 0;
          }
          if (sim > bestSim) bestSim = sim;
        }
        if (bestSim > 0.6) { // só conta se similaridade for relevante
          score += weight * bestSim;
        }
        maxScore += weight;
        debug[key] = bestSim;
      }
      let percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      return { item, score, percent, debug };
    });
    // Ordena por percentagem decrescente
    scored.sort((a, b) => b.percent - a.percent);
    // Só mostra similares com score > 0
    similar = scored.filter(x => x.percent > 0);
    // Se não houver nenhum, similar = [] (mostra mensagem de nenhum semelhante)
    console.log('[BAXUS-helper] Similares encontrados:', similar.map(x => x.item._source?.name));
  }

  if (!exactMatch && (!similar || similar.length === 0)) {
    console.log('[BAXUS-helper] NENHUM MATCH encontrado para o texto:', extractedText);
  }
  return { exactMatch, similar };
}

// Exporta para uso no content.js
window.BaxusListingsHelper = { fetchListings, findMatches };

// Listener para comunicação com content script
window.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'BAXUS_FIND_MATCHES') {
    const listings = await fetchListings(event.data.listingsJsonUrl);
    const result = findMatches(event.data.text, listings);
    window.postMessage({ type: 'BAXUS_FIND_MATCHES_RESULT', result }, '*');
  }
});
