import type { StageName } from "@shared/types";
import type { StageFn } from "../types";
import { sourceSearchStage } from "./01-source-search";
import { placesDiscoverStage } from "./02-places-discover";
import { atsMineStage } from "./03-ats-mine";
import { normalizeStage } from "./04-normalize";
import { classifyStage } from "./05-classify";
import { enrichStage } from "./06-enrich";
import { doneStage } from "./07-done";

export function getStages(): [StageName, StageFn][] {
  return [
    ["source_search", sourceSearchStage],
    ["places_discover", placesDiscoverStage],
    ["ats_mine", atsMineStage],
    ["normalize", normalizeStage],
    ["classify", classifyStage],
    ["enrich", enrichStage],
    ["done", doneStage],
  ];
}
