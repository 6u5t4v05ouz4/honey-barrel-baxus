function createOverlay() {
  // Prevent multiple overlays
  if (document.getElementById('baxus-ocr-overlay')) return;
  console.log('[BAXUS] createOverlay called');

  // Declare all variables needed across functions at the top
  let overlay, selectionBox;
  let startX, startY;
  let selecting = false;

  // Create dark overlay covering everything
  overlay = document.createElement('div'); // Assign to the declared variable
  overlay.id = 'baxus-ocr-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0'; // covers the entire screen
  overlay.style.background = 'rgba(24,25,26,0.6)';
  overlay.style.zIndex = '999999';
  overlay.style.cursor = 'crosshair';

  // Instruction text at the top
  const instruction = document.createElement('div');
  instruction.textContent = 'Select the bottle text area with your mouse';
  instruction.style.position = 'fixed';
  instruction.style.top = '32px';
  instruction.style.left = '0';
  instruction.style.width = '100vw';
  instruction.style.textAlign = 'center';
  instruction.style.fontSize = '2em';
  instruction.style.fontWeight = 'bold';
  instruction.style.color = '#fff';
  instruction.style.textShadow = '0 2px 8px #000, 0 0 2px #000';
  instruction.style.pointerEvents = 'none';
  instruction.style.zIndex = '1000001';
  overlay.appendChild(instruction);

  document.body.appendChild(overlay);

  // Define event handlers *before* cleanup so cleanup can access them
  const onMouseMove = function(ev) {
    if (!selecting || !selectionBox) return;
    const width = Math.abs(ev.clientX - startX);
    const height = Math.abs(ev.clientY - startY);
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.left = Math.min(ev.clientX, startX) + 'px';
    selectionBox.style.top = Math.min(ev.clientY, startY) + 'px';
  };

  const onMouseUp = function(ev) {
    if (!selecting) return;
    // Listeners will be removed by cleanup function
    selecting = false;

    const endX = ev.clientX;
    const endY = ev.clientY;

    if (Math.abs(endX - startX) < 5 || Math.abs(endY - startY) < 5) {
      console.log('[BAXUS] Selection too small, cancelling.');
      cleanup(); // Call cleanup *after* removing listeners
      return;
    }

    try {
      // Use a minimal timeout just to ensure the final mouseup position is registered
      setTimeout(() => {
        try {
          extractSelectedArea(Math.min(startX, endX), Math.min(startY, endY), Math.abs(endX - startX), Math.abs(endY - startY));
        } catch (error) {
          console.error('[BAXUS] Error during extractSelectedArea:', error);
        } finally {
          cleanup(); // Call cleanup *after* removing listeners and processing
        }
      }, 10); // Minimal delay
    } catch (error) {
      console.error('[BAXUS] Error setting up extraction timeout:', error);
      cleanup(); // Call cleanup if timeout setup fails
    }
  };

  const onKeyDown = function(e) {
    if (e.key === 'Escape') {
      console.log('[BAXUS] Escape key pressed, cleaning up.');
      cleanup();
    }
  };

  // Define cleanup function - now has access to all handlers and overlay
  function cleanup() {
    // Check if cleanup has already run significantly
    if (!selecting && !document.getElementById('baxus-ocr-overlay')) {
        console.log('[BAXUS] Cleanup already likely completed, skipping redundant actions.');
        return;
    }
    console.log('[BAXUS] Cleanup called');

    // Remove all event listeners first, using the handler references
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('keydown', onKeyDown, true);

    // Attempt to remove DOM elements by ID and reference
    const currentOverlay = document.getElementById('baxus-ocr-overlay');
    if (currentOverlay) {
        currentOverlay.onmousedown = null; // Clear the mousedown handler
        if (currentOverlay.parentNode) {
            currentOverlay.parentNode.removeChild(currentOverlay);
        }
    }
    const currentSelectionBox = document.getElementById('baxus-ocr-selection');
    if (currentSelectionBox && currentSelectionBox.parentNode) {
        currentSelectionBox.parentNode.removeChild(currentSelectionBox);
    }

    // Reset state variables only once
    if (selecting) {
        selecting = false;
        startX = null;
        startY = null;
        selectionBox = null; // Clear reference to the variable
        overlay = null; // Clear reference to the variable
        console.log('[BAXUS] State reset.');
    }
  }

  // Attach initial listeners
  overlay.onmousedown = function(e) {
    if (selecting) return;
    selecting = true;
    startX = e.clientX;
    startY = e.clientY;

    // Create selection box
    selectionBox = document.createElement('div');
    selectionBox.id = 'baxus-ocr-selection';
    selectionBox.style.position = 'fixed';
    selectionBox.style.border = '2px solid #00ff99';
    selectionBox.style.background = 'rgba(0,255,153,0.1)';
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.zIndex = '1000000';
    document.body.appendChild(selectionBox);

    // Add window listeners for move and up events
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
  };

  // Add keydown listener to window
  window.addEventListener('keydown', onKeyDown, true);
}


