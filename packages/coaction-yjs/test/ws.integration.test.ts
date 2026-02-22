import { create } from 'coaction';
import * as Y from 'yjs';
import { bindYjs } from '../src';

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitFor = async (assertion: () => void, timeout = 1000) => {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await wait(10);
    }
  }
  throw lastError;
};

type WsMessageData = Uint8Array | ArrayBuffer;

type WsOpenEvent = {
  type: 'open';
};

type WsMessageEvent = {
  type: 'message';
  data: WsMessageData;
};

type WsCloseEvent = {
  type: 'close';
};

const normalizeUpdate = (data: WsMessageData) =>
  data instanceof Uint8Array ? data : new Uint8Array(data);

class MockWsServer {
  private roomClients = new Map<string, Set<MockWebSocket>>();

  private roomDocs = new Map<string, Y.Doc>();

  connect(client: MockWebSocket) {
    const room = client.room;
    if (!this.roomClients.has(room)) {
      this.roomClients.set(room, new Set());
    }
    this.roomClients.get(room)!.add(client);
    const doc = this.getRoomDoc(room);
    const snapshot = Y.encodeStateAsUpdate(doc);
    if (snapshot.byteLength > 0) {
      client.receive(snapshot);
    }
  }

  disconnect(client: MockWebSocket) {
    const clients = this.roomClients.get(client.room);
    if (!clients) {
      return;
    }
    clients.delete(client);
    if (clients.size === 0) {
      this.roomClients.delete(client.room);
      this.roomDocs.delete(client.room);
    }
  }

  broadcast(client: MockWebSocket, data: WsMessageData) {
    const update = normalizeUpdate(data);
    const room = client.room;
    const doc = this.getRoomDoc(room);
    Y.applyUpdate(doc, update, client);
    const peers = this.roomClients.get(room);
    if (!peers) {
      return;
    }
    for (const peer of peers) {
      if (peer === client || peer.readyState !== MockWebSocket.OPEN) {
        continue;
      }
      peer.receive(update);
    }
  }

  private getRoomDoc(room: string) {
    if (!this.roomDocs.has(room)) {
      this.roomDocs.set(room, new Y.Doc());
    }
    return this.roomDocs.get(room)!;
  }
}

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  readonly room: string;

  readonly server: MockWsServer;

  readyState = MockWebSocket.CONNECTING;

  onopen?: (event: WsOpenEvent) => void;

  onmessage?: (event: WsMessageEvent) => void;

  onclose?: (event: WsCloseEvent) => void;

  constructor(server: MockWsServer, room: string) {
    this.server = server;
    this.room = room;
    queueMicrotask(() => {
      if (this.readyState !== MockWebSocket.CONNECTING) {
        return;
      }
      this.readyState = MockWebSocket.OPEN;
      this.server.connect(this);
      this.onopen?.({
        type: 'open'
      });
    });
  }

  send(data: WsMessageData) {
    if (this.readyState !== MockWebSocket.OPEN) {
      return;
    }
    this.server.broadcast(this, data);
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.server.disconnect(this);
    this.onclose?.({
      type: 'close'
    });
  }

  receive(data: Uint8Array) {
    if (this.readyState !== MockWebSocket.OPEN) {
      return;
    }
    this.onmessage?.({
      type: 'message',
      data: new Uint8Array(data)
    });
  }
}

class MockWsProvider {
  private readonly origin = Symbol('mock-ws-provider');

  private readonly pending: Uint8Array[] = [];

  private connected = false;

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this.origin) {
      return;
    }
    const next = new Uint8Array(update);
    if (!this.connected || this.ws.readyState !== MockWebSocket.OPEN) {
      this.pending.push(next);
      return;
    }
    this.ws.send(next);
  };

  readonly ws: MockWebSocket;

  constructor(
    private readonly server: MockWsServer,
    private readonly room: string,
    private readonly doc: Y.Doc
  ) {
    this.ws = new MockWebSocket(server, room);
    this.ws.onopen = () => {
      this.connected = true;
      const snapshot = Y.encodeStateAsUpdate(this.doc);
      if (snapshot.byteLength > 0) {
        this.ws.send(snapshot);
      }
      while (this.pending.length > 0) {
        const update = this.pending.shift()!;
        this.ws.send(update);
      }
    };
    this.ws.onmessage = (event) => {
      Y.applyUpdate(this.doc, normalizeUpdate(event.data), this.origin);
    };
    this.doc.on('update', this.onDocUpdate);
  }

  destroy() {
    this.doc.off('update', this.onDocUpdate);
    this.ws.close();
  }
}

