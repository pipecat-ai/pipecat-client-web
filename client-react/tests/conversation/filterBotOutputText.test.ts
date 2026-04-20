import { filterBotOutputText } from "@/conversation/filterBotOutputText";
import type { BotOutputText } from "@/conversation/types";

const SAMPLE: BotOutputText = {
  spoken: "Hello there",
  unspoken: ", how are you?",
};

describe("filterBotOutputText", () => {
  it("returns the text unchanged when no filter is provided", () => {
    expect(filterBotOutputText(SAMPLE)).toEqual(SAMPLE);
  });

  it("returns the text unchanged for an empty filter object", () => {
    expect(filterBotOutputText(SAMPLE, {})).toEqual(SAMPLE);
  });

  it("treats spoken and unspoken as included by default", () => {
    expect(
      filterBotOutputText(SAMPLE, { spoken: true, unspoken: true })
    ).toEqual(SAMPLE);
  });

  it("zeroes out the spoken portion when spoken: false", () => {
    expect(filterBotOutputText(SAMPLE, { spoken: false })).toEqual({
      spoken: "",
      unspoken: SAMPLE.unspoken,
    });
  });

  it("zeroes out the unspoken portion when unspoken: false", () => {
    expect(filterBotOutputText(SAMPLE, { unspoken: false })).toEqual({
      spoken: SAMPLE.spoken,
      unspoken: "",
    });
  });

  it("zeroes out both portions when spoken and unspoken are both false", () => {
    expect(
      filterBotOutputText(SAMPLE, { spoken: false, unspoken: false })
    ).toEqual({ spoken: "", unspoken: "" });
  });

  it("treats an explicit true the same as default", () => {
    expect(
      filterBotOutputText(SAMPLE, { spoken: true, unspoken: false })
    ).toEqual({
      spoken: SAMPLE.spoken,
      unspoken: "",
    });
  });

  it("preserves empty-string inputs regardless of filter flags", () => {
    const empty: BotOutputText = { spoken: "", unspoken: "" };
    expect(filterBotOutputText(empty)).toEqual(empty);
    expect(filterBotOutputText(empty, { spoken: false })).toEqual(empty);
    expect(filterBotOutputText(empty, { unspoken: false })).toEqual(empty);
  });

  it("does not mutate the input object", () => {
    const input: BotOutputText = {
      spoken: SAMPLE.spoken,
      unspoken: SAMPLE.unspoken,
    };
    filterBotOutputText(input, { spoken: false, unspoken: false });
    expect(input).toEqual(SAMPLE);
  });
});