// Add sidebar CSS
function addSidebarStyles() {
  if (!document.getElementById('baxus-sidebar-styles')) {
    const link = document.createElement('link');
    link.id = 'baxus-sidebar-styles';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('sidebar.css');
    document.head.appendChild(link);
  }
}

function showBottleSidebar(extractedText, exactMatch, similar) {
  console.log('[BAXUS] showBottleSidebar called', {extractedText, exactMatch, similar});
  // Add sidebar styles
  addSidebarStyles();
  
  // Remove previous sidebar if exists
  const old = document.getElementById('baxus-sidebar');
  if (old) old.remove();

  const sidebar = document.createElement('div');
  sidebar.id = 'baxus-sidebar';

  const logoUrl = chrome.runtime.getURL('icons/baxus-sidebar.png');
  sidebar.innerHTML = `
    <div class="baxus-sidebar-header">
      <div style="display:flex;align-items:center;">
        <img src="${logoUrl}" alt="Baxus logo" class="baxus-sidebar-logo">
      </div>
      <button id="baxus-close-sidebar">&times;</button>
    </div>
    <div id="baxus-sidebar-results"></div>
  `;
  document.body.appendChild(sidebar);

  // Add click event to close button
  document.getElementById('baxus-close-sidebar').onclick = () => sidebar.remove();

  // Render results
  const resultsDiv = document.getElementById('baxus-sidebar-results');
  if (exactMatch) {
    resultsDiv.innerHTML = `<h3 class="baxus-section-title">Identical bottle found:</h3>` + renderBottleHtml(exactMatch);
  } else if (similar && similar.length > 0) {
    resultsDiv.innerHTML = `<h3 class="baxus-section-title">Similar bottles found:</h3>` + similar.map(obj => renderBottleHtml(obj.item, obj.percent)).join('');
  } else {
    resultsDiv.innerHTML = `<div class="baxus-empty-result"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg><p style="margin-top:12px;">No similar bottles found.</p></div>`;
  }
}


function renderBottleHtml(bottle, percent) {
  const src = bottle._source || {};
  const attrs = src.attributes || {};
  return `
    <div class="baxus-bottle-card">
      <!-- First row: photo on left, badge on right -->
      <div class="baxus-bottle-header">
        <img src="${src.imageUrl || ''}" alt="bottle" class="baxus-bottle-image">
        ${typeof percent === 'number' ? `
          <span class="baxus-match-percent">
            <span style="font-size:1.05em;">★</span> ${percent}%
          </span>
        ` : ''}
      </div>
      <!-- Second row: info -->
      <div style="overflow:hidden;">
        <div style="margin-bottom:10px;">
          <a href="https://baxus.co/asset/${src.nftAddress || ''}" target="_blank" class="baxus-bottle-title">${src.name || attrs.Name || 'No name'}</a>
          ${src.price ? `<span class="baxus-bottle-price">US$ ${src.price}</span>` : ''}
        </div>
        <div class="baxus-bottle-tags">
          ${attrs.Type ? `<span class="baxus-bottle-tag">${attrs.Type}</span>` : ''}
          ${attrs.Size ? `<span class="baxus-bottle-tag">${attrs.Size}</span>` : ''}
          ${attrs.ABV ? `<span class="baxus-bottle-tag">${attrs.ABV}% ABV</span>` : ''}
        </div>
        ${attrs.Producer ? `<div class="baxus-bottle-producer">${attrs.Producer}</div>` : ''}
      </div>
    </div>
  `;
}



