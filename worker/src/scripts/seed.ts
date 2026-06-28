import { connectMongo, mongoose } from "@pipeline/shared/db";
import { BrandModel } from "@pipeline/shared/models";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Seed the demo "NoorStudio" brand (formerly hard-coded in the cockpit).
 * Idempotent: upserts by id. Run with `npm run seed --workspace worker`.
 */
async function seed(): Promise<void> {
  await connectMongo(config.mongoUri);

  const noor = {
    _id: "noorstudio",
    name: "NoorStudio",
    audience: "Muslim parents of children aged 4–10",
    positioning: "Gentle Islamic stories parents can teach at home",
    voice:
      "Warm, reassuring, plain language. Speaks to parents as capable teachers. " +
      "Concrete over abstract, short sentences, never preachy.",
    dos: "warmth, specificity, calm confidence",
    nevers: "hype, jargon, talking down to parents",
    channels: ["blog", "instagram", "email"],
    keywords: [
      "teaching zakat to kids",
      "ramadan activities children",
      "islamic bedtime stories",
    ],
    imageModel: "nano-banana",
    cadence: "weekly",
    publishTarget: "draft",
    gateThreshold: 85,
    runs: [
      {
        id: "r0",
        at: Date.now() - 86_400_000 * 2,
        outcome: "published",
        title: "Teaching zakat to young children at home",
      },
    ],
  };

  await BrandModel.findByIdAndUpdate(noor._id, noor, {
    upsert: true,
    setDefaultsOnInsert: true,
  });
  logger.info({ id: noor._id }, "seeded brand");

  await mongoose.disconnect();
}

seed().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});
