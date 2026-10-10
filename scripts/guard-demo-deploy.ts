import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile("content/content.config.json", "utf8")) as {
  contentMode?: string;
};
if (config.contentMode === "demo" && process.env.ALLOW_DEMO_DEPLOY !== "true") {
  console.error(
    "Η ανάπτυξη σταμάτησε: το περιεχόμενο είναι ακόμη σε λειτουργία demo. Ορίστε ALLOW_DEMO_DEPLOY=true μόνο για εσκεμμένη επίδειξη."
  );
  process.exitCode = 1;
} else {
  console.log(`Έλεγχος περιεχομένου: ${config.contentMode ?? "άγνωστο"}.`);
}
