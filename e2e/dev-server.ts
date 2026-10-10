import { createServer } from "vite";

export default async function startDevServer() {
  const server = await createServer({
    logLevel: "error",
    server: { host: "127.0.0.1", port: 4173, strictPort: true }
  });

  await server.listen();
  return async () => server.close();
}
