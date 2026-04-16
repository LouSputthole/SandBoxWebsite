"use client";

import { useState } from "react";
import { Bell, BellRing, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface PriceAlertFormProps {
  itemId: string;
  itemName: string;
  currentPrice: number | null;
}

export function PriceAlertForm({ itemId, itemName, currentPrice }: PriceAlertFormProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [showDiscord, setShowDiscord] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<"below" | "above">("below");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          discordWebhook: discordWebhook || undefined,
          itemId,
          targetPrice: parseFloat(targetPrice),
          direction,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create alert");
      }

      setStatus("success");
      setMessage(`Alert set! We'll notify you when ${itemName} goes ${direction} $${targetPrice}.`);
      setEmail("");
      setTargetPrice("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        Set Price Alert
      </Button>
    );
  }

  return (
    <Card className="bg-neutral-900/80 border-neutral-700">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <BellRing className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-white">Price Alert</span>
        </div>

        {status === "success" ? (
          <div className="text-sm text-emerald-400">{message}</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={!discordWebhook}
              />
            </div>

            {!showDiscord ? (
              <button
                type="button"
                onClick={() => setShowDiscord(true)}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                + Also send to Discord (optional)
              </button>
            ) : (
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  Discord Webhook URL
                  <span className="text-neutral-600 ml-1">— Server Settings → Integrations → Webhooks</span>
                </label>
                <Input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={discordWebhook}
                  onChange={(e) => setDiscordWebhook(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-neutral-500 mb-1 block">
                  Notify when price goes
                </label>
                <div className="flex rounded-lg border border-neutral-700 overflow-hidden">
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                      direction === "below"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                    onClick={() => setDirection("below")}
                  >
                    <ArrowDown className="h-3 w-3" />
                    Below
                  </button>
                  <button
                    type="button"
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                      direction === "above"
                        ? "bg-red-500/20 text-red-400"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                    onClick={() => setDirection("above")}
                  >
                    <ArrowUp className="h-3 w-3" />
                    Above
                  </button>
                </div>
              </div>

              <div className="flex-1">
                <label className="text-xs text-neutral-500 mb-1 block">Target price ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={currentPrice ? (currentPrice * 0.9).toFixed(2) : "0.00"}
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            {status === "error" && (
              <p className="text-xs text-red-400">{message}</p>
            )}

            <div className="flex gap-2">
              <Button type="submit" size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" disabled={status === "loading"}>
                {status === "loading" ? "Setting..." : "Create Alert"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setOpen(false); setStatus("idle"); setMessage(""); }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
