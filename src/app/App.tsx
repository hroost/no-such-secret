import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { decryptSecret } from "../crypto/decrypt";
import { encryptSecret } from "../crypto/encrypt";
import { parseFragment } from "../crypto/fragment";
import { asArrayBuffer, encodeBase64Url } from "../crypto/base64url";
import { DEFAULT_TTL_SECONDS, MAX_PLAINTEXT_BYTES, TTL_OPTIONS } from "../shared/limits";
import type { Audience, EncryptedMetadata, Mode } from "../shared/contracts";
import { routeScope, secretPath } from "../shared/routes";
import "./styles.css";

type Content = { metadata: EncryptedMetadata; bytes: Uint8Array };
const labels: Record<number, string> = { 3600: "1 hour", 86400: "24 hours", 259200: "3 days", 604800: "7 days" };
type AppConfig = {
  appName: string;
  organizationName?: string;
  supportUrl?: string;
  logoUrl?: string;
  faviconUrl?: string;
  accentColor: string;
  publicBaseUrl: string;
  maxPlaintextBytes: number;
  defaultTtlSeconds: number;
  allowedTtlSeconds: number[];
};

const defaultConfig: AppConfig = { appName: "NoSuchSecret", accentColor: "#1554b9", publicBaseUrl: location.origin, maxPlaintextBytes: MAX_PLAINTEXT_BYTES, defaultTtlSeconds: DEFAULT_TTL_SECONDS, allowedTtlSeconds: [...TTL_OPTIONS] };
const ConfigContext = createContext(defaultConfig);
const useConfig = () => useContext(ConfigContext);

