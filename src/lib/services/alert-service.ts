import { prisma } from "@/lib/db";

export interface AlertCheckResult {
  checked: number;
  triggered: number;
  errors: string[];
}

/**
 * Post a triggered-alert message to a Discord webhook. Uses the Discord
 * embed format so the notification looks polished in-channel.
 */
async function postToDiscord(
  webhookUrl: string,
  itemName: string,
  itemSlug: string,
  currentPrice: number,
  targetPrice: number,
  direction: "below" | "above",
): Promise<void> {
  const title = `${itemName} hit $${currentPrice.toFixed(2)}`;
  const desc =
    direction === "below"
      ? `📉 Price dropped below your $${targetPrice.toFixed(2)} target.`
      : `📈 Price climbed above your $${targetPrice.toFixed(2)} target.`;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description: desc,
            url: `https://sboxskins.gg/items/${itemSlug}`,
            color: direction === "below" ? 0xef4444 : 0x22c55e,
            footer: { text: "sboxskins.gg · price alert" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`[alerts] Discord webhook failed: ${err}`);
  }
}

/**
 * Check all active price alerts against current item prices.
 * On trigger, mark alert as triggered and fire Discord webhook if configured.
 * (Email notifications still pending a proper provider integration.)
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

        console.log(
          `[alerts] Triggered: ${alert.item.name} is now $${price.toFixed(2)} ` +
            `(target: ${alert.direction} $${alert.targetPrice.toFixed(2)}) → ${alert.email ?? "(no email)"}`,
        );

        if (alert.discordWebhook) {
          await postToDiscord(
            alert.discordWebhook,
            alert.item.name,
            alert.item.slug,
            price,
            alert.targetPrice,
            alert.direction as "below" | "above",
          );
        }

        result.triggered++;
      }
    }
  } catch (error) {
    result.errors.push(`Alert check failed: ${error}`);
  }

  return result;
}
