import Link from "next/link";
import { Mail, AlertCircle } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ status?: string; kind?: string }>;
}

const KIND_LABEL: Record<string, string> = {
  "friday-report": "Friday market wrap",
  "monday-outlook": "Monday outlook",
};

export default async function GoodbyePage({ searchParams }: PageProps) {
  const { status, kind } = await searchParams;

  let title = "You're unsubscribed.";
  let body =
    "We've removed your address from the list. If this was a mistake, you can re-subscribe from the homepage any time.";
  let ok = true;

  if (status === "partial" && kind) {
    title = `Unsubscribed from ${KIND_LABEL[kind] ?? kind}.`;
    body = "You're still subscribed to the other newsletters on this address.";
  } else if (status === "invalid" || status === "missing-token") {
    title = "Link didn't work.";
    body =
      "That unsubscribe link is invalid. If you're still getting our newsletters, forward one to us and we'll sort it manually.";
    ok = false;
  }

  const Icon = ok ? Mail : AlertCircle;

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <Icon
        className={`h-12 w-12 mx-auto mb-6 ${ok ? "text-purple-400" : "text-red-400"}`}
      />
      <h1 className="text-2xl font-bold text-white mb-3">{title}</h1>
      <p className="text-sm text-neutral-400 mb-8 leading-relaxed">{body}</p>
      <Link href="/" className="text-sm text-purple-300 hover:text-purple-200">
        ← Back to sboxskins.gg
      </Link>
    </div>
  );
}
