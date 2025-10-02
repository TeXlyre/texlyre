// public/TexlyrePdfTeXEngineSetup.js
(function () {
  // Set the path for the engine - this must match where the file is actually located
  window.ENGINE_PATH = './core/swiftlatex/texlyrepdftex.js';

  // Load the PdfTeXEngine script dynamically
  const script = document.createElement('script');
  script.src = './core/swiftlatex/PdfTeXEngine.js';
  script.onload = function () {
    console.log('PdfTeXEngine script loaded successfully');
    // Notify any listeners that the engine is ready
    if (window.onPdfTeXEngineReady) {
      window.onPdfTeXEngineReady();
    }
  };
  script.onerror = function (error) {
    console.error('Failed to load PdfTeXEngine script', error);
  };

  window.isTeXEngineAvailable = function () {
    return typeof window.PdfTeXEngine === 'function';
  };

  document.head.appendChild(script);

})();