function api(path: string, init?: RequestInit) { return fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store", credentials: "same-origin" }); }
function copy(value: string) { return navigator.clipboard.writeText(value); }
function safeFilename(value: string): string { return [...value].map((character) => character < " " || "\\/:*?\"<>|".includes(character) ? "_" : character).join("").replace(/^\.+$/, "file").slice(0, 180) || "file"; }
function baseUrl(config: AppConfig): string { return config.publicBaseUrl.replace(/\/$/, ""); }
function sizeLabel(bytes: number): string { return bytes >= 1024 * 1024 ? `${Math.floor(bytes / 1024 / 1024)} MiB` : `${Math.floor(bytes / 1024)} KiB`; }

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState(defaultConfig);
  useEffect(() => {
    void fetch("/api/config", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => { if (response.ok) setConfig(await response.json() as AppConfig); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.title = config.organizationName ? `${config.appName} · ${config.organizationName}` : config.appName;
    document.documentElement.style.setProperty("--accent", config.accentColor);
    if (config.faviconUrl) {
      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!favicon) { favicon = document.createElement("link"); favicon.rel = "icon"; document.head.appendChild(favicon); }
      favicon.href = config.faviconUrl;
    }
  }, [config]);
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const config = useConfig();
  return <main><header><a className="brand" href="/">{config.logoUrl && <img src={config.logoUrl} alt="" />}{config.appName}</a><span>{config.organizationName ?? "Share it once. Then it never existed."}</span></header>{children}<footer>Client-side encrypted · One-time reveal · No telemetry{config.supportUrl && <> · <a href={config.supportUrl}>Support</a></>}</footer></main>;
}

function Home() {
  return <Shell><section className="hero"><p className="eyebrow">SECURE ONE-TIME SHARING</p><h1>Share a secret. Once.</h1><p className="lead">Your content is encrypted in this browser. The decryption key never reaches the service.</p></section><section className="choices"><a className="card primary" href="/share"><h2>Share a secret</h2><p>Send text or one file securely with an explicit, one-time reveal.</p><b>Create secure link →</b></a><a className="card" href="/request"><h2>Request a secret</h2><p>Let someone securely send information back to you.</p><b>Create request link →</b></a></section></Shell>;
}

function Scope({ audience, onChange, action }: { audience: Audience; onChange: (value: Audience) => void; action: "share" | "request" }) {
  return <fieldset><legend>{action === "share" ? "Recipient" : "Request from"}</legend><label><input type="radio" checked={audience === "internal"} onChange={() => onChange("internal")} /> Company member</label><label><input type="radio" checked={audience === "external"} onChange={() => onChange("external")} /> External person</label><p className="hint">{audience === "internal" ? "Company Access is required for this link." : action === "share" ? "Anyone with the unguessable link may reveal it once." : "Anyone with the unguessable submission link may send one encrypted response."}</p></fieldset>;
}

function Expiry({ value, onChange }: { value: number; onChange: (value: number) => void }) { const config = useConfig(); return <label>Expires after<select value={value} onChange={(event) => onChange(Number(event.target.value))}>{config.allowedTtlSeconds.map((seconds) => <option key={seconds} value={seconds}>{labels[seconds] ?? `${seconds} seconds`}</option>)}</select></label>; }

function ContentLimits({ kind }: { kind: "text" | "file" }) {
  const config = useConfig();
  const maximum = sizeLabel(config.maxPlaintextBytes);
  return <p id="content-limits" className="hint">{kind === "file" ? `One file, up to ${maximum}. Any file type. ZIP multiple files together within this limit.` : `Up to ${maximum} of text, measured in UTF-8 bytes rather than characters.`}</p>;
}

export function LinkResult({ link, kind }: { link: string; kind: "share" | "request" | "submission" }) {
  const [copied, setCopied] = useState(false);
  const heading = kind === "request" ? "Send this request link" : kind === "share" ? "Send this secure link" : "Return this secure link";
  const description = kind === "request" ? "It accepts exactly one encrypted submission." : kind === "share" ? "Send this link to your recipient. They can reveal the secret once." : "Send this link back to the person who requested the secret. The submission link cannot be used again.";
  return <Shell><section className="panel success"><p className="eyebrow">{kind === "request" ? "REQUEST CREATED" : "ENCRYPTED UPLOAD COMPLETE"}</p><h1>{heading}</h1><p>{description}</p><code>{link}</code><button onClick={() => void copy(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy secure link"}</button></section></Shell>;
}

function CreateShare() {
  const config = useConfig();
  const [audience, setAudience] = useState<Audience>("internal"); const [ttl, setTtl] = useState(DEFAULT_TTL_SECONDS); const [kind, setKind] = useState<"text" | "file">("text");
  const [text, setText] = useState(""); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [link, setLink] = useState("");
  useEffect(() => setTtl(config.defaultTtlSeconds), [config.defaultTtlSeconds]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    let content: Content;
    if (kind === "text") { const bytes = new TextEncoder().encode(text); content = { metadata: { kind: "text" }, bytes }; }
    else if (file) content = { metadata: { kind: "file", filename: file.name, mimeType: file.type || "application/octet-stream" }, bytes: new Uint8Array(await file.arrayBuffer()) };
    else { setError("Choose a file."); return; }
    if (!content.bytes.byteLength) { setError("Enter text or choose a non-empty file."); return; }
    if (content.bytes.byteLength > config.maxPlaintextBytes) { setError(`The maximum size is ${sizeLabel(config.maxPlaintextBytes)}.`); return; }
    setBusy(true);
    try {
      const encrypted = await encryptSecret(content.metadata, content.bytes);
      const response = await api("/api/internal/shares", { method: "POST", body: JSON.stringify({ audience, ttlSeconds: ttl, ...encrypted.upload }) });
      const created = await response.json().catch(() => null) as { id?: string } | null;
      if (!response.ok || !created?.id) throw new Error("Unable to create secure link.");
      setLink(`${baseUrl(config)}${secretPath(audience, "share", created.id)}#${encrypted.fragment}`);
    } catch { setError("Unable to create the secure link. Please try again."); } finally { setBusy(false); }
  }
  if (link) return <LinkResult link={link} kind="share" />;
  return <Shell><section className="panel"><p className="eyebrow">CREATE A SHARE</p><h1>Share a secret</h1><form onSubmit={submit}><Scope action="share" audience={audience} onChange={setAudience} /><fieldset><legend>Content</legend><label><input type="radio" checked={kind === "text"} onChange={() => setKind("text")} /> Text</label><label><input type="radio" checked={kind === "file"} onChange={() => setKind("file")} /> File</label><ContentLimits kind={kind} />{kind === "text" ? <textarea aria-describedby="content-limits" value={text} onChange={(event) => setText(event.target.value)} placeholder="Enter the secret…" maxLength={MAX_PLAINTEXT_BYTES} /> : <input type="file" aria-describedby="content-limits" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />}</fieldset><Expiry value={ttl} onChange={setTtl} />{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? "Encrypting…" : "Create secure link"}</button></form></section></Shell>;
}

function CreateRequest() {
  const config = useConfig();
  const [audience, setAudience] = useState<Audience>("internal"); const [ttl, setTtl] = useState(DEFAULT_TTL_SECONDS); const [link, setLink] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => setTtl(config.defaultTtlSeconds), [config.defaultTtlSeconds]);
  async function submit(event: React.FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { const response = await api("/api/internal/requests", { method: "POST", body: JSON.stringify({ audience, ttlSeconds: ttl }) }); const data = await response.json().catch(() => null) as { id?: string } | null; if (!response.ok || !data?.id) throw new Error(); setLink(`${baseUrl(config)}${secretPath(audience, "request", data.id)}`); } catch { setError("Unable to create request link."); } finally { setBusy(false); } }
  if (link) return <LinkResult link={link} kind="request" />;
  return <Shell><section className="panel"><p className="eyebrow">CREATE A REQUEST</p><h1>Request a secret</h1><form onSubmit={submit}><Scope action="request" audience={audience} onChange={setAudience} /><Expiry value={ttl} onChange={setTtl} />{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? "Creating…" : "Create request link"}</button></form></section></Shell>;
}

function SubmitRequest({ audience, id }: { audience: Audience; id: string }) {
  const config = useConfig();
  const [kind, setKind] = useState<"text" | "file">("text"); const [text, setText] = useState(""); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(""); const [link, setLink] = useState(""); const [busy, setBusy] = useState(false); const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { void fetch(`/api/${routeScope(audience)}/requests/${id}/status`, { cache: "no-store", credentials: "same-origin" }).then(async (response) => { const value = await response.json().catch(() => null) as { status?: string } | null; setUnavailable(!response.ok || value?.status !== "open"); }).catch(() => setUnavailable(true)); }, [audience, id]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); let content: Content;
    if (kind === "text") content = { metadata: { kind: "text" }, bytes: new TextEncoder().encode(text) };
    else if (file) content = { metadata: { kind: "file", filename: file.name, mimeType: file.type || "application/octet-stream" }, bytes: new Uint8Array(await file.arrayBuffer()) };
    else { setError("Choose a file."); return; }
    if (!content.bytes.byteLength || content.bytes.byteLength > config.maxPlaintextBytes) { setError(`Use a non-empty secret no larger than ${sizeLabel(config.maxPlaintextBytes)}.`); return; }
    setBusy(true); try { const encrypted = await encryptSecret(content.metadata, content.bytes); const response = await api(`/api/${routeScope(audience)}/requests/${id}/submit`, { method: "POST", body: JSON.stringify(encrypted.upload) }); if (!response.ok) throw new Error(); setLink(`${baseUrl(config)}/internal/request/${id}#${encrypted.fragment}`); } catch { setError("This secure request is no longer accepting submissions."); } finally { setBusy(false); }
  }
  if (link) return <LinkResult link={link} kind="submission" />;
  if (unavailable) return <Shell><section className="panel warning"><h1>Request unavailable</h1><p>This secure request is no longer accepting submissions.</p></section></Shell>;
  return <Shell><section className="panel"><p className="eyebrow">SECURE SUBMISSION</p><h1>Send a secret</h1><p>Your content is encrypted in this browser before it is sent.</p><form onSubmit={submit}><fieldset><legend>Content</legend><label><input type="radio" checked={kind === "text"} onChange={() => setKind("text")} /> Text</label><label><input type="radio" checked={kind === "file"} onChange={() => setKind("file")} /> File</label><ContentLimits kind={kind} />{kind === "text" ? <textarea aria-describedby="content-limits" value={text} onChange={(event) => setText(event.target.value)} placeholder="Enter the secret…" /> : <input type="file" aria-describedby="content-limits" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />}</fieldset>{error && <p className="error">{error}</p>}<button disabled={busy}>{busy ? "Encrypting…" : "Send secure secret"}</button></form></section></Shell>;
}

