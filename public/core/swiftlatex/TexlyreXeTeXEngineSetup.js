// public/TexlyreXeTeXEngineSetup.js
(function () {
  // Set the path for the engine - this must match where the file is actually located
  window.ENGINE_PATH = './core/swiftlatex/texlyrexetex.js';

  // Load the XeTeXEngine script dynamically
  const script = document.createElement('script');
  script.src = './core/swiftlatex/XeTeXEngine.js';
  script.onload = function () {
    console.log('XeTeXEngine script loaded successfully');
    // Notify any listeners that the engine is ready
    if (window.onXeTeXEngineReady) {
      window.onXeTeXEngineReady();
    }
  };
  script.onerror = function (error) {
    console.error('Failed to load XeTeXEngine script', error);
  };

  window.isTeXEngineAvailable = function () {
    return typeof window.XeTeXEngine === 'function';
  };

  document.head.appendChild(script);

})();