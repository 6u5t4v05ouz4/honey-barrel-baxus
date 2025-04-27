document.getElementById('start-ocr').addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tabs || !tabs[0] || !tabs[0].id) {
      console.error('[BAXUS] No active tab found');
      return;
    }
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'start-ocr-selection' });
    window.close(); // Fecha o popup após enviar o comando
  } catch (error) {
    console.error('[BAXUS] Error starting selection:', error);
  }
});

// Recebe resultado do OCR
document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ocr-result') {
      document.getElementById('ocr-result').innerText = request.text || 'No text found.';
    }
  });
});