function showExtractedTextPopup(text) {
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  popup.style.top = '20px';
  popup.style.right = '20px';
  popup.style.background = '#23272f';
  popup.style.color = '#f5f6fa';
  popup.style.padding = '16px';
  popup.style.borderRadius = '8px';
  popup.style.zIndex = '1000001';
  popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  popup.style.maxWidth = '350px';
  popup.style.fontSize = '15px';
  popup.style.whiteSpace = 'pre-line';
  popup.textContent = text;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 8000);
}

// Load listings search helper
if (!window.BaxusListingsHelper) {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('listings-helper.js');
  document.head.appendChild(script);
}

function injectHelperScript() {
  if (document.getElementById('baxus-helper-script')) return;
  const script = document.createElement('script');
  script.id = 'baxus-helper-script';
  script.src = chrome.runtime.getURL('listings-helper.js');
  script.onload = () => {
    console.log('[BAXUS] listings-helper.js injetado no contexto da página');
  };
  (document.head || document.documentElement).appendChild(script);
}

function waitForHelperAndSearch(resultText) {
  injectHelperScript();
  const listingsJsonUrl = chrome.runtime.getURL('listings.json');
  window.postMessage({ type: 'BAXUS_FIND_MATCHES', text: resultText, listingsJsonUrl }, '*');
  function handleResult(event) {
    if (event.data && event.data.type === 'BAXUS_FIND_MATCHES_RESULT') {
      showBottleSidebar(resultText, event.data.result.exactMatch, event.data.result.similar);
      window.removeEventListener('message', handleResult);
    }
  }
  window.addEventListener('message', handleResult);
}



async function extractSelectedArea(x, y, width, height) {
  console.log('[BAXUS] extractSelectedArea chamado', { x, y, width, height });
  try {
    console.log('[BAXUS] Extraindo texto do DOM na área:', { x, y, width, height });
    const texts = [];
    const selectionRect = { left: x, right: x + width, top: y, bottom: y + height };
    function isInSelection(rect) {
      // Verifica sobreposição em vez de contenção total
      return (
        rect.left < selectionRect.right &&
        rect.right > selectionRect.left &&
        rect.top < selectionRect.bottom &&
        rect.bottom > selectionRect.top
      );
    }
    document.querySelectorAll('body *').forEach(el => {
      // DEBUG
      // console.log('[BAXUS] Checando elemento', el);

      if (!el.innerText || !el.offsetParent) return; // ignora invisíveis
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (isInSelection(rect)) {
        // Só adiciona se não houver filhos também selecionados
        let hasSelectedChild = false;
        for (const child of el.children) {
          const childRect = child.getBoundingClientRect();
          if (isInSelection(childRect)) {
            hasSelectedChild = true;
            break;
          }
        }
        if (!hasSelectedChild) {
          texts.push(el.innerText.trim());
        }
      }
    });
    const resultText = texts.join('\n').replace(/\n{2,}/g, '\n');
    console.log('[BAXUS] Texto extraído:', resultText);
    chrome.runtime.sendMessage({ action: 'ocr-result', text: resultText || '[BAXUS] Nenhum texto encontrado na seleção.' });
    // Busca garrafas após extração usando helper carregado
    waitForHelperAndSearch(resultText);
  } catch (err) {
    console.error('[BAXUS] ERRO extractSelectedArea:', err);
    chrome.runtime.sendMessage({ action: 'ocr-result', text: '[ERRO] Falha ao extrair texto DOM: ' + err });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[BAXUS] onMessage', request);
  console.log('[BAXUS] Mensagem recebida:', request);
  if (request.action === 'start-ocr-selection') {
    createOverlay();
  }

});


