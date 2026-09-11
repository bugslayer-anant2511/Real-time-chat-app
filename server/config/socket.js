import { Server } from 'socket.io';

export const createSocketServer = (httpServer, env) =>
  new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || env.NODE_ENV === 'development') {
          callback(null, true);
        } else {
          callback(null, env.CLIENT_URL);
        }
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25_000,
    pingTimeout: 60_000,
    maxHttpBufferSize: 1e6,
  });

export default createSocketServer;
