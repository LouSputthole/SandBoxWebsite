import { describe, it, expect } from "vitest";
import { splitFee, usdToUsdcBaseUnits, formatUsdc, FEE_BPS } from "./fees";

describe("splitFee", () => {
  it("takes 3.6% and the parts sum back to the whole", () => {
    const amount = BigInt(100_000_000); // 100 USDC
    const { sellerAmount, feeAmount } = splitFee(amount);
    expect(feeAmount).toBe(BigInt(3_600_000)); // 3.6 USDC
    expect(sellerAmount).toBe(BigInt(96_400_000)); // 96.4 USDC
    expect(sellerAmount + feeAmount).toBe(amount);
  });

  it("never creates or loses dust on odd amounts", () => {
    const amount = BigInt(1_234_567);
    const { sellerAmount, feeAmount } = splitFee(amount);
    expect(sellerAmount + feeAmount).toBe(amount);
    expect(feeAmount).toBe((amount * BigInt(360)) / BigInt(10_000));
  });

  it("handles zero", () => {
    expect(splitFee(BigInt(0))).toEqual({ sellerAmount: BigInt(0), feeAmount: BigInt(0) });
  });

  it("rejects negative amounts and out-of-range fees", () => {
    expect(() => splitFee(BigInt(-1))).toThrow();
    expect(() => splitFee(BigInt(100), -1)).toThrow();
    expect(() => splitFee(BigInt(100), 10_001)).toThrow();
  });

  it("uses the 3.6% default", () => {
    expect(FEE_BPS).toBe(360);
  });
});

describe("usdToUsdcBaseUnits", () => {
  it("scales dollars to 6-decimal base units", () => {
    expect(usdToUsdcBaseUnits(1)).toBe(BigInt(1_000_000));
    expect(usdToUsdcBaseUnits(1.5)).toBe(BigInt(1_500_000));
    expect(usdToUsdcBaseUnits(0.01)).toBe(BigInt(10_000));
  });

  it("rounds float dust to the nearest cent", () => {
    expect(usdToUsdcBaseUnits(0.1 + 0.2)).toBe(BigInt(300_000)); // 0.30000000000000004 → 0.30
  });

  it("rejects invalid input", () => {
    expect(() => usdToUsdcBaseUnits(-1)).toThrow();
    expect(() => usdToUsdcBaseUnits(NaN)).toThrow();
  });
});

describe("formatUsdc", () => {
  it("formats base units to two decimals", () => {
    expect(formatUsdc(BigInt(1_500_000))).toBe("1.50");
    expect(formatUsdc(BigInt(96_400_000))).toBe("96.40");
    expect(formatUsdc(BigInt(0))).toBe("0.00");
  });
});