type PlayerState = {
  count: number;
  profile: {
    name: string;
  };
  increment: () => void;
  rename: (name: string) => void;
};

const createPlayerStore = (id: string) =>
  create<PlayerState>(
    (set) => ({
      count: 0,
      profile: {
        name: id
      },
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      },
      rename(name: string) {
        set((draft) => {
          draft.profile.name = name;
        });
      }
    }),
    {
      name: `player-${id}`
    }
  );

const createPlayer = (server: MockWsServer, id: string, room: string) => {
  const doc = new Y.Doc();
  const store = createPlayerStore(id);
  const binding = bindYjs(store, {
    doc,
    key: 'room-state'
  });
  const provider = new MockWsProvider(server, room, doc);
  return {
    store,
    binding,
    provider,
    destroy: () => {
      provider.destroy();
      binding.destroy();
      store.destroy();
      doc.destroy();
    }
  };
};

test('syncs two players over websocket mock transport', async () => {
  const server = new MockWsServer();
  const playerA = createPlayer(server, 'alice', 'room-1');
  const playerB = createPlayer(server, 'bob', 'room-1');

  await waitFor(() => {
    expect(playerA.provider.ws.readyState).toBe(MockWebSocket.OPEN);
    expect(playerB.provider.ws.readyState).toBe(MockWebSocket.OPEN);
  });
  playerA.binding.syncNow();
  playerB.binding.syncNow();
  await waitFor(() => {
    expect(playerA.store.getState().count).toBe(0);
    expect(playerB.store.getState().count).toBe(0);
    expect(playerA.store.getState().profile.name).toBe(
      playerB.store.getState().profile.name
    );
  });

  playerA.store.getState().increment();

  await waitFor(() => {
    expect(playerB.store.getState().count).toBe(1);
  });

  playerB.store.getState().rename('robert');

  await waitFor(() => {
    expect(playerA.store.getState().profile.name).toBe('robert');
  });

  // Verify local methods still work after remote sync.
  playerA.store.getState().increment();

  await waitFor(() => {
    expect(playerA.store.getState().count).toBe(2);
    expect(playerB.store.getState().count).toBe(2);
  });

  playerA.destroy();
  playerB.destroy();
});

test('late-joining player hydrates from websocket room state', async () => {
  const server = new MockWsServer();
  const earlyPlayer = createPlayer(server, 'early', 'room-2');

  await waitFor(() => {
    expect(earlyPlayer.provider.ws.readyState).toBe(MockWebSocket.OPEN);
  });
  earlyPlayer.binding.syncNow();
  await wait(20);
  earlyPlayer.store.getState().increment();
  earlyPlayer.store.getState().rename('captain');
  earlyPlayer.binding.syncNow();

  await wait(30);

  const lateDoc = new Y.Doc();
  const lateProvider = new MockWsProvider(server, 'room-2', lateDoc);
  await waitFor(() => {
    expect(lateProvider.ws.readyState).toBe(MockWebSocket.OPEN);
  });
  await wait(20);

  const lateStore = createPlayerStore('late');
  const lateBinding = bindYjs(lateStore, {
    doc: lateDoc,
    key: 'room-state'
  });

  await waitFor(() => {
    expect(lateStore.getState().count).toBe(1);
    expect(lateStore.getState().profile.name).toBe('captain');
  });

  lateProvider.destroy();
  lateBinding.destroy();
  lateStore.destroy();
  lateDoc.destroy();
  earlyPlayer.destroy();
});
