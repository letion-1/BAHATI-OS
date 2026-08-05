import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const inputDirectory = path.join(
  process.cwd(),
  "public",
  "proposal-yacht"
);

const images = [
  ["hero-exterior.png", "hero-exterior.jpg"],
  ["salon.png", "salon.jpg"],
  ["master-cabin.png", "master-cabin.jpg"],
  ["jacuzzi-deck.png", "jacuzzi-deck.jpg"],
  ["beach-club.png", "beach-club.jpg"],
  ["aerial-view.png", "aerial-view.jpg"],
];

async function compressImages() {
  await fs.access(inputDirectory);

  for (const [inputName, outputName] of images) {
    const inputPath = path.join(inputDirectory, inputName);
    const outputPath = path.join(inputDirectory, outputName);

    await sharp(inputPath)
      .rotate()
      .resize({
        width: 1600,
        height: 1100,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 76,
        progressive: true,
        mozjpeg: true,
      })
      .toFile(outputPath);

    const outputStats = await fs.stat(outputPath);

    console.log(
      `Created ${outputName}: ${(
        outputStats.size /
        1024 /
        1024
      ).toFixed(2)} MB`
    );
  }

  console.log("All proposal images compressed successfully.");
}

compressImages().catch((error) => {
  console.error("Image compression failed:", error);
  process.exit(1);
});