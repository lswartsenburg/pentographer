import { describe, it, expect } from "vitest";
import { isBackwardTransition } from "../finding-transitions";

describe("isBackwardTransition", () => {
  it("returns true for confirmed → in_review", () => {
    expect(isBackwardTransition("confirmed", "in_review")).toBe(true);
  });

  it("returns true for informational → in_review", () => {
    expect(isBackwardTransition("informational", "in_review")).toBe(true);
  });

  it("returns true for false_positive → in_review", () => {
    expect(isBackwardTransition("false_positive", "in_review")).toBe(true);
  });

  it("returns true for in_review → draft", () => {
    expect(isBackwardTransition("in_review", "draft")).toBe(true);
  });

  it("returns true for confirmed → draft", () => {
    expect(isBackwardTransition("confirmed", "draft")).toBe(true);
  });

  it("returns false for draft → in_review (forward)", () => {
    expect(isBackwardTransition("draft", "in_review")).toBe(false);
  });

  it("returns false for in_review → confirmed (forward)", () => {
    expect(isBackwardTransition("in_review", "confirmed")).toBe(false);
  });

  it("returns false for draft → confirmed (forward)", () => {
    expect(isBackwardTransition("draft", "confirmed")).toBe(false);
  });

  it("returns false for same-status transitions", () => {
    expect(isBackwardTransition("draft", "draft")).toBe(false);
    expect(isBackwardTransition("confirmed", "confirmed")).toBe(false);
  });

  it("returns false for terminal status transitions", () => {
    expect(isBackwardTransition("draft", "informational")).toBe(false);
    expect(isBackwardTransition("draft", "false_positive")).toBe(false);
    expect(isBackwardTransition("in_review", "false_positive")).toBe(false);
  });
});
