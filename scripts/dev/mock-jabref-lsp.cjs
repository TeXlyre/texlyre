const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 2087 });

const bibEntries = [
  {
    label: 'einstein1905',
    kind: 1,
    detail: 'Article',
    insertText: 'einstein1905',
    documentation: 'Title: On the Electrodynamics of Moving Bodies\nAuthors: Albert Einstein\nYear: 1905\nJournal: Annalen der Physik'
  },
  {
    label: 'knuth1984',
    kind: 1,
    detail: 'Book',
    insertText: 'knuth1984',
    documentation: 'Title: The TeXbook\nAuthors: Donald E. Knuth\nYear: 1984\nBook: Addison-Wesley'
  },
  {
    label: 'lamport1994',
    kind: 1,
    detail: 'Book',
    insertText: 'lamport1994',
    documentation: 'Title: LaTeX: A Document Preparation System\nAuthors: Leslie Lamport\nYear: 1994\nBook: Addison-Wesley'
  },
  {
    label: 'turing1950',
    kind: 1,
    detail: 'Article',
    insertText: 'turing1950',
    documentation: 'Title: Computing Machinery and Intelligence\nAuthors: Alan M. Turing\nYear: 1950\nJournal: Mind'
  },
  {
    label: 'shannon1948',
    kind: 1,
    detail: 'Article',
    insertText: 'shannon1948',
    documentation: 'Title: A Mathematical Theory of Communication\nAuthors: Claude E. Shannon\nYear: 1948\nJournal: Bell System Technical Journal'
  },
  {
    label: 'dijkstra1968',
    kind: 1,
    detail: 'Article',
    insertText: 'dijkstra1968',
    documentation: 'Title: Go To Statement Considered Harmful\nAuthors: Edsger W. Dijkstra\nYear: 1968\nJournal: Communications of the ACM'
  },
  {
    label: 'vaswani2017',
    kind: 1,
    detail: 'Conference',
    insertText: 'vaswani2017',
    documentation: 'Title: Attention Is All You Need\nAuthors: Ashish Vaswani and Noam Shazeer and Niki Parmar\nYear: 2017\nConference: Advances in Neural Information Processing Systems'
  },
];

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    const msg = JSON.parse(message.toString());

    if (msg.method === 'initialize') {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          capabilities: {
            completionProvider: { triggerCharacters: ['\\', '{'] },
            hoverProvider: true,
            textDocumentSync: 1,
          }
        }
      }));
    }

    else if (msg.method === 'initialized') {
      console.log('Client initialized');
    }

    else if (msg.method === 'textDocument/completion') {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          isIncomplete: false,
          items: bibEntries
        }
      }));
    }

    else if (msg.method === 'textDocument/hover') {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          contents: {
            kind: 'markdown',
            value: '**JabRef Mock Server**\n\n7 bibliography entries available.'
          }
        }
      }));
    }

    else if (msg.method === 'workspace/didChangeConfiguration') {
      console.log('Configuration updated:', JSON.stringify(msg.params));
    }

    else {
      console.log('Unhandled method:', msg.method);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('Mock JabRef LSP server running on ws://localhost:2087');
console.log('Serving', bibEntries.length, 'bibliography entries');
