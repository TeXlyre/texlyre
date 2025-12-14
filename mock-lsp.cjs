const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 7000 });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    const msgStr = message.toString();
    const msg = JSON.parse(msgStr);

    // Initialize
    if (msg.method === 'initialize') {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          capabilities: {
            completionProvider: { triggerCharacters: ['@'] },
            hoverProvider: true,
            textDocumentSync: 1,  // Full sync
            diagnosticProvider: true,
            definitionProvider: true,
            documentFormattingProvider: true,
          }
        }
      }));
    }

    // Initialized notification
    else if (msg.method === 'initialized') {
      console.log('Client initialized');

      // Send a sample diagnostic after 1 second
      setTimeout(() => {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'textDocument/publishDiagnostics',
          params: {
            uri: 'file:///new_file.tex',
            diagnostics: [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 5 }
                },
                severity: 2, // Warning
                message: 'This is a test warning from Generic LSP',
                source: 'mock-lsp'
              }
            ]
          }
        }));
      }, 1000);
    }

    // Autocomplete
    else if (msg.method === 'textDocument/completion') {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          isIncomplete: false,
          items: [
            {
              label: '@blabla',
              kind: 1,
              detail: 'Mock LSP - Blabla command',
              insertText: '@blabla{$1}',
              insertTextFormat: 2,
              documentation: 'This is from the Generic LSP mock server!'
            },
            {
              label: '@foobar',
              kind: 1,
              detail: 'Mock LSP - Foobar function',
              insertText: '@foobar($1)',
              insertTextFormat: 2,
              documentation: 'Another test completion from Generic LSP'
            },
            {
              label: '@testtesttest',
              kind: 1,
              detail: 'Mock LSP - Test item',
              insertText: '@testtesttest',
              insertTextFormat: 1
            }
          ]
        }
      }));
    }

    // Hover
    else if (msg.method === 'textDocument/hover') {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          contents: {
            kind: 'markdown',
            value: '🎉 **Generic LSP Mock Server**\n\nYou are hovering over text!\n\nType `@` to see custom completions.'
          }
        }
      }));
    }

    // Other methods
    else {
      console.log('Method:', msg.method);
    }
  });
});

console.log('Mock LSP server running on ws://localhost:7000');
console.log('Trigger character: @ (type @ to see completions)');
