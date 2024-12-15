interface WindowShape {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WindowMetaData {
  foo: string;
}

interface WindowInfo {
  id: number;
  shape: WindowShape;
  metaData: WindowMetaData;
}

interface Message {
  type: string;
  payload?: any;
}

let windows: WindowInfo[] = [];
let tabCount = 0;
let ports: MessagePort[] = [];

function broadcast(message: Message) {
  ports.forEach((p) => p.postMessage(message));
}

// @ts-ignore
onconnect = function (e: any) {
  const port = e.ports[0];
  ports.push(port);

  port.postMessage({ type: 'WINDOWS_UPDATE', payload: windows });

  port.onmessage = (event: MessageEvent) => {
    const msg: Message = event.data;
    switch (msg.type) {
      case 'INIT':
        tabCount++;
        const newWin: WindowInfo = {
          id: tabCount,
          shape: msg.payload.shape,
          metaData: msg.payload.metaData
        };
        windows.push(newWin);
        broadcast({ type: 'WINDOWS_UPDATE', payload: windows });
        port.postMessage({ type: 'INIT_DONE', payload: { id: tabCount } });
        break;
      case 'UPDATE_SHAPE':
        {
          const { id, shape } = msg.payload;
          const idx = windows.findIndex((w) => w.id === id);
          if (idx > -1) {
            windows[idx].shape = shape;
            broadcast({ type: 'WINDOWS_UPDATE', payload: windows });
          }
        }
        break;
      case 'REMOVE_WINDOW':
        {
          const { id } = msg.payload;
          const idx = windows.findIndex((w) => w.id === id);
          if (idx > -1) {
            windows.splice(idx, 1);
            broadcast({ type: 'WINDOWS_UPDATE', payload: windows });
          }
        }
        break;
      default:
        break;
    }
  };

  port.onmessageerror = (err: any) => {
    console.error('Message error on Shared Worker port:', err);
  };
};
