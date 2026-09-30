// public/TexlyreXeTeXEngineSetup.js
(function () {
  window.ENGINE_PATH = './core/swiftlatex/texlyrexetex.js';

  // Load the XeTeXEngine script dynamically
  const script = document.createElement('script');
  script.src = './core/swiftlatex/XeTeXEngine.js';
  script.onload = function () {
    console.log('XeTeXEngine script loaded successfully');
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