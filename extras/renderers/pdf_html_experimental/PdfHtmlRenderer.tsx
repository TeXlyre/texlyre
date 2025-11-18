// extras/renderers/pdf_html_experimental/PdfHtmlRenderer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import type { RendererProps } from '@/plugins/PluginInterface';
import './styles.css';

const PdfHtmlRenderer: React.FC<RendererProps> = ({
  content,
  fileName,
  onDownload
}) => {
  const { getSetting } = useSettings();
  const pdfHtmlRendererEnable =
    getSetting('pdfhtml-renderer-enable')?.value as boolean ?? true;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentBlobRef = useRef<string | null>(null);
  const viewerBlobRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (contentBlobRef.current) {
      URL.revokeObjectURL(contentBlobRef.current);
      contentBlobRef.current = null;
    }
    if (viewerBlobRef.current) {
      URL.revokeObjectURL(viewerBlobRef.current);
      viewerBlobRef.current = null;
    }
  }, []);

  const createViewerHTML = useCallback(
    (pdfBlobUrl: string) => {
      return `<!DOCTYPE html>
<html dir="ltr" mozdisallowselectionprint>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>PDF.js viewer</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.css">
  <style>
    body { margin: 0; padding: 0; background: #404040; }
    #outerContainer { width: 100%; height: 100vh; position: relative; }
    #sidebarContainer { position: absolute; top: 32px; left: 0; bottom: 0; width: 200px; background: #474747; z-index: 100; border-right: 1px solid #333; transition: left 200ms ease; }
    #sidebarContainer.hidden { left: -200px; }
    #mainContainer { position: absolute; top: 0; right: 0; bottom: 0; left: 0; min-width: 320px; transition: left 200ms ease; }
    #sidebarContainer:not(.hidden) + #mainContainer { left: 200px; }
    .toolbar { position: relative; z-index: 9999; cursor: default; border-bottom: 1px solid #333; background: #474747; height: 32px; display: flex; align-items: center; padding: 0 4px; }
    .toolbarButton { background: none; border: 1px solid transparent; color: #d9d9d9; cursor: pointer; padding: 2px 6px 0; margin: 3px 2px 4px 0; min-height: 25px; font-size: 12px; border-radius: 2px; }
    .toolbarButton:hover { background: #5a5a5a; border-color: #5a5a5a; }
    .toolbarButton:disabled { opacity: 0.5; cursor: not-allowed; }
    .toolbarField { background: #5a5a5a; border: 1px solid #666; color: #d9d9d9; font-size: 12px; padding: 3px; border-radius: 2px; }
    .pageNumber { width: 60px; text-align: center; }
    #toolbarViewerLeft { display: flex; align-items: center; flex: 1; gap: 4px; }
    #toolbarViewerRight { display: flex; align-items: center; margin-left: auto; gap: 4px; }
    #toolbarViewerMiddle { display: flex; align-items: center; margin: 0 10px; gap: 4px; }
    .splitToolbarButton { display: flex; }
    .splitToolbarButtonSeparator { width: 1px; background: #666; margin: 4px 0; }
    #viewerContainer { position: absolute; top: 32px; right: 0; bottom: 0; left: 0; overflow: auto; background: #404040; }
    .pdfViewer { padding: 10px; }
    .findbar { position: absolute; top: 32px; right: 0; left: 0; background: #474747; border-bottom: 1px solid #333; padding: 4px; z-index: 10000; }
    .findbar.hidden { display: none; }
    #findbarInputContainer { display: flex; align-items: center; gap: 4px; }
    #findInput { flex: 1; max-width: 200px; }
    .dropdownToolbarButton select { background: #5a5a5a; border: 1px solid #666; color: #d9d9d9; font-size: 12px; padding: 3px; border-radius: 2px; }
    #errorWrapper { background: #dc3545; color: white; left: 0; position: absolute; right: 0; top: 32px; z-index: 1000; padding: 3px 6px; }
    .hidden { display: none !important; }
    
    /* Text selection styles */
    .textLayer { position: absolute; left: 0; top: 0; right: 0; bottom: 0; overflow: hidden; opacity: 0.2; line-height: 1.0; z-index: 2; }
    .textLayer > span { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; user-select: text; }
    .textLayer .highlight { margin: -1px; padding: 1px; background: rgba(180, 0, 255, 0.25); border-radius: 4px; }
    .textLayer .highlight.selected { background: rgba(0, 100, 255, 0.25); }
    
    /* Annotation layer styles */
    .annotationLayer { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 3; }
    .annotationLayer section { position: absolute; text-align: initial; pointer-events: auto; }
    .annotationLayer .linkAnnotation > a { pointer-events: auto; }
  </style>
</head>
<body>
  <div id="outerContainer">
    <div id="sidebarContainer" class="hidden">
      <div id="toolbarSidebar">
        <div class="splitToolbarButton toggled">
          <button id="viewThumbnail" class="toolbarButton toggled" title="Show Thumbnails">Thumbnails</button>
          <button id="viewOutline" class="toolbarButton" title="Show Document Outline">Outline</button>
          <button id="viewAttachments" class="toolbarButton" title="Show Attachments">Attachments</button>
        </div>
      </div>
      <div id="sidebarContent">
        <div id="thumbnailView"></div>
        <div id="outlineView" class="hidden"></div>
        <div id="attachmentsView" class="hidden"></div>
      </div>
    </div>
    
    <div id="mainContainer">
      <div class="findbar hidden" id="findbar">
        <div id="findbarInputContainer">
          <input id="findInput" class="toolbarField" placeholder="Find in document…" tabindex="91">
          <div class="splitToolbarButton">
            <button id="findPrevious" class="toolbarButton" title="Find previous" tabindex="92">Previous</button>
            <div class="splitToolbarButtonSeparator"></div>
            <button id="findNext" class="toolbarButton" title="Find next" tabindex="93">Next</button>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-left: 8px;">
          <input type="checkbox" id="findHighlightAll" class="toolbarField" tabindex="94">
          <label for="findHighlightAll" style="font-size: 12px;">Highlight all</label>
          <input type="checkbox" id="findMatchCase" class="toolbarField" tabindex="95">
          <label for="findMatchCase" style="font-size: 12px;">Match case</label>
        </div>
        <div style="margin-left: 8px;">
          <span id="findResultsCount" class="toolbarLabel" style="font-size: 12px;"></span>
          <span id="findMsg" class="toolbarLabel" style="font-size: 12px;"></span>
        </div>
      </div>
      
      <div class="toolbar" id="toolbarContainer">
        <div id="toolbarViewerLeft">
          <button id="sidebarToggle" class="toolbarButton" title="Toggle Sidebar" tabindex="11">☰</button>
          <button id="viewFind" class="toolbarButton" title="Find in Document" tabindex="12">🔍</button>
          <div class="splitToolbarButton">
            <button class="toolbarButton" title="Previous Page" id="previous" tabindex="13">◀</button>
            <div class="splitToolbarButtonSeparator"></div>
            <button class="toolbarButton" title="Next Page" id="next" tabindex="14">▶</button>
          </div>
          <input type="number" id="pageNumber" class="toolbarField pageNumber" title="Page" value="1" size="4" min="1" tabindex="15">
          <span id="numPages" class="toolbarLabel"></span>
        </div>
        <div id="toolbarViewerMiddle">
          <div class="splitToolbarButton">
            <button id="zoomOut" class="toolbarButton" title="Zoom Out" tabindex="21">−</button>
            <div class="splitToolbarButtonSeparator"></div>
            <button id="zoomIn" class="toolbarButton" title="Zoom In" tabindex="22">+</button>
          </div>
          <select id="scaleSelect" title="Zoom" tabindex="23" class="dropdownToolbarButton">
            <option id="pageAutoOption" title="" value="auto" selected>Automatic Zoom</option>
            <option id="pageActualOption" title="" value="page-actual">Actual Size</option>
            <option id="pageFitOption" title="" value="page-fit">Page Fit</option>
            <option id="pageWidthOption" title="" value="page-width">Page Width</option>
            <option id="customScaleOption" title="" value="custom" disabled hidden></option>
            <option title="" value="0.5">50%</option>
            <option title="" value="0.75">75%</option>
            <option title="" value="1">100%</option>
            <option title="" value="1.25">125%</option>
            <option title="" value="1.5">150%</option>
            <option title="" value="2">200%</option>
            <option title="" value="3">300%</option>
            <option title="" value="4">400%</option>
          </select>
        </div>
        <div id="toolbarViewerRight">
          <button id="presentationMode" class="toolbarButton" title="Switch to Presentation Mode" tabindex="31">📽</button>
          <button id="print" class="toolbarButton" title="Print" tabindex="32">🖨</button>
          <button id="download" class="toolbarButton" title="Download" tabindex="33">💾</button>
        </div>
      </div>
      
      <div id="viewerContainer" tabindex="0">
        <div id="viewer" class="pdfViewer"></div>
      </div>
      
      <div id="errorWrapper" class="hidden">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span id="errorMessage"></span>
          <button id="errorClose" style="background: none; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 8px; border-radius: 2px; cursor: pointer;">Close</button>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    // Import the viewer components from the global scope after the script loads
    function loadPdfViewer() {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.js';
        script.onload = () => {
          console.log('PDF viewer loaded, available components:', Object.keys(pdfjsViewer || {}));
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    let PDFViewerApplication = {
      pdfDocument: null,
      pdfViewer: null,
      pdfHistory: null,
      pdfLinkService: null,
      eventBus: null,
      findController: null,
      customDownload: ${!!onDownload},
      fileName: '${fileName || 'document.pdf'}',
      
      async initialize() {
        try {
          console.log('Loading PDF viewer components...');
          await loadPdfViewer();
          
          console.log('Initializing PDF viewer application...');
          
          // Set worker source
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          this.eventBus = new pdfjsViewer.EventBus();
          this.pdfLinkService = new pdfjsViewer.PDFLinkService({
            eventBus: this.eventBus,
          });
          this.pdfHistory = new pdfjsViewer.PDFHistory({
            eventBus: this.eventBus,
            linkService: this.pdfLinkService,
          });
          this.findController = new pdfjsViewer.PDFFindController({
            eventBus: this.eventBus,
            linkService: this.pdfLinkService,
          });
          
          this.pdfViewer = new pdfjsViewer.PDFViewer({
            container: document.getElementById('viewerContainer'),
            viewer: document.getElementById('viewer'),
            eventBus: this.eventBus,
            linkService: this.pdfLinkService,
            findController: this.findController,
            enhanceTextSelection: true,
            enableScripting: false,
            renderInteractiveForms: true,
            textLayerMode: 2, // Enable text selection
            annotationMode: 2, // Enable annotations
          });
          
          this.pdfLinkService.setViewer(this.pdfViewer);
          this.pdfHistory.initialize({ fingerprint: '' });
          
          this.bindEvents();
          await this.open();
        } catch (error) {
          console.error('Failed to initialize viewer:', error);
          this.error('Failed to initialize PDF viewer: ' + error.message);
        }
      },
      
      bindEvents() {
        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
          document.getElementById('sidebarContainer').classList.toggle('hidden');
        });
        
        // Navigation
        document.getElementById('previous').addEventListener('click', () => {
          this.eventBus.dispatch('previouspage', { source: this });
        });
        document.getElementById('next').addEventListener('click', () => {
          this.eventBus.dispatch('nextpage', { source: this });
        });
        
        // Zoom
        document.getElementById('zoomIn').addEventListener('click', () => {
          this.pdfViewer.increaseScale();
        });
        document.getElementById('zoomOut').addEventListener('click', () => {
          this.pdfViewer.decreaseScale();
        });
        
        // Page number
        document.getElementById('pageNumber').addEventListener('change', (evt) => {
          const val = parseInt(evt.target.value);
          if (val && !isNaN(val) && val > 0 && val <= this.pdfViewer.pagesCount) {
            this.pdfLinkService.page = val;
          } else {
            evt.target.value = this.pdfLinkService.page;
          }
        });
        
        // Scale select
        document.getElementById('scaleSelect').addEventListener('change', (evt) => {
          if (evt.target.value === 'custom') return;
          this.pdfViewer.currentScaleValue = evt.target.value;
        });
        
        // Find
        document.getElementById('viewFind').addEventListener('click', () => {
          document.getElementById('findbar').classList.toggle('hidden');
          document.getElementById('findInput').focus();
        });
        
        document.getElementById('findInput').addEventListener('input', (evt) => {
          this.findController.executeCommand('find', {
            query: evt.target.value,
            highlightAll: document.getElementById('findHighlightAll').checked,
            caseSensitive: document.getElementById('findMatchCase').checked,
          });
        });
        
        document.getElementById('findPrevious').addEventListener('click', () => {
          this.findController.executeCommand('findagain', { findPrevious: true });
        });
        
        document.getElementById('findNext').addEventListener('click', () => {
          this.findController.executeCommand('findagain', { findPrevious: false });
        });
        
        document.getElementById('findHighlightAll').addEventListener('change', (evt) => {
          this.findController.executeCommand('find', {
            query: document.getElementById('findInput').value,
            highlightAll: evt.target.checked,
            caseSensitive: document.getElementById('findMatchCase').checked,
          });
        });
        
        document.getElementById('findMatchCase').addEventListener('change', (evt) => {
          this.findController.executeCommand('find', {
            query: document.getElementById('findInput').value,
            highlightAll: document.getElementById('findHighlightAll').checked,
            caseSensitive: evt.target.checked,
          });
        });
        
        // Other controls
        document.getElementById('download').addEventListener('click', () => this.download());
        document.getElementById('print').addEventListener('click', () => window.print());
        document.getElementById('presentationMode').addEventListener('click', () => {
          this.pdfViewer.presentationModeState = this.pdfViewer.presentationModeState === 0 ? 1 : 0;
        });
        
        // Event bus listeners
        this.eventBus.on('pagechanging', (evt) => {
          document.getElementById('pageNumber').value = evt.pageNumber;
          document.getElementById('numPages').textContent = \`of \${this.pdfViewer.pagesCount}\`;
        });
        
        this.eventBus.on('scalechanging', (evt) => {
          const select = document.getElementById('scaleSelect');
          const customOption = document.getElementById('customScaleOption');
          const predefinedValueFound = Array.from(select.options).some(option => {
            return option.value !== 'custom' && Math.abs(parseFloat(option.value) - evt.scale) < 0.01;
          });
          
          if (!predefinedValueFound) {
            customOption.textContent = \`\${Math.round(evt.scale * 100)}%\`;
            customOption.selected = true;
            customOption.hidden = false;
            customOption.disabled = false;
          }
        });
        
        this.eventBus.on('updatefindcontrolstate', (evt) => {
          const resultCount = document.getElementById('findResultsCount');
          const findMsg = document.getElementById('findMsg');
          
          if (evt.state === 1) { // FOUND
            resultCount.textContent = \`\${evt.matchesCount.current} of \${evt.matchesCount.total}\`;
            findMsg.textContent = '';
          } else if (evt.state === 2) { // NOT_FOUND
            resultCount.textContent = '';
            findMsg.textContent = 'Phrase not found';
          } else {
            resultCount.textContent = '';
            findMsg.textContent = '';
          }
        });
      },
      
      async open() {
        try {
          console.log('Loading PDF document...');
          
          const loadingTask = pdfjsLib.getDocument({
            url: '${pdfBlobUrl}',
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true,
          });
          
          this.pdfDocument = await loadingTask.promise;
          console.log('PDF document loaded, pages:', this.pdfDocument.numPages);
          
          await this.pdfViewer.setDocument(this.pdfDocument);
          this.pdfLinkService.setDocument(this.pdfDocument, null);
          this.pdfHistory.initialize({ fingerprint: this.pdfDocument.fingerprints[0] });
          
          document.getElementById('numPages').textContent = \`of \${this.pdfDocument.numPages}\`;
          document.getElementById('pageNumber').max = this.pdfDocument.numPages;
          
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'PDF_LOADED' }, '*');
          }
          
        } catch (reason) {
          console.error('Error loading PDF:', reason);
          this.error(\`Error loading PDF: \${reason.message || reason}\`);
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'PDF_ERROR', message: reason.message || reason }, '*');
          }
        }
      },
      
      download() {
        if (this.customDownload && window.parent !== window) {
          window.parent.postMessage({ type: 'DOWNLOAD_REQUEST' }, '*');
        } else if (this.pdfDocument) {
          this.pdfDocument.getData().then(data => {
            const blob = new Blob([data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          });
        }
      },
      
      error(message) {
        console.error(message);
        const errorWrapper = document.getElementById('errorWrapper');
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        errorWrapper.classList.remove('hidden');
        
        document.getElementById('errorClose').onclick = () => {
          errorWrapper.classList.add('hidden');
        };
      }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => PDFViewerApplication.initialize());
    } else {
      PDFViewerApplication.initialize();
    }
  </script>
</body>
</html>`;
    },
    [fileName, onDownload]
  );

  useEffect(() => {
    if (!pdfHtmlRendererEnable) {
      setError('Enhanced PDF renderer is disabled');
      setIsLoading(false);
      return;
    }

    if (
      !content ||
      !(content instanceof ArrayBuffer) ||
      content.byteLength === 0) {
      setError('Invalid or empty PDF content');
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const initViewer = async () => {
      cleanup();

      try {
        console.log('Creating PDF blob...', { size: content.byteLength });

        const pdfBlob = new Blob([content], { type: 'application/pdf' });
        const pdfBlobUrl = URL.createObjectURL(pdfBlob);
        contentBlobRef.current = pdfBlobUrl;

        console.log('Creating viewer HTML...');
        const viewerHTML = createViewerHTML(pdfBlobUrl);
        const viewerBlob = new Blob([viewerHTML], { type: 'text/html' });
        const viewerUrl = URL.createObjectURL(viewerBlob);
        viewerBlobRef.current = viewerUrl;

        if (isMounted && iframeRef.current) {
          console.log('Loading viewer iframe...');
          iframeRef.current.src = viewerUrl;
        }
      } catch (err) {
        console.error('PdfHtmlRenderer: Error creating viewer:', err);
        if (isMounted) {
          setError(`Failed to load PDF: ${err.message || err}`);
          setIsLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [content, pdfHtmlRendererEnable, cleanup, createViewerHTML]);

  const handleIframeLoad = useCallback(() => {
    console.log('Iframe loaded');
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    console.error('Iframe failed to load');
    setError('Failed to load PDF viewer');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DOWNLOAD_REQUEST' && onDownload && fileName) {
        onDownload(fileName);
      } else if (event.data?.type === 'PDF_LOADED') {
        setIsLoading(false);
        setError(null);
      } else if (event.data?.type === 'PDF_ERROR') {
        setError(event.data.message || 'Failed to load PDF');
        setIsLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onDownload, fileName]);

  if (!pdfHtmlRendererEnable) {
    return (
      <div className="pdf-renderer-container">
        <div className="pdf-renderer-error">{t('Enhanced PDF renderer is disabled. Please enable it in settings to use this renderer.')}


        </div>
      </div>);

  }

  return (
    <div className="pdf-renderer-container">
      <iframe
        ref={iframeRef}
        className="pdf-renderer-iframe"
        title={t('PDF Viewer')}
        onLoad={handleIframeLoad}
        onError={handleIframeError} />

      {isLoading &&
        <div className="pdf-renderer-loading">{t('Loading PDF document...')}</div>
      }
      {error && <div className="pdf-renderer-error">{error}</div>}
    </div>);

};

export default PdfHtmlRenderer;