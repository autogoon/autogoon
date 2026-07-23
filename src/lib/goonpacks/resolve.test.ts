import { describe, expect, it } from "@jest/globals";
import { PICTURES_SECTION } from "@/lib/companions/shared-prompt";
import type { Companion, CompanionPicture } from "@/lib/companions/companions";
import {
  applyOverlay,
  packToCompanion,
  resolveDefault,
  resolvePictureRef,
} from "./resolve";

const base: Companion = {
  id: "autogoon.aimee",
  name: "Aimee",
  description: "sweet",
  gender: "female",
  accent_colour: "emerald",
  voiceId: "v-base",
  systemPrompt: "hi\n{{PICTURES_SECTION}}",
  model: "m",
  contextWindow: 10,
  passesReasoning: true,
};
const overlay = (
  extra: object = {},
  pictures = [] as Companion["pictures"],
) => ({
  manifest: {
    format: 1,
    id: "g00ner.aimee",
    version: "1.0.0",
    base: "autogoon.aimee",
    ...extra,
  },
  pictures: pictures ?? [],
});

describe("applyOverlay", () => {
  it("keeps the base id and fields the overlay omits", () => {
    const out = applyOverlay(base, overlay());
    expect(out.id).toBe("autogoon.aimee");
    expect(out.voiceId).toBe("v-base");
  });
  it("replaces fields the overlay provides", () => {
    const out = applyOverlay(base, {
      ...overlay({ voiceId: "v-new", name: "Amy" }),
      systemPrompt: "yo {{NOT_A_SECTION}}",
    });
    expect(out.voiceId).toBe("v-new");
    expect(out.name).toBe("Amy");
    expect(out.systemPrompt).toBe("yo ");
  });
  it("fills PICTURES_SECTION when the overlay brings pictures", () => {
    const pics = [{ src: "blob:x", description: "d" }];
    expect(applyOverlay(base, overlay({}, pics)).systemPrompt).toBe(
      `hi\n${PICTURES_SECTION}`,
    );
    expect(applyOverlay(base, overlay()).systemPrompt).toBe("hi\n");
  });
});

describe("packToCompanion", () => {
  it("builds a companion with app defaults for omitted fields", () => {
    const c = packToCompanion({
      manifest: {
        format: 1,
        id: "some.one",
        version: "1",
        name: "One",
        voiceId: "v1",
      },
      systemPrompt: "p",
      pictures: [],
    });
    expect(c.id).toBe("some.one");
    expect(c.model).toBe("minimax/minimax-m3");
    expect(c.contextWindow).toBe(1_000_000);
    expect(c.passesReasoning).toBe(true);
    expect(c.gender).toBe("female");
    expect(c.accent_colour).toBe("pink");
  });
});

describe("resolveDefault", () => {
  it("fills the built-in's tokens (pictureless → section dropped)", () => {
    expect(resolveDefault(base).systemPrompt).toBe("hi\n");
  });
});

describe("resolvePictureRef", () => {
  const pictures: CompanionPicture[] = [
    { src: "blob:live", description: "d", ref: "goonpack:g00ner.aimee/1" },
  ];
  it("resolves a matching ref to its picture's src", () => {
    expect(resolvePictureRef("goonpack:g00ner.aimee/1", pictures)).toBe(
      "blob:live",
    );
  });
  it("returns null when the same name lives in a different pack", () => {
    expect(resolvePictureRef("goonpack:other.pack/1", pictures)).toBeNull();
  });
  it("never resolves a pre-goonpacks path ref", () => {
    expect(resolvePictureRef("/companions/aimee/x.jpg", pictures)).toBeNull();
  });
});
