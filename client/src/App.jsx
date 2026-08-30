import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clipboard,
  Clock3,
  Code2,
  Film,
  Image as ImageIcon,
  LoaderCircle,
  MessageSquareText,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { mediaUrl, studioApi } from './api.js';

const ideas = [
  'A bug that only appears during the demo',
  'The intern is the only one who read the docs',
  'An AI joins the daily stand-up',
  'Production sends the developer an email',
];

const stageSteps = [
  { key: 'generating_script', label: 'Script', icon: MessageSquareText, threshold: 10 },
  { key: 'generating_image', label: 'Visual', icon: ImageIcon, threshold: 30 },
  { key: 'generating_audio', label: 'Voice', icon: Volume2, threshold: 50 },
  { key: 'writing_subtitles', label: 'Captions', icon: Code2, threshold: 68 },
  { key: 'rendering_video', label: 'Render', icon: Film, threshold: 78 },
];

const isWorking = (state) => ['queued', 'running', 'publishing'].includes(state);

function formatTime(value) {
  if (!value) return 'Just now';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function humanize(value = '') {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ConnectionPill({ active, children }) {
  return (
    <span className={`connection-pill ${active ? 'is-online' : 'is-offline'}`}>
      <span className="connection-dot" />
      {children}
    </span>
  );
}

function Header({ health, config }) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark"><Film size={22} strokeWidth={2.4} /></div>
        <div>
          <div className="brand-name">Vertical Skit Studio</div>
          <div className="brand-subtitle">{config?.channel?.brand || 'Original stories, shipped faster'}</div>
        </div>
      </div>
      <div className="header-status" aria-label="Service status">
        <ConnectionPill active={health?.ok}>API</ConnectionPill>
        <ConnectionPill active={health?.ollama?.reachable}>Ollama</ConnectionPill>
        <ConnectionPill active={config?.integrations?.huggingFace?.configured}>Hugging Face</ConnectionPill>
      </div>
    </header>
  );
}

function CreatePanel({ onCreate, busy, ready }) {
  const [topic, setTopic] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    await onCreate(topic.trim());
    setTopic('');
  };

  return (
    <section className="create-panel">
      <div className="eyebrow"><Sparkles size={14} /> New episode</div>
      <h1>Turn one idea into a finished short.</h1>
      <p>Script, scene, voice, captions, render, and platform copy—handled as one reviewable job.</p>
      <form onSubmit={submit}>
        <label htmlFor="topic">What happens in this episode?</label>
        <div className="topic-field">
          <textarea
            id="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. A developer tries to explain technical debt to the CFO"
            maxLength={300}
            rows={4}
          />
          <span>{topic.length}/300</span>
        </div>
        <button className="primary-button" type="submit" disabled={busy || !ready}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}
          {busy ? 'Worker is busy' : ready ? 'Create episode' : 'Finish setup first'}
        </button>
        <div className="form-note"><ShieldCheck size={14} /> Generation never publishes automatically.</div>
      </form>
      <div className="idea-list">
        <span>Quick starts</span>
        {ideas.map((idea) => (
          <button key={idea} type="button" onClick={() => setTopic(idea)}>{idea}<ChevronRight size={14} /></button>
        ))}
      </div>
    </section>
  );
}

function JobStateIcon({ state }) {
  if (isWorking(state)) return <LoaderCircle className="spin" size={17} />;
  if (state === 'failed' || state === 'publish_failed') return <AlertCircle size={17} />;
  return <CheckCircle2 size={17} />;
}

