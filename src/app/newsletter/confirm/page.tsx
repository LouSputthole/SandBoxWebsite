import Link from "next/link";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const MESSAGES: Record<string, { title: string; body: string; ok: boolean }> = {
  verified: {
    title: "You're in.",
    body: "Your subscription is confirmed. Next newsletter drops Monday morning — unsubscribe link is in every email.",
    ok: true,
  },
  "already-verified": {
    title: "Already confirmed.",
    body: "This address is already verified. Nothing to do.",
    ok: true,
  },
  invalid: {
    title: "Link didn't work.",
    body: "That verification link is invalid or has already been used. If you signed up more than 24h ago, request a fresh one from the homepage.",
    ok: false,
  },
  "missing-token": {
    title: "Missing verification token.",
    body: "The link you followed didn't include a verification token. Try clicking the link from your email again.",
    ok: false,
  },
};

export default async function ConfirmPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const msg = MESSAGES[status ?? ""] ?? MESSAGES.invalid;
  const Icon = msg.ok ? CheckCircle2 : AlertCircle;

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <Icon
        className={`h-12 w-12 mx-auto mb-6 ${msg.ok ? "text-purple-400" : "text-red-400"}`}
      />
      <h1 className="text-2xl font-bold text-white mb-3">{msg.title}</h1>
      <p className="text-sm text-neutral-400 mb-8 leading-relaxed">
        {msg.body}
      </p>
      <Link
        href="/"
        className="text-sm text-purple-300 hover:text-purple-200"
      >
        ← Back to sboxskins.gg
      </Link>
    </div>
  );
}
