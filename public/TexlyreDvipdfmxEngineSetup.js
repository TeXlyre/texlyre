// public/TexlyreDvipdfmxEngineSetup.js
(function() {
  // Set the path for the engine - this must match where the file is actually located
  window.ENGINE_PATH = './texlyredvipdfm.js';

  // Load the DvipdfmxEngine script dynamically
  const script = document.createElement('script');
  script.src = './DvipdfmxEngine.js';
  script.onload = function() {
    console.log('DvipdfmxEngine script loaded successfully');
    // Notify any listeners that the engine is ready
    if (window.onDvipdfmxEngineReady) {
      window.onDvipdfmxEngineReady();
    }
  };
  script.onerror = function(error) {
    console.error('Failed to load DvipdfmxEngine script', error);
  };

  window.isTeXEngineAvailable = function() {
    return typeof window.DvipdfmxEngine === 'function';
  };

  document.head.appendChild(script);

})();