function JobList({ jobs, selectedId, onSelect, onRefresh, refreshing }) {
  return (
    <section className="job-list-section">
      <div className="section-heading compact">
        <div><span className="eyebrow">Production queue</span><h2>Episodes</h2></div>
        <button className="icon-button" type="button" onClick={onRefresh} aria-label="Refresh jobs">
          <RefreshCw className={refreshing ? 'spin' : ''} size={17} />
        </button>
      </div>
      <div className="job-list">
        {!jobs.length && (
          <div className="empty-list"><Circle size={18} /> Your generated episodes will appear here.</div>
        )}
        {jobs.map((job) => (
          <button
            className={`job-row ${selectedId === job.id ? 'is-selected' : ''}`}
            key={job.id}
            type="button"
            onClick={() => onSelect(job.id)}
          >
            <div className={`job-state state-${job.status.state}`}><JobStateIcon state={job.status.state} /></div>
            <div className="job-copy">
              <strong>{job.title || job.topic}</strong>
              <span>{humanize(job.status.stage)} · {formatTime(job.status.createdAt)}</span>
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </section>
  );
}

function ProgressCard({ status }) {
  return (
    <section className="progress-card">
      <div className="progress-topline">
        <div>
          <span className="live-label"><Radio size={13} /> Local worker</span>
          <h2>{status.message || humanize(status.stage)}</h2>
        </div>
        <strong>{status.progress || 0}%</strong>
      </div>
      <div className="progress-track"><span style={{ width: `${status.progress || 0}%` }} /></div>
      <div className="stage-grid">
        {stageSteps.map(({ key, label, icon: Icon, threshold }) => {
          const complete = (status.progress || 0) > threshold || status.state === 'completed';
          const current = status.stage === key;
          return (
            <div className={`stage-item ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}`} key={key}>
              <span>{complete ? <Check size={15} /> : <Icon size={15} />}</span>
              {label}
            </div>
          );
        })}
      </div>
      <p>You can leave this page open. The job continues on the API worker.</p>
    </section>
  );
}

function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value || '');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return <button className="copy-button" type="button" onClick={copy}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : label}</button>;
}

function MetadataCard({ title, value }) {
  return (
    <article className="metadata-card">
      <div><span>{title}</span><CopyButton value={value} /></div>
      <p>{value}</p>
    </article>
  );
}

