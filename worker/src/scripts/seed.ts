import { connectMongo, mongoose } from "@pipeline/shared/db";
import { BrandModel } from "@pipeline/shared/models";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Seed the brand library (Noorstudio · NikahPlus · Merris · SacredChain · Vastara).
 * Idempotent: upserts by id. Run with `npm run seed`.
 *
 * Fields map to the cockpit's brand shape exactly. publishTarget is "draft" for
 * all so nothing pushes externally during testing; change per brand in the UI.
 */

const BRANDS = [
  {
    _id: "noorstudio",
    name: "Noorstudio",
    audience:
      "Parents with children aged 3–12 who want personalised books, meaningful gifts, bedtime stories, or Islamic/values-led story content.",
    positioning:
      "A premium AI storytelling studio for families and educators who want personalised books with warmth, values, and consistent visual quality.",
    voice:
      "Warm, imaginative, emotionally rich, and simple. Speak to parents and educators with care. Make the product feel magical but never childish in a cheap way. Use plain language, sensory detail, and family emotion.",
    dos: "wonder, warmth, family, memories, bedtime, learning, imagination, values, personalised, beautiful, gentle, meaningful, illustrated, gift-worthy, child-safe",
    nevers:
      "cold AI jargon, aggressive hype, generic content-creation language, overpromising, complex technical explanations, dark themes, cynical tone, low-quality template language",
    channels: ["blog", "instagram", "email"],
    keywords: [
      "personalised children's book",
      "custom storybook",
      "illustrated storybook",
      "bedtime story",
      "Islamic children's book",
      "Ramadan storybook",
      "Eid gift book",
      "character consistency",
      "AI story generator",
      "storybook maker",
    ],
    imageModel: "nano-banana",
    cadence: "weekly",
    publishTarget: "draft",
    gateThreshold: 85,
    runs: [],
  },
  {
    _id: "nikahplus",
    name: "NikahPlus",
    audience:
      "Practicing Muslim singles aged 24–45 who are serious about marriage and tired of shallow or unserious platforms.",
    positioning:
      "A premium Muslim marriage platform for intentional people who want clarity before emotional attachment.",
    voice:
      "Warm, direct, respectful, and mature. Speak with quiet confidence. Use plain language, avoid clichés, and never sound desperate, preachy, gimmicky, or overly romantic. Sound like a trusted advisor helping with one of life's most serious decisions.",
    dos: "warmth, clarity, seriousness, dignity, compatibility, trust, privacy, intention, emotional maturity, deen, family, practical guidance",
    nevers:
      "hype, manipulation, cringe romance, casual dating language, excessive slang, fear-mongering, judgmental religious tone, pickup culture, vague self-help clichés, overpromising marriage outcomes",
    channels: ["blog", "instagram", "email"],
    keywords: [
      "Muslim marriage",
      "halal marriage",
      "Muslim matchmaking",
      "Islamic marriage app",
      "marriage compatibility",
      "deen compatibility",
      "serious Muslim singles",
      "marriage readiness",
      "Muslim matrimony",
      "premium Muslim matchmaking",
    ],
    imageModel: "gpt-image-2",
    cadence: "weekly",
    publishTarget: "draft",
    gateThreshold: 85,
    runs: [],
  },
  {
    _id: "merris",
    name: "Merris",
    audience:
      "Sustainability consultants, ESG teams, climate reporting teams, and professional services firms that produce, review, or assure ESG outputs.",
    positioning:
      "The AI sustainability colleague for high-stakes ESG, climate, regulatory, and reporting workflows — an embedded domain intelligence layer, not a dashboard.",
    voice:
      "Precise, professional, analytical, and evidence-led. Sound like a senior ESG consultant or regulatory specialist: clear, structured, and commercially aware. Avoid generic climate activism language and SaaS fluff.",
    dos: "evidence, citations, materiality, assurance, regulation, benchmarking, sector context, risk, controls, traceability, governance, workflow, review, defensibility, professional judgment",
    nevers:
      "vague sustainability slogans, activist rhetoric, greenwashing, hype, generic AI assistant language, casual tone, unsupported claims, fluffy save-the-planet messaging, overpromising compliance",
    channels: ["blog", "x", "email"],
    keywords: [
      "ESG AI",
      "sustainability reporting",
      "CSRD",
      "ISSB",
      "TCFD",
      "ESG benchmarking",
      "regulatory intelligence",
      "double materiality",
      "Microsoft 365 ESG",
      "cited ESG analysis",
    ],
    imageModel: "gpt-image-2",
    cadence: "weekly",
    publishTarget: "draft",
    gateThreshold: 88,
    runs: [],
  },
  {
    _id: "sacredchain",
    name: "SacredChain",
    audience:
      "Brands, institutions, donors, collectors, charities, and marketplaces dealing with culturally significant, religious, charitable, or premium heritage-linked assets.",
    positioning:
      "A trust infrastructure brand for provenance, authenticity, and ethical custody in faith, heritage, and premium cultural commerce.",
    voice:
      "Reverent, precise, restrained, and trust-led. Speak like an institution that understands the seriousness of sacred, cultural, and charitable assets. Avoid crypto hype and never make the sacred feel commercialised.",
    dos: "trust, provenance, custody, authenticity, heritage, ethical sourcing, chain of custody, transparency, verification, record, certificate, dignity, institution, preservation, confidence",
    nevers:
      "crypto bro language, speculation, hype, moon, token pump, gamification, gimmicks, disrespectful religious language, shallow luxury language, exaggerated guarantees, spiritual manipulation",
    channels: ["blog", "x", "email"],
    keywords: [
      "provenance",
      "chain of custody",
      "authenticity",
      "waqf transparency",
      "donation traceability",
      "ethical sourcing",
      "digital certificate",
      "anti-counterfeit",
      "verified origin",
      "heritage commerce",
    ],
    imageModel: "gpt-image-2",
    cadence: "weekly",
    publishTarget: "draft",
    gateThreshold: 88,
    runs: [],
  },
  {
    _id: "vastara",
    name: "Vastara",
    audience:
      "Homeowners and renters who want to redesign rooms, decorate their home, or visualise renovation ideas before spending money.",
    positioning:
      "A global-style AI home design companion for people who want culturally rich, practical, and visually beautiful interiors and exteriors.",
    voice:
      "Elegant, practical, visual, and culturally aware. Speak like a tasteful interior designer who can translate global styles into real homes. Be specific about materials, light, colour, layout, texture, and cultural design cues.",
    dos: "style, texture, light, palette, layout, proportion, materials, atmosphere, courtyard, calm, warmth, craft, pattern, minimalism, natural materials, indoor-outdoor flow, transformation, visualisation",
    nevers:
      "generic décor clichés, cheap luxury, cultural stereotypes, vague make-it-aesthetic language, impractical renovation ideas, cluttered maximalism unless requested, unrealistic design claims, one-style-fits-all advice",
    channels: ["blog", "instagram", "email"],
    keywords: [
      "AI interior design",
      "AI home design",
      "room redesign app",
      "camera interior design",
      "AI room makeover",
      "Moroccan interior design",
      "Japandi",
      "exterior design app",
      "before and after home design",
      "furniture visualizer",
    ],
    imageModel: "gpt-image-2",
    cadence: "weekly",
    publishTarget: "draft",
    gateThreshold: 85,
    runs: [],
  },
] as const;

async function seed(): Promise<void> {
  await connectMongo(config.mongoUri);

  for (const brand of BRANDS) {
    await BrandModel.findByIdAndUpdate(brand._id, brand, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
    logger.info({ id: brand._id, name: brand.name }, "seeded brand");
  }

  logger.info({ count: BRANDS.length }, "seed complete");
  await mongoose.disconnect();
}

seed().catch((err) => {
  logger.error({ err }, "seed failed");
  process.exit(1);
});
