import TokensClient from "./TokensClient";

export const dynamic = "force-dynamic";

export default function TokensPage() {
  return (
    <div className="route-stack">
      <header className="route-head">
        <p className="panel-kicker">Settings</p>
        <h2>API tokens</h2>
        <p className="route-copy">
          Tokens let external clients (Scriptable widgets, Apple Shortcuts, Alexa skills) call
          your dashboard API on your behalf. Treat them like passwords — copy once, store
          somewhere safe, revoke if leaked.
        </p>
      </header>
      <TokensClient />
    </div>
  );
}
