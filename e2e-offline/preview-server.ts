import { preview } from "vite";

export default async function startPreviewServer() {
  const server = await preview({
    logLevel: "error",
    preview: { host: "127.0.0.1", port: 4174, strictPort: true }
  });

  return async () =>
    new Promise<void>((resolve, reject) => {
      server.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
}