function RevealedText({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  return <><textarea readOnly value={visible ? value : "••••••••"} aria-label="Revealed secret" /><div className="actions"><button onClick={() => setVisible((current) => !current)}>{visible ? "Hide" : "Show"} secret</button><button onClick={() => void copy(value)}>Copy secret</button></div></>;
}

function Reveal({ audience, mode, id }: { audience: Audience; mode: Mode; id: string }) {
  const [result, setResult] = useState<Content | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const fragment = useMemo(() => { try { return parseFragment(location.hash); } catch { return null; } }, []);
  async function reveal() { if (!fragment) { setError("This secure link is incomplete or invalid."); return; } setBusy(true); setError(""); try { const response = await api(`/api/${routeScope(audience)}/${mode}s/${id}/reveal`, { method: "POST", body: JSON.stringify({ claim: encodeBase64Url(fragment.claim) }) }); const nonce = response.headers.get("x-secret-nonce"); if (!response.ok || !nonce) throw new Error(); const content = await decryptSecret(fragment.key, nonce, new Uint8Array(await response.arrayBuffer())); setResult({ metadata: content.metadata, bytes: content.content }); } catch { setError("This secret is unavailable or could not be decrypted."); } finally { setBusy(false); } }
  if (result) { if (result.metadata.kind === "file") { const blob = new Blob([asArrayBuffer(result.bytes)], { type: result.metadata.mimeType }); const href = URL.createObjectURL(blob); return <Shell><section className="panel success"><h1>Secret revealed</h1><p>The server-side secret is now consumed.</p><a className="button" href={href} download={safeFilename(result.metadata.filename)}>Download {safeFilename(result.metadata.filename)}</a></section></Shell>; } const value = new TextDecoder().decode(result.bytes); return <Shell><section className="panel success"><h1>Secret revealed</h1><p>The server-side secret is now consumed.</p><RevealedText value={value} /></section></Shell>; }
  return <Shell><section className="panel warning"><p className="eyebrow">ONE-TIME REVEAL</p><h1>Reveal secret</h1><p>This can only be done once. After revealing, it cannot be retrieved again.</p>{error && <p className="error">{error}</p>}<button onClick={() => void reveal()} disabled={busy}>{busy ? "Revealing…" : "Reveal secret"}</button></section></Shell>;
}

function subscribeToHashChange(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function App() {
  const hash = useSyncExternalStore(subscribeToHashChange, () => location.hash);
  const match = location.pathname.match(/^\/(internal|public)\/(share|request)\/([A-Za-z0-9_-]+)$/);
  if (!match) return location.pathname === "/share" ? <CreateShare /> : location.pathname === "/request" ? <CreateRequest /> : <Home />;
  const audience: Audience = match[1] === "public" ? "external" : "internal"; const mode = match[2] as Mode; const id = match[3]!;
  return hash ? <Reveal key={hash} audience={audience} mode={mode} id={id} /> : mode === "request" ? <SubmitRequest audience={audience} id={id} /> : <Reveal audience={audience} mode={mode} id={id} />;
}


