import Link from "next/link";
import { SearchCombobox } from "@/components/SearchCombobox";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
      <h1 className="font-display text-5xl font-bold uppercase">Not playing here</h1>
      <p className="text-dim">We couldn&apos;t find that page or title. Try a search.</p>
      <div className="text-left">
        <SearchCombobox />
      </div>
      <Link href="/" className="inline-block text-accent underline">
        Back home
      </Link>
    </div>
  );
}
