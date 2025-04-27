chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ocr-result') {
    // Repassa resultado para popup
    chrome.runtime.sendMessage({ action: 'ocr-result', text: request.text });
  }
});