function ContentReview({ content }) {
  const [view, setView] = useState('copy');
  if (!content) return null;
  const { metadata } = content;
  return (
    <section className="review-section">
      <div className="section-heading">
        <div><span className="eyebrow">Review package</span><h2>Story & publishing copy</h2></div>
        <div className="segmented-control">
          <button className={view === 'copy' ? 'active' : ''} onClick={() => setView('copy')} type="button">Metadata</button>
          <button className={view === 'script' ? 'active' : ''} onClick={() => setView('script')} type="button">Dialogue</button>
        </div>
      </div>
      {view === 'copy' ? (
        <div className="metadata-grid">
          <MetadataCard title="YouTube title" value={metadata.youtubeTitle} />
          <MetadataCard title="YouTube description" value={metadata.youtubeDescription} />
          <MetadataCard title="TikTok caption" value={metadata.tiktokCaption} />
          <MetadataCard title="Facebook description" value={metadata.facebookDescription} />
          <article className="metadata-card hashtag-card">
            <div><span>Hashtag set</span><CopyButton value={metadata.hashtags.join(' ')} /></div>
            <div className="hashtag-list">{metadata.hashtags.map((tag) => <b key={tag}>{tag}</b>)}</div>
          </article>
        </div>
      ) : (
        <div className="dialogue-list">
          <div className="concept-note"><Zap size={16} /><div><strong>Hook</strong><p>{content.hook}</p></div></div>
          {content.dialogue.map((line, index) => (
            <div className="dialogue-line" key={`${line.character}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{line.character}</strong>
              <p>{line.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlatformIcon({ platform }) {
  if (platform === 'youtube') return <Play size={17} fill="currentColor" />;
  if (platform === 'tiktok') return <Zap size={18} />;
  return <span className="facebook-letter">f</span>;
}

function PublishingPanel({ job, config, onPublish, submitting }) {
  const available = config?.publishingPlatforms || ['youtube', 'tiktok', 'facebook'];
  const [selected, setSelected] = useState(available);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    setSelected(available);
    setApproved(false);
  }, [job.id, available.join(',')]);

  const toggle = (platform) => setSelected((current) => current.includes(platform)
    ? current.filter((item) => item !== platform)
    : [...current, platform]);

  return (
    <section className="publish-card">
      <div className="publish-heading">
        <div className="publish-icon"><Send size={20} /></div>
        <div><span className="eyebrow">Distribution</span><h2>Publish this episode</h2></div>
      </div>
      {config?.safety?.dryRun && (
        <div className="safety-banner"><ShieldCheck size={16} /><span><strong>Dry run is on.</strong> No platform API will be called.</span></div>
      )}
      <div className="platform-options">
        {available.map((platform) => {
          const details = config?.integrations?.[platform];
          const checked = selected.includes(platform);
          const prior = job.publishResults?.[platform];
          return (
            <label className={`platform-option ${checked ? 'is-checked' : ''}`} key={platform}>
              <input type="checkbox" checked={checked} onChange={() => toggle(platform)} />
              <span className="platform-symbol"><PlatformIcon platform={platform} /></span>
              <span className="platform-name">{humanize(platform)}<small>{prior?.ok ? 'Uploaded' : details?.configured ? details.visibility : 'Needs credentials'}</small></span>
              {prior?.ok ? <CheckCircle2 className="platform-check" size={19} /> : <span className="fake-check"><Check size={13} /></span>}
            </label>
          );
        })}
      </div>
      <label className="approval-check">
        <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
        <span><Check size={13} /></span>
        I watched the complete video and verified its script, visuals, audio, and disclosures.
      </label>
      <button
        className="publish-button"
        type="button"
        disabled={!approved || !selected.length || submitting}
        onClick={() => onPublish(selected, approved)}
      >
        {submitting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
        {config?.safety?.dryRun ? 'Test publishing flow' : `Send to ${selected.length} platform${selected.length === 1 ? '' : 's'}`}
      </button>
    </section>
  );
}

function ConfigurationCard({ config, health }) {
  const integrations = config?.integrations || {};
  const ollamaReady = Boolean(health?.ollama?.reachable && health?.ollama?.modelInstalled);
  return (
    <section className="configuration-card">
      <div className="section-heading compact">
        <div><span className="eyebrow">System</span><h2>Connections</h2></div>
        <Settings2 size={18} />
      </div>
      <div className="connection-list">
        <div><span><Code2 size={16} />Ollama</span><b className={ollamaReady ? 'good' : 'warn'}>{ollamaReady ? 'Ready' : health?.ollama?.reachable ? 'Model missing' : 'Offline'}</b></div>
        {Object.entries(integrations).filter(([key]) => key !== 'ollama').map(([key, value]) => (
          <div key={key}><span>{humanize(key)}</span><b className={value.configured ? 'good' : 'muted'}>{value.configured ? 'Ready' : 'Setup needed'}</b></div>
        ))}
      </div>
      <a href="/api/docs/setup" target="_blank" rel="noreferrer">Open setup documentation <ArrowUpRight size={14} /></a>
    </section>
  );
}

function EmptyWorkspace() {
  return (
    <section className="empty-workspace">
      <div className="empty-visual">
        <div className="phone-outline"><Play size={28} fill="currentColor" /></div>
        <span className="spark spark-one">✦</span><span className="spark spark-two">✦</span>
      </div>
      <span className="eyebrow">Your studio is ready</span>
      <h2>Create an episode to see the full review workspace.</h2>
      <p>The finished video, dialogue, descriptions, hashtags, and platform controls will appear here.</p>
    </section>
  );
}

function JobWorkspace({ job, config, health, onPublish, publishing }) {
  if (!job) return <EmptyWorkspace />;
  const failed = ['failed', 'publish_failed'].includes(job.status.state);
  const working = isWorking(job.status.state);
  return (
    <div className="workspace-content">
      <div className="workspace-titlebar">
        <div>
          <span className="eyebrow"><Clock3 size={13} /> {formatTime(job.status.createdAt)}</span>
          <h1>{job.content?.metadata?.youtubeTitle || job.topic}</h1>
          <p>{job.content?.concept || job.status.message}</p>
        </div>
        <span className={`status-badge state-${job.status.state}`}><JobStateIcon state={job.status.state} />{humanize(job.status.state)}</span>
      </div>

      {failed && <div className="error-banner"><AlertCircle size={18} /><div><strong>{job.status.message}</strong><p>{job.status.error}</p></div></div>}
      {working && job.status.state !== 'publishing' && <ProgressCard status={job.status} />}

      {job.artifacts?.video && (
        <div className="review-layout">
          <section className="video-card">
            <div className="video-frame">
              <video controls preload="metadata" poster={mediaUrl(job.artifacts.image)} src={mediaUrl(job.artifacts.video)} />
            </div>
            <div className="video-details">
              <span><Film size={15} /> 1080 × 1920</span>
              <span><Clock3 size={15} /> {job.manifest?.durationSeconds || 60}s</span>
              <a href={mediaUrl(job.artifacts.video)} download><ArrowUpRight size={15} /> Open file</a>
            </div>
          </section>
          <div className="review-side">
            <PublishingPanel job={job} config={config} onPublish={onPublish} submitting={publishing} />
            <ConfigurationCard config={config} health={health} />
          </div>
        </div>
      )}
      <ContentReview content={job.content} />
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [config, setConfig] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const activeJob = useMemo(() => jobs.find((job) => isWorking(job.status.state)), [jobs]);
  const generationReady = Boolean(
    health?.ollama?.reachable &&
    health?.ollama?.modelInstalled &&
    config?.integrations?.huggingFace?.configured,
  );

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    try {
      const listing = await studioApi.jobs();
      setJobs(listing.jobs);
      setSelectedId((current) => current || listing.jobs[0]?.id || null);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([studioApi.health(), studioApi.configuration(), studioApi.jobs()])
      .then(([healthResult, configResult, listing]) => {
        setHealth(healthResult);
        setConfig(configResult);
        setJobs(listing.jobs);
        setSelectedId(listing.jobs[0]?.id || null);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedJob(null);
      return undefined;
    }
    let cancelled = false;
    const load = () => studioApi.job(selectedId)
      .then((job) => { if (!cancelled) setSelectedJob(job); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    load();
    const interval = window.setInterval(() => {
      load();
      refresh({ quiet: true });
    }, 2500);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [selectedId, refresh]);

  const create = async (topic) => {
    setCreating(true);
    try {
      const job = await studioApi.createJob(topic);
      setSelectedId(job.id);
      setSelectedJob(job);
      await refresh({ quiet: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCreating(false);
    }
  };

  const publish = async (platforms, approved) => {
    setPublishing(true);
    try {
      const job = await studioApi.publishJob(selectedId, platforms, approved);
      setSelectedJob(job);
      await refresh({ quiet: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="app-shell">
      <Header health={health} config={config} />
      {health && (!health.ollama?.reachable || !health.ollama?.modelInstalled) && (
        <div className="global-notice"><AlertCircle size={16} /><span>{health.ollama?.reachable ? `Ollama is running, but ${config?.integrations?.ollama?.model || 'the configured model'} is not installed.` : 'Ollama is offline. Start it before creating an episode.'}</span></div>
      )}
      {error && (
        <div className="global-error"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError('')} type="button">Dismiss</button></div>
      )}
      <main className="studio-layout">
        <aside className="studio-sidebar">
          <CreatePanel onCreate={create} busy={creating || Boolean(activeJob)} ready={generationReady} />
          <JobList
            jobs={jobs}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRefresh={() => refresh()}
            refreshing={refreshing}
          />
          <ConfigurationCard config={config} health={health} />
        </aside>
        <section className="workspace">
          <JobWorkspace job={selectedJob} config={config} health={health} onPublish={publish} publishing={publishing} />
        </section>
      </main>
      <footer><span>Vertical Skit Studio</span><span>Local-first · Human-reviewed · Original by design</span></footer>
    </div>
  );
}
