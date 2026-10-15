import { AlexaSim } from "@/components/AlexaSim";

export const metadata = { title: "Ask by voice" };

export default function AlexaPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl font-bold uppercase">Ask by voice</h1>
      <p className="max-w-2xl text-sm text-dim">
        A simulated Alexa+ experience. Your voice is turned into text by your browser, and every request is a real call to our MCP server at <code>/mcp</code>, the same tools an Alexa+ device uses. In the simulation, picking which tool to call is done with simple phrase matching; on a real device, Alexa+ decides.
      </p>
      <AlexaSim />
      <details className="text-sm text-dim">
        <summary className="cursor-pointer">Things to say</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>What should we watch tonight?</li>
          <li>Something funny, under two hours.</li>
          <li>How good is Dune Part Two?</li>
          <li>Thumbs up for The Bear. (then: Yes)</li>
          <li>Something for both of us. My partner loved Paddington 2.</li>
          <li>Link my profile, code 123456.</li>
        </ul>
      </details>
    </div>
  );
}
