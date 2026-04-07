import { prisma } from "@/lib/db";

export interface AlertCheckResult {
  checked: number;
  triggered: number;
  errors: string[];
}

/**
 * Check all active price alerts against current item prices.
 * Marks matching alerts as triggered. In production, this would
 * also send email notifications via a service like Resend or SendGrid.
 */
export async function checkPriceAlerts(): Promise<AlertCheckResult> {
  const result: AlertCheckResult = { checked: 0, triggered: 0, errors: [] };

  try {
    const alerts = await prisma.priceAlert.findMany({
      where: { active: true, triggered: false },
      include: {
        item: { select: { id: true, name: true, currentPrice: true, slug: true } },
      },
    });

    result.checked = alerts.length;

    for (const alert of alerts) {
      const price = alert.item.currentPrice;
      if (price == null) continue;

      const shouldTrigger =
        (alert.direction === "below" && price <= alert.targetPrice) ||
        (alert.direction === "above" && price >= alert.targetPrice);

      if (shouldTrigger) {
        await prisma.priceAlert.update({
          where: { id: alert.id },
          data: { triggered: true, triggeredAt: new Date(), active: false },
        });

        // Log the trigger — in production, send an email here
        console.log(
          `[alerts] Triggered: ${alert.item.name} is now $${price.toFixed(2)} ` +
          `(target: ${alert.direction} $${alert.targetPrice.toFixed(2)}) → ${alert.email}`
        );

        result.triggered++;
      }
    }
  } catch (error) {
    result.errors.push(`Alert check failed: ${error}`);
  }

  return result;
